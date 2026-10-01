import type {
  Course,
  Unit,
  UnitExercisesData,
} from "@/contracts/admin/content";
import { runWithConcurrency } from "@/lib/async/run-with-concurrency";
import { toApiError, type ApiError } from "@/lib/api/error";
import { shouldHaltBatch } from "@/lib/api/retry-policy";

/**
 * Requests kept in flight at once. There is no bulk "whole catalogue"
 * endpoint on the backend, so a scan is the same per-course and per-unit list
 * requests the browsers make, repeated — bounded so a large catalogue never
 * turns into hundreds of simultaneous requests.
 */
export const CONTENT_SCAN_CONCURRENCY = 5;

export type ScanUnitRef = Readonly<{
  courseId: number;
  unitId: number;
  title: string;
}>;

/**
 * What to read. `courses: "all"` starts from the course list itself (a full
 * scan); a list of ids starts from those courses' unit lists; `units` are
 * read directly, without listing their course.
 */
export type ContentScanTarget = Readonly<{
  courses: "all" | readonly number[];
  units: readonly ScanUnitRef[];
}>;

export type ContentScanFailure =
  | Readonly<{ kind: "courses"; error: ApiError }>
  | Readonly<{ kind: "course"; courseId: number; error: ApiError }>
  | Readonly<{
      kind: "unit";
      courseId: number;
      unitId: number;
      title: string;
      error: ApiError;
    }>;

export type ContentScanPhase = "courses" | "units" | "exercises";

export type ContentScanProgress = Readonly<{
  phase: ContentScanPhase;
  courses: Readonly<{ total: number | null; scanned: number }>;
  /**
   * `total` is exact once every course's unit list is read; before that it
   * adds the backend's own `unit_count` for courses not listed yet, or is
   * `null` when there is nothing to estimate from.
   */
  units: Readonly<{ total: number | null; scanned: number }>;
  /** Exercises found so far. */
  exercises: number;
  failed: number;
}>;

export type ScannedUnitList = Readonly<{
  courseId: number;
  units: readonly Unit[];
}>;

export type ScannedExerciseList = Readonly<{
  courseId: number;
  unitId: number;
  data: UnitExercisesData;
}>;

export type ContentScanResult = Readonly<{
  status: "completed" | "cancelled" | "halted";
  /** The course list, when this run read it (`courses: "all"`). */
  courses: readonly Course[] | null;
  unitLists: readonly ScannedUnitList[];
  exerciseLists: readonly ScannedExerciseList[];
  failures: readonly ContentScanFailure[];
  /** Set when the run stopped early because going on could not help. */
  haltError: ApiError | null;
}>;

export type ContentScanDependencies = Readonly<{
  loadCourses: () => Promise<readonly Course[]>;
  loadUnits: (courseId: number) => Promise<readonly Unit[]>;
  loadExercises: (unitId: number) => Promise<UnitExercisesData>;
  onProgress: (progress: ContentScanProgress) => void;
  signal?: AbortSignal;
  concurrency?: number;
  /**
   * Skip units whose backend `exercise_count` is 0. A targeted refresh may
   * use it to save requests; a full scan does not — it reads every unit, so
   * the snapshot never rests on a count it did not verify.
   */
  skipEmptyUnits?: boolean;
}>;

const mismatchedUnitError: ApiError = {
  kind: "contract",
  status: null,
  message: "Sunucu başka bir ünitenin sorularını döndürdü.",
};

/**
 * Reads courses → units → exercises with bounded concurrency.
 *
 * One failing course or unit does not stop the rest; each failure is
 * reported with enough context to retry just that piece. A failure that
 * applies to every remaining request (an expired session, a rate limit)
 * stops the run instead. Aborting the signal stops scheduling; anything that
 * fails because it was aborted is not reported as a failure.
 */
export async function runContentScan(
  target: ContentScanTarget,
  deps: ContentScanDependencies,
): Promise<ContentScanResult> {
  const concurrency = deps.concurrency ?? CONTENT_SCAN_CONCURRENCY;
  const failures: ContentScanFailure[] = [];
  const unitLists: ScannedUnitList[] = [];
  const exerciseLists: ScannedExerciseList[] = [];
  let courses: readonly Course[] | null = null;
  let haltError: ApiError | null = null;
  const isAborted = () => deps.signal?.aborted ?? false;
  const stop = () => haltError !== null || isAborted();

  const record = (
    raw: unknown,
    failure: (error: ApiError) => ContentScanFailure,
  ) => {
    // A request torn down by the abort is not a failure of the content.
    if (isAborted()) return;

    const error = toApiError(raw);

    if (shouldHaltBatch(error)) haltError ??= error;
    else failures.push(failure(error));
  };

  let phase: ContentScanPhase = "courses";
  let courseIds: readonly number[] =
    target.courses === "all" ? [] : target.courses;
  let coursesScanned = 0;
  let unitsScanned = 0;
  let exercisesFound = 0;
  const queued = new Map<number, ScanUnitRef>();
  for (const unit of target.units) queued.set(unit.unitId, unit);

  const unitsTotal = (): number | null => {
    if (phase === "exercises") return queued.size;
    // Nothing is known about units before the course list arrives.
    if (phase === "courses") return null;

    const listed = new Set(unitLists.map((list) => list.courseId));
    let total = queued.size;
    let known = true;

    for (const courseId of courseIds) {
      if (listed.has(courseId)) continue;

      const count = courses?.find(
        (course) => course.id === courseId,
      )?.unit_count;
      if (count === undefined) known = false;
      else total += count;
    }

    return known ? total : null;
  };

  const report = () =>
    deps.onProgress({
      phase,
      courses: {
        total:
          phase === "courses" && target.courses === "all"
            ? null
            : courseIds.length,
        scanned: coursesScanned,
      },
      units: { total: unitsTotal(), scanned: unitsScanned },
      exercises: exercisesFound,
      failed: failures.length,
    });

  if (target.courses === "all") {
    report();

    try {
      courses = await deps.loadCourses();
      courseIds = courses.map((course) => course.id);
    } catch (raw) {
      record(raw, (error) => ({ kind: "courses", error }));
    }
  }

  if (!stop()) {
    phase = "units";
    report();

    await runWithConcurrency(
      courseIds,
      concurrency,
      async (courseId) => {
        try {
          const units = await deps.loadUnits(courseId);
          unitLists.push({ courseId, units });

          for (const unit of units) {
            if (deps.skipEmptyUnits && unit.exercise_count === 0) continue;
            if (!queued.has(unit.id)) {
              queued.set(unit.id, {
                courseId,
                unitId: unit.id,
                title: unit.title,
              });
            }
          }
        } catch (raw) {
          record(raw, (error) => ({ kind: "course", courseId, error }));
        }

        coursesScanned += 1;
        report();
      },
      stop,
    );
  }

  if (!stop()) {
    phase = "exercises";
    report();

    await runWithConcurrency(
      [...queued.values()],
      concurrency,
      async (unit) => {
        try {
          const data = await deps.loadExercises(unit.unitId);

          // The unit browser refuses a list for another unit; so does a scan.
          if (data.unit.id !== unit.unitId) throw mismatchedUnitError;

          exerciseLists.push({
            courseId: unit.courseId,
            unitId: unit.unitId,
            data,
          });
          exercisesFound += data.exercises.length;
        } catch (raw) {
          record(raw, (error) => ({ kind: "unit", ...unit, error }));
        }

        unitsScanned += 1;
        report();
      },
      stop,
    );
  }

  return {
    status:
      haltError !== null ? "halted" : isAborted() ? "cancelled" : "completed",
    courses,
    unitLists,
    exerciseLists,
    failures,
    haltError,
  };
}

/** The part of a run that still needs reading. */
export function retryTargetFor(
  failures: readonly ContentScanFailure[],
): ContentScanTarget {
  if (failures.some((failure) => failure.kind === "courses")) {
    return { courses: "all", units: [] };
  }

  return {
    courses: failures.flatMap((failure) =>
      failure.kind === "course" ? [failure.courseId] : [],
    ),
    units: failures.flatMap((failure) =>
      failure.kind === "unit"
        ? [
            {
              courseId: failure.courseId,
              unitId: failure.unitId,
              title: failure.title,
            },
          ]
        : [],
    ),
  };
}

/**
 * Share of the expected requests that have finished: the course list (on a
 * full scan), one unit list per course and one exercise list per unit.
 * `null` while the expected total is not known yet.
 */
export function scanCompletion(
  progress: ContentScanProgress,
  fullScan: boolean,
): number | null {
  if (progress.courses.total === null || progress.units.total === null) {
    return progress.phase === "courses" ? 0 : null;
  }

  const expected =
    (fullScan ? 1 : 0) + progress.courses.total + progress.units.total;
  const done =
    (fullScan && progress.phase !== "courses" ? 1 : 0) +
    progress.courses.scanned +
    progress.units.scanned;

  return expected === 0 ? 1 : Math.min(1, done / expected);
}
