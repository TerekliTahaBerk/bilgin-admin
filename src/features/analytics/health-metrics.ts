import {
  courseScopes,
  exerciseTypes,
  publishStatuses,
  type CourseScope,
  type ExerciseType,
  type PublishStatus,
} from "@/contracts/admin/content";
import type { CourseTopicsData } from "@/contracts/admin/exercise-editor";
import type { DistributionEntry } from "@/features/analytics/analytics-aggregations";
import {
  courseScopeLabels,
  exerciseTypeLabels,
  publishStatusLabels,
} from "@/features/content/content-labels";
import {
  indexSnapshot,
  type ContentSnapshot,
} from "@/features/content/content-snapshot";
import { DIFFICULTY_LEVELS } from "@/features/content/exercise-filters";

/**
 * A unit with at least one but at most this many ACTIVE (non-archived)
 * questions — counted from the list the scan actually read — is listed as
 * "few questions". A content-volume signal for this screen only: it says
 * nothing about publishability, which only the backend's per-node preview
 * and publish gate can decide.
 */
export const LOW_UNIT_EXERCISE_MAX = 10;

/**
 * Topic coverage is judged against the other topics of the same subject:
 * "low" is under half of the subject's median non-zero count, "high" is over
 * twice it. Relative bands keep the signal meaningful whatever the size of
 * the catalogue. Product thresholds again, not backend rules.
 */
export const LOW_TOPIC_COVERAGE_RATIO = 0.5;
export const HIGH_TOPIC_COVERAGE_RATIO = 2;

export type StatusCounts = Readonly<Record<PublishStatus, number>>;

function statusCounts(
  items: readonly { status: PublishStatus }[],
): StatusCounts {
  const counts = Object.fromEntries(
    publishStatuses.map((status) => [status, 0]),
  ) as Record<PublishStatus, number>;

  for (const item of items) counts[item.status] += 1;

  return counts;
}

export function statusDistribution(counts: StatusCounts): DistributionEntry[] {
  return publishStatuses.map((status) => ({
    id: status,
    label: publishStatusLabels[status],
    value: counts[status],
  }));
}

/** One subject's topics, from the first course that reported them. */
export type SubjectTopics = Readonly<{
  subjectId: number;
  /** A course of this subject, for linking. */
  courseId: number;
  courseName: string;
  topics: CourseTopicsData["topics"];
}>;

/**
 * Courses of the same subject report the same topic list (topics belong to
 * the subject), so the lists are de-duplicated by `subject_id`.
 */
export function topicsBySubject(
  lists: readonly CourseTopicsData[],
): SubjectTopics[] {
  const seen = new Map<number, SubjectTopics>();

  for (const list of lists) {
    if (!seen.has(list.subject_id)) {
      seen.set(list.subject_id, {
        subjectId: list.subject_id,
        courseId: list.course.id,
        courseName: list.course.name,
        topics: list.topics,
      });
    }
  }

  return [...seen.values()];
}

export type TopicCoverage = "none" | "low" | "normal" | "high";

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

export type TopicCoverageRow = Readonly<{
  subject: SubjectTopics;
  topic: SubjectTopics["topics"][number];
  coverage: TopicCoverage;
  /** The subject's median non-zero count the band was judged against. */
  median: number;
}>;

/** Classifies every topic by the backend's own `exercise_count`. */
export function topicCoverage(
  subjects: readonly SubjectTopics[],
): TopicCoverageRow[] {
  return subjects.flatMap((subject) => {
    const counts = subject.topics
      .map((topic) => topic.exercise_count)
      .filter((count) => count > 0);
    const middle = counts.length === 0 ? 0 : median(counts);

    return subject.topics.map((topic): TopicCoverageRow => {
      const count = topic.exercise_count;
      const coverage: TopicCoverage =
        count === 0
          ? "none"
          : count < middle * LOW_TOPIC_COVERAGE_RATIO
            ? "low"
            : count > middle * HIGH_TOPIC_COVERAGE_RATIO
              ? "high"
              : "normal";

      return { subject, topic, coverage, median: middle };
    });
  });
}

export type HealthMetrics = Readonly<{
  courses: Readonly<{
    total: number;
    byStatus: StatusCounts;
    /** Backend `unit_count` = 0. */
    withoutUnits: number;
  }>;
  units: Readonly<{
    total: number;
    byStatus: StatusCounts;
    /** Backend `exercise_count` = 0. */
    withoutExercises: number;
    /** Backend `node_count` = 0. */
    withoutNodes: number;
    /** Sum of backend `node_count`. */
    totalNodes: number;
    /** 1..LOW_UNIT_EXERCISE_MAX active (non-archived) scanned questions. */
    fewExercises: number;
  }>;
  exercises: Readonly<{
    total: number;
    byStatus: StatusCounts;
    byType: readonly DistributionEntry[];
    byDifficulty: readonly DistributionEntry[];
    byScope: readonly DistributionEntry[];
    unattempted: number;
    needsReview: number;
    edited: number;
  }>;
  /** `null` until the topic lists are loaded. */
  topics: Readonly<{
    total: number;
    withoutExercises: number;
    lowCoverage: number;
    highCoverage: number;
  }> | null;
}>;

/**
 * Active (non-archived) questions per unit, from the scanned lists. Units
 * whose list could not be read are absent: their count is unknown, not 0.
 */
export function activeExerciseCounts(
  snapshot: ContentSnapshot,
): ReadonlyMap<number, number> {
  const readUnits = indexSnapshot(snapshot).scannedUnitIds;
  const counts = new Map<number, number>(
    [...readUnits].map((unitId) => [unitId, 0]),
  );

  for (const exercise of snapshot.exercises) {
    if (exercise.status !== "archived" && counts.has(exercise.unitId)) {
      counts.set(exercise.unitId, (counts.get(exercise.unitId) ?? 0) + 1);
    }
  }

  return counts;
}

export function hasFewActiveExercises(
  activeCount: number | undefined,
): boolean {
  return (
    activeCount !== undefined &&
    activeCount > 0 &&
    activeCount <= LOW_UNIT_EXERCISE_MAX
  );
}

/**
 * Counts over a scan snapshot. Every count reads a backend field as-is
 * (status, `unit_count`, `exercise_count`, `node_count`, `stats.*`,
 * `version`); nothing is re-derived from other fields.
 */
export function computeHealthMetrics(
  snapshot: ContentSnapshot,
  topics: readonly TopicCoverageRow[] | null,
): HealthMetrics {
  const typeCounts = new Map<ExerciseType, number>();
  const difficultyCounts = new Map<number, number>();
  const scopeCounts = new Map<CourseScope, number>();
  const active = activeExerciseCounts(snapshot);
  let unattempted = 0;
  let needsReview = 0;
  let edited = 0;

  for (const exercise of snapshot.exercises) {
    typeCounts.set(exercise.type, (typeCounts.get(exercise.type) ?? 0) + 1);
    difficultyCounts.set(
      exercise.difficulty,
      (difficultyCounts.get(exercise.difficulty) ?? 0) + 1,
    );
    for (const scope of exercise.scopes) {
      scopeCounts.set(scope, (scopeCounts.get(scope) ?? 0) + 1);
    }
    if (exercise.stats.attempts === 0) unattempted += 1;
    if (exercise.stats.needs_review) needsReview += 1;
    if (exercise.version > 1) edited += 1;
  }

  return {
    courses: {
      total: snapshot.courses.length,
      byStatus: statusCounts(snapshot.courses),
      withoutUnits: snapshot.courses.filter((course) => course.unit_count === 0)
        .length,
    },
    units: {
      total: snapshot.units.length,
      byStatus: statusCounts(snapshot.units),
      withoutExercises: snapshot.units.filter(
        (unit) => unit.exercise_count === 0,
      ).length,
      withoutNodes: snapshot.units.filter((unit) => unit.node_count === 0)
        .length,
      totalNodes: snapshot.units.reduce(
        (sum, unit) => sum + unit.node_count,
        0,
      ),
      fewExercises: snapshot.units.filter((unit) =>
        hasFewActiveExercises(active.get(unit.id)),
      ).length,
    },
    exercises: {
      total: snapshot.exercises.length,
      byStatus: statusCounts(snapshot.exercises),
      // Fixed enum order, zeros kept: an empty bar is itself a finding.
      byType: exerciseTypes.map((type) => ({
        id: type,
        label: exerciseTypeLabels[type],
        value: typeCounts.get(type) ?? 0,
      })),
      byDifficulty: DIFFICULTY_LEVELS.map((level) => ({
        id: String(level),
        label: `Zorluk ${level}`,
        value: difficultyCounts.get(level) ?? 0,
      })),
      // An exercise can carry several scopes, so these add up to more than
      // the total on purpose.
      byScope: courseScopes.map((scope) => ({
        id: scope,
        label: courseScopeLabels[scope],
        value: scopeCounts.get(scope) ?? 0,
      })),
      unattempted,
      needsReview,
      edited,
    },
    topics:
      topics === null
        ? null
        : {
            total: topics.length,
            withoutExercises: topics.filter((row) => row.coverage === "none")
              .length,
            lowCoverage: topics.filter((row) => row.coverage === "low").length,
            highCoverage: topics.filter((row) => row.coverage === "high")
              .length,
          },
  };
}
