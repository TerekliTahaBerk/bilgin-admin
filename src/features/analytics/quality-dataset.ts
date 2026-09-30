import {
  publishStatuses,
  type Course,
  type ExerciseListItem,
  type ExerciseTopic,
  type PublishStatus,
  type Unit,
  type UnitExercisesData,
} from "@/contracts/admin/content";

/**
 * Correct-rate bands the Quality Center uses for its "çok düşük" / "çok
 * yüksek" segments and summary tiles. They are descriptive bands for sorting
 * and browsing only — they are NOT a review decision. Whether a question needs
 * review is the backend's `stats.needs_review`, and nothing in this module
 * recomputes or overrides it.
 */
export const LOW_CORRECT_RATE_MAX = 30;
export const HIGH_CORRECT_RATE_MIN = 90;

/**
 * One exercise list row, placed in its course and unit. The exercise fields
 * are the backend list item verbatim; only the location is added, and it
 * comes from the course/unit lists the same backend returned.
 */
export type QualityRow = ExerciseListItem &
  Readonly<{
    course: Readonly<{ id: number; name: string }>;
    unit: Readonly<{ id: number; title: string }>;
  }>;

/** A unit the dataset knows about, with the course it belongs to. */
export type KnownUnit = Readonly<{ courseId: number; unit: Unit }>;

/** An unfiltered exercise list for one unit, as held in the query cache. */
export type LoadedUnitExercises = Readonly<{
  unitId: number;
  data: UnitExercisesData;
}>;

/**
 * Joins exercise lists to their unit and course. A list is only used when the
 * unit is known from a course-units list — otherwise there is no course to
 * link to, and a row that cannot be opened is not worth showing. A list whose
 * `unit.id` does not match the unit it was requested for is dropped for the
 * same reason the unit browser refuses to render it.
 */
export function buildQualityRows(
  courses: readonly Course[],
  units: readonly KnownUnit[],
  lists: readonly LoadedUnitExercises[],
): QualityRow[] {
  const courseNames = new Map(
    courses.map((course) => [course.id, course.name]),
  );
  const unitCourse = new Map(
    units.map(({ courseId, unit }) => [unit.id, courseId]),
  );
  const rows: QualityRow[] = [];

  for (const { unitId, data } of lists) {
    const courseId = unitCourse.get(unitId);
    const courseName =
      courseId === undefined ? undefined : courseNames.get(courseId);

    if (
      courseId === undefined ||
      courseName === undefined ||
      data.unit.id !== unitId
    ) {
      continue;
    }

    for (const exercise of data.exercises) {
      rows.push({
        ...exercise,
        course: { id: courseId, name: courseName },
        unit: { id: data.unit.id, title: data.unit.title },
      });
    }
  }

  return rows;
}

export function isUnsolved(row: ExerciseListItem): boolean {
  return row.stats.attempts === 0;
}

export function hasLowCorrectRate(row: ExerciseListItem): boolean {
  return (
    row.stats.correct_rate !== null &&
    row.stats.correct_rate <= LOW_CORRECT_RATE_MAX
  );
}

export function hasHighCorrectRate(row: ExerciseListItem): boolean {
  return (
    row.stats.correct_rate !== null &&
    row.stats.correct_rate >= HIGH_CORRECT_RATE_MIN
  );
}

export type QualitySummary = Readonly<{
  total: number;
  needsReview: number;
  unsolved: number;
  highRate: number;
  lowRate: number;
  edited: number;
  byStatus: Readonly<Record<PublishStatus, number>>;
}>;

/** One pass over the rows; every count reads a backend field as-is. */
export function summarizeQuality(rows: readonly QualityRow[]): QualitySummary {
  const byStatus = Object.fromEntries(
    publishStatuses.map((status) => [status, 0]),
  ) as Record<PublishStatus, number>;
  let needsReview = 0;
  let unsolved = 0;
  let highRate = 0;
  let lowRate = 0;
  let edited = 0;

  for (const row of rows) {
    if (row.stats.needs_review) needsReview += 1;
    if (isUnsolved(row)) unsolved += 1;
    if (hasHighCorrectRate(row)) highRate += 1;
    if (hasLowCorrectRate(row)) lowRate += 1;
    if (row.version > 1) edited += 1;
    byStatus[row.status] += 1;
  }

  return {
    total: rows.length,
    needsReview,
    unsolved,
    highRate,
    lowRate,
    edited,
    byStatus,
  };
}

/** Distinct topics among the rows, sorted the way the unit browser sorts them. */
export function qualityTopicOptions(
  rows: readonly QualityRow[],
): ExerciseTopic[] {
  const byId = new Map<number, ExerciseTopic>();

  for (const row of rows) {
    if (!byId.has(row.topic.id)) byId.set(row.topic.id, row.topic);
  }

  return [...byId.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "tr"),
  );
}

export type ScanCoverage = Readonly<{
  /** Units in scope, from the backend's own `unit_count`/unit lists. */
  totalUnits: number;
  /** Units whose full exercise list is loaded, or that have no exercises. */
  scannedUnits: number;
  /** Courses in scope whose unit list has not been loaded at all yet. */
  unlistedCourses: number;
}>;

/**
 * How much of the scope has actually been read. A unit counts as scanned when
 * its unfiltered exercise list is loaded, or when the backend's own unit list
 * says it has no exercises (there is nothing to fetch). Totals use each
 * course's `unit_count` until that course's unit list is known.
 */
export function scanCoverage(
  courses: readonly Course[],
  unitsByCourse: ReadonlyMap<number, readonly Unit[]>,
  loadedUnitIds: ReadonlySet<number>,
  scope: Readonly<{ courseId?: number; unitId?: number }> = {},
): ScanCoverage {
  const scopedCourses =
    scope.courseId === undefined
      ? courses
      : courses.filter((course) => course.id === scope.courseId);
  let totalUnits = 0;
  let scannedUnits = 0;
  let unlistedCourses = 0;

  for (const course of scopedCourses) {
    const units = unitsByCourse.get(course.id);

    if (units === undefined) {
      unlistedCourses += 1;
      totalUnits += scope.unitId === undefined ? course.unit_count : 1;
      continue;
    }

    for (const unit of units) {
      if (scope.unitId !== undefined && unit.id !== scope.unitId) continue;

      totalUnits += 1;
      if (unit.exercise_count === 0 || loadedUnitIds.has(unit.id)) {
        scannedUnits += 1;
      }
    }
  }

  return { totalUnits, scannedUnits, unlistedCourses };
}
