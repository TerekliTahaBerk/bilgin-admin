import type { Course, ExerciseListItem, Unit } from "@/contracts/admin/content";
import type {
  ContentScanFailure,
  ContentScanResult,
} from "@/features/content/content-scan";

export type SnapshotUnit = Unit & Readonly<{ courseId: number }>;
export type SnapshotExercise = ExerciseListItem &
  Readonly<{ courseId: number; unitId: number }>;

/**
 * The whole catalogue as one scan read it: flat entity lists joined by ids,
 * in the backend's own order (courses by `sort_order`, units by course then
 * `sort_order`, exercises by unit then id). Every field is a backend field;
 * the only additions are the `courseId`/`unitId` foreign keys, taken from the
 * request each list answered.
 *
 * `status: "partial"` means some course or unit could not be read; `errors`
 * says which. A partial snapshot is never presented as a complete one.
 */
export type ContentSnapshot = Readonly<{
  generatedAt: string;
  status: "complete" | "partial";
  courses: readonly Course[];
  units: readonly SnapshotUnit[];
  exercises: readonly SnapshotExercise[];
  errors: readonly ContentScanFailure[];
}>;

function assemble(
  courses: readonly Course[],
  unitsByCourse: ReadonlyMap<number, readonly Unit[]>,
  exercisesByUnit: ReadonlyMap<number, readonly ExerciseListItem[]>,
  errors: readonly ContentScanFailure[],
  generatedAt: string,
): ContentSnapshot {
  const units: SnapshotUnit[] = [];
  const exercises: SnapshotExercise[] = [];

  for (const course of courses) {
    for (const unit of unitsByCourse.get(course.id) ?? []) {
      units.push({ ...unit, courseId: course.id });

      for (const exercise of exercisesByUnit.get(unit.id) ?? []) {
        exercises.push({ ...exercise, courseId: course.id, unitId: unit.id });
      }
    }
  }

  return {
    generatedAt,
    status: errors.length === 0 ? "complete" : "partial",
    courses,
    units,
    exercises,
    errors,
  };
}

/**
 * Builds a snapshot from a full scan. Returns `null` when the run could not
 * produce one: it did not read the course list, or it was cancelled or
 * halted part-way (that data is incomplete for reasons other than a
 * per-item failure, and is not worth keeping as "the catalogue").
 */
export function buildSnapshot(
  result: ContentScanResult,
  generatedAt: string,
): ContentSnapshot | null {
  if (result.status !== "completed" || result.courses === null) return null;

  return assemble(
    result.courses,
    new Map(result.unitLists.map((list) => [list.courseId, list.units])),
    new Map(
      result.exerciseLists.map((list) => [list.unitId, list.data.exercises]),
    ),
    result.failures,
    generatedAt,
  );
}

/**
 * Folds a retry run into an existing snapshot. A retried course replaces that
 * course's units (and their exercises are taken from the retry); a retried
 * unit replaces that unit's exercises. The errors become the ones the retry
 * still reported plus any error it did not touch.
 */
export function mergeSnapshot(
  previous: ContentSnapshot,
  retry: ContentScanResult,
  generatedAt: string,
): ContentSnapshot {
  if (retry.courses !== null) {
    return buildSnapshot(retry, generatedAt) ?? previous;
  }

  // Snapshot entities are supersets of the backend shapes; `assemble`
  // re-derives their foreign keys, so they can be passed back in as they are.
  const indexed = indexSnapshot(previous);

  const unitsByCourse = new Map<number, readonly Unit[]>(indexed.unitsByCourse);
  const exercisesByUnit = new Map<number, readonly ExerciseListItem[]>(
    indexed.exercisesByUnit,
  );

  for (const list of retry.unitLists)
    unitsByCourse.set(list.courseId, list.units);
  for (const list of retry.exerciseLists) {
    exercisesByUnit.set(list.unitId, list.data.exercises);
  }

  const retriedCourses = new Set(retry.unitLists.map((list) => list.courseId));
  const retriedUnits = new Set(retry.exerciseLists.map((list) => list.unitId));
  const untouched = previous.errors.filter(
    (error) =>
      !(error.kind === "course" && retriedCourses.has(error.courseId)) &&
      !(error.kind === "unit" && retriedUnits.has(error.unitId)) &&
      // The retry itself reports whatever is still failing.
      !retry.failures.some((failure) => sameTarget(failure, error)),
  );

  return assemble(
    previous.courses,
    unitsByCourse,
    exercisesByUnit,
    [...untouched, ...retry.failures],
    generatedAt,
  );
}

function sameTarget(a: ContentScanFailure, b: ContentScanFailure): boolean {
  if (a.kind === "course" && b.kind === "course")
    return a.courseId === b.courseId;
  if (a.kind === "unit" && b.kind === "unit") return a.unitId === b.unitId;
  return a.kind === "courses" && b.kind === "courses";
}

export type SnapshotIndex = Readonly<{
  courseById: ReadonlyMap<number, Course>;
  /**
   * Units whose exercise list this snapshot actually read — an empty unit
   * included, a unit whose read failed excluded.
   */
  scannedUnitIds: ReadonlySet<number>;
  unitsByCourse: ReadonlyMap<number, readonly SnapshotUnit[]>;
  exercisesByUnit: ReadonlyMap<number, readonly SnapshotExercise[]>;
}>;

/** Lookups the consuming screens need, built once per snapshot. */
export function indexSnapshot(snapshot: ContentSnapshot): SnapshotIndex {
  const unitsByCourse = new Map<number, SnapshotUnit[]>();
  const exercisesByUnit = new Map<number, SnapshotExercise[]>();

  for (const unit of snapshot.units) {
    const list = unitsByCourse.get(unit.courseId);
    if (list === undefined) unitsByCourse.set(unit.courseId, [unit]);
    else list.push(unit);
  }

  for (const exercise of snapshot.exercises) {
    const list = exercisesByUnit.get(exercise.unitId);
    if (list === undefined) exercisesByUnit.set(exercise.unitId, [exercise]);
    else list.push(exercise);
  }

  const failedUnitIds = new Set(
    snapshot.errors.flatMap((error) =>
      error.kind === "unit" ? [error.unitId] : [],
    ),
  );

  return {
    courseById: new Map(snapshot.courses.map((course) => [course.id, course])),
    scannedUnitIds: new Set(
      snapshot.units
        .map((unit) => unit.id)
        .filter((unitId) => !failedUnitIds.has(unitId)),
    ),
    unitsByCourse,
    exercisesByUnit,
  };
}

/**
 * Rough serialized size, in bytes. Used to justify — and test — why the
 * snapshot stays in memory instead of web storage: a catalogue of a few
 * thousand questions already crosses the ~5 MB sessionStorage quota some
 * browsers enforce, and a failed write there is silent data loss.
 */
export function snapshotByteSize(snapshot: ContentSnapshot): number {
  return new TextEncoder().encode(JSON.stringify(snapshot)).length;
}
