import {
  courseScopes,
  exerciseTypes,
  publishStatuses,
  type ExerciseType,
  type PublishStatus,
} from "@/contracts/admin/content";
import {
  countByPublishStatus,
  type DistributionEntry,
} from "@/features/analytics/analytics-aggregations";
import {
  courseScopeLabels,
  exerciseTypeLabels,
} from "@/features/content/content-labels";
import type {
  ContentSnapshot,
  SnapshotExercise,
} from "@/features/content/content-snapshot";

/*
 | Question Performance Explorer — aggregations over the full-scan snapshot.
 |
 | Source of truth: the backend's per-question `stats`, computed in
 | ExerciseController::stats from `answer_attempts`:
 |
 |   attempts     = count(*)
 |   correct_rate = round(correct / attempts * 100)   (null when attempts = 0)
 |   avg_seconds  = round(avg(elapsed_ms) / 1000)     (null with no timings)
 |
 | Nothing here re-derives or overrides a per-question value; the frontend only
 | groups them. Two kinds of average are reported for every group, because
 | they answer different questions:
 |
 | - Weighted (the headline): Σ(correct_rate × attempts) / Σ attempts — the
 |   share of all answers in the group that were correct. Since correct_rate is
 |   the backend's rounded correct/attempts, correct_rate × attempts / 100
 |   recovers each question's correct count to within half an answer, so the
 |   group rate is off by at most 0.5 percentage points. One heavily solved
 |   question dominates it, which is right for "how do students do here".
 | - Unweighted: the plain mean of the per-question rates — "how does a
 |   typical question in the group do". A question with 3 attempts counts as
 |   much as one with 3 000, which is why the minimum-sample filter matters.
 |
 | Average time is weighted the same way, by attempts. The backend averages
 | `elapsed_ms` only over attempts that recorded a time, so weighting by all
 | attempts is an approximation when some attempts carry no timing.
 |
 | Questions with no attempts never enter a rate or time average: there is
 | nothing to average (their correct_rate is null, not zero).
 */

/** Minimum-attempt choices offered by the sample-size filter. */
export const MIN_ATTEMPT_OPTIONS = [1, 5, 10, 20, 50, 100] as const;
export type MinAttempts = (typeof MIN_ATTEMPT_OPTIONS)[number];
export const DEFAULT_MIN_ATTEMPTS: MinAttempts = 1;
/**
 * The backend's own review rule only judges a rate after 20 attempts
 * (`needs_review`), so that floor is marked in the filter.
 */
export const BACKEND_REVIEW_MIN_ATTEMPTS = 20;

/** Rows per ranking table. */
export const RANKING_SIZE = 20;

export const DIFFICULTY_LEVELS = [1, 2, 3, 4, 5] as const;

export type PerformanceFilters = Readonly<{
  courseId?: number;
  status?: PublishStatus;
  minAttempts: MinAttempts;
}>;

export const DEFAULT_PERFORMANCE_FILTERS: PerformanceFilters = {
  minAttempts: DEFAULT_MIN_ATTEMPTS,
};

/** Questions in scope (course, status): what the count distributions read. */
export function questionPopulation(
  snapshot: ContentSnapshot,
  filters: PerformanceFilters,
): SnapshotExercise[] {
  return snapshot.exercises.filter(
    (exercise) =>
      (filters.courseId === undefined ||
        exercise.courseId === filters.courseId) &&
      (filters.status === undefined || exercise.status === filters.status),
  );
}

/**
 * Questions that enter the performance analyses: solved at least
 * `minAttempts` times (and never fewer than once), with a backend rate.
 */
export function measuredQuestions(
  population: readonly SnapshotExercise[],
  minAttempts: number,
): SnapshotExercise[] {
  const floor = Math.max(1, minAttempts);

  return population.filter(
    (exercise) =>
      exercise.stats.attempts >= floor && exercise.stats.correct_rate !== null,
  );
}

export type Aggregate = Readonly<{
  /** Questions that contributed. */
  questions: number;
  /** Their attempts. */
  attempts: number;
  /** Attempt-weighted mean; null when nothing contributed. */
  weighted: number | null;
  /** Plain mean of the per-question values; null when nothing contributed. */
  unweighted: number | null;
}>;

function aggregate(
  items: readonly SnapshotExercise[],
  value: (exercise: SnapshotExercise) => number | null,
): Aggregate {
  let questions = 0;
  let attempts = 0;
  let weightedSum = 0;
  let plainSum = 0;

  for (const exercise of items) {
    const measure = value(exercise);
    if (measure === null || exercise.stats.attempts === 0) continue;

    questions += 1;
    attempts += exercise.stats.attempts;
    weightedSum += measure * exercise.stats.attempts;
    plainSum += measure;
  }

  return {
    questions,
    attempts,
    weighted: attempts === 0 ? null : weightedSum / attempts,
    unweighted: questions === 0 ? null : plainSum / questions,
  };
}

export function correctRateAggregate(
  items: readonly SnapshotExercise[],
): Aggregate {
  return aggregate(items, (exercise) => exercise.stats.correct_rate);
}

export function avgSecondsAggregate(
  items: readonly SnapshotExercise[],
): Aggregate {
  return aggregate(items, (exercise) => exercise.stats.avg_seconds);
}

export type GroupPerformance<K> = Readonly<{
  key: K;
  label: string;
  correctRate: Aggregate;
  avgSeconds: Aggregate;
}>;

function groupPerformance<K>(
  measured: readonly SnapshotExercise[],
  keys: readonly K[],
  keyOf: (exercise: SnapshotExercise) => K,
  label: (key: K) => string,
): GroupPerformance<K>[] {
  const groups = new Map<K, SnapshotExercise[]>(keys.map((key) => [key, []]));

  for (const exercise of measured) groups.get(keyOf(exercise))?.push(exercise);

  return keys.map((key) => {
    const items = groups.get(key) ?? [];

    return {
      key,
      label: label(key),
      correctRate: correctRateAggregate(items),
      avgSeconds: avgSecondsAggregate(items),
    };
  });
}

export function difficultyLabel(level: number): string {
  return `Zorluk ${level}`;
}

/** Every level 1–5, in order; a level with no data stays as "no data". */
export function performanceByDifficulty(
  measured: readonly SnapshotExercise[],
): GroupPerformance<number>[] {
  return groupPerformance(
    measured,
    DIFFICULTY_LEVELS,
    (exercise) => exercise.difficulty,
    difficultyLabel,
  );
}

/** Only the types that have questions in scope, in the backend enum order. */
export function performanceByType(
  measured: readonly SnapshotExercise[],
  population: readonly SnapshotExercise[],
): GroupPerformance<ExerciseType>[] {
  const present = new Set(population.map((exercise) => exercise.type));

  return groupPerformance(
    measured,
    exerciseTypes.filter((type) => present.has(type)),
    (exercise) => exercise.type,
    (type) => exerciseTypeLabels[type],
  );
}

/**
 * Total attempts per type. A volume, not a rate: it reads every question in
 * scope, so the minimum-sample filter does not apply.
 */
export function attemptsByType(
  population: readonly SnapshotExercise[],
): DistributionEntry[] {
  const totals = new Map<ExerciseType, number>();

  for (const exercise of population) {
    totals.set(
      exercise.type,
      (totals.get(exercise.type) ?? 0) + exercise.stats.attempts,
    );
  }

  return exerciseTypes
    .filter((type) => totals.has(type))
    .map((type) => ({
      id: type,
      label: exerciseTypeLabels[type],
      value: totals.get(type) ?? 0,
    }))
    .sort((a, b) => b.value - a.value);
}

/** Question count per topic, most first; ties by name. */
export function countByTopic(
  population: readonly SnapshotExercise[],
): DistributionEntry[] {
  const topics = new Map<number, { name: string; count: number }>();

  for (const exercise of population) {
    const entry = topics.get(exercise.topic.id);
    if (entry === undefined) {
      topics.set(exercise.topic.id, { name: exercise.topic.name, count: 1 });
    } else {
      entry.count += 1;
    }
  }

  return [...topics.entries()]
    .map(([id, entry]) => ({
      id: String(id),
      label: entry.name,
      value: entry.count,
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "tr"));
}

export function countByStatus(
  population: readonly SnapshotExercise[],
): DistributionEntry[] {
  return countByPublishStatus(population);
}

/**
 * Question count per exam scope. A question can belong to several scopes and
 * is counted in each, so the bars may add up to more than the question
 * count. Questions with no scope get their own bar.
 */
export const NO_SCOPE_ID = "none";

export function countByScope(
  population: readonly SnapshotExercise[],
): DistributionEntry[] {
  const counts = new Map<string, number>();

  for (const exercise of population) {
    const keys = exercise.scopes.length === 0 ? [NO_SCOPE_ID] : exercise.scopes;
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [
    ...courseScopes
      .filter((scope) => counts.has(scope))
      .map((scope) => ({
        id: scope,
        label: courseScopeLabels[scope],
        value: counts.get(scope) ?? 0,
      })),
    ...(counts.has(NO_SCOPE_ID)
      ? [
          {
            id: NO_SCOPE_ID,
            label: "Kapsamı yok",
            value: counts.get(NO_SCOPE_ID) ?? 0,
          },
        ]
      : []),
  ];
}

export function countByDifficulty(
  population: readonly SnapshotExercise[],
): DistributionEntry[] {
  return DIFFICULTY_LEVELS.map((level) => ({
    id: String(level),
    label: difficultyLabel(level),
    value: population.filter((exercise) => exercise.difficulty === level)
      .length,
  }));
}

export const rankingKinds = [
  "most_attempts",
  "lowest_rate",
  "highest_rate",
  "longest_time",
  "shortest_time",
] as const;
export type RankingKind = (typeof rankingKinds)[number];

export const rankingTitles: Readonly<Record<RankingKind, string>> = {
  most_attempts: `En çok çözülen ${RANKING_SIZE} soru`,
  lowest_rate: "En düşük doğru oranı",
  highest_rate: "En yüksek doğru oranı",
  longest_time: "En uzun ortalama süre",
  shortest_time: "En kısa ortalama süre",
};

const byAttemptsThenId = (a: SnapshotExercise, b: SnapshotExercise) =>
  b.stats.attempts - a.stats.attempts || a.id - b.id;

/**
 * The top `RANKING_SIZE` measured questions for a ranking. Ties fall back to
 * the larger sample first (the more trustworthy value), then the id, so the
 * order is stable across renders.
 */
export function rankQuestions(
  measured: readonly SnapshotExercise[],
  kind: RankingKind,
): SnapshotExercise[] {
  const rate = (exercise: SnapshotExercise) => exercise.stats.correct_rate ?? 0;
  const seconds = (exercise: SnapshotExercise) =>
    exercise.stats.avg_seconds ?? 0;
  const timed = measured.filter(
    (exercise) => exercise.stats.avg_seconds !== null,
  );

  const sorted = (() => {
    switch (kind) {
      case "most_attempts":
        return [...measured].sort(byAttemptsThenId);
      case "lowest_rate":
        return [...measured].sort(
          (a, b) => rate(a) - rate(b) || byAttemptsThenId(a, b),
        );
      case "highest_rate":
        return [...measured].sort(
          (a, b) => rate(b) - rate(a) || byAttemptsThenId(a, b),
        );
      case "longest_time":
        return timed.sort(
          (a, b) => seconds(b) - seconds(a) || byAttemptsThenId(a, b),
        );
      case "shortest_time":
        return timed.sort(
          (a, b) => seconds(a) - seconds(b) || byAttemptsThenId(a, b),
        );
    }
  })();

  return sorted.slice(0, RANKING_SIZE);
}

export type PerformanceReport = Readonly<{
  population: number;
  /** In scope but never attempted. */
  unattempted: number;
  /** Attempted, but below the minimum sample. */
  belowSample: number;
  measured: number;
  overall: Readonly<{ correctRate: Aggregate; avgSeconds: Aggregate }>;
  byDifficulty: GroupPerformance<number>[];
  byType: GroupPerformance<ExerciseType>[];
  attemptsByType: DistributionEntry[];
  countByTopic: DistributionEntry[];
  countByStatus: DistributionEntry[];
  countByScope: DistributionEntry[];
  countByDifficulty: DistributionEntry[];
  rankings: Readonly<Record<RankingKind, SnapshotExercise[]>>;
}>;

export function buildPerformanceReport(
  snapshot: ContentSnapshot,
  filters: PerformanceFilters,
): PerformanceReport {
  const population = questionPopulation(snapshot, filters);
  const measured = measuredQuestions(population, filters.minAttempts);
  const unattempted = population.filter(
    (exercise) => exercise.stats.attempts === 0,
  ).length;

  return {
    population: population.length,
    unattempted,
    belowSample: population.length - unattempted - measured.length,
    measured: measured.length,
    overall: {
      correctRate: correctRateAggregate(measured),
      avgSeconds: avgSecondsAggregate(measured),
    },
    byDifficulty: performanceByDifficulty(measured),
    byType: performanceByType(measured, population),
    attemptsByType: attemptsByType(population),
    countByTopic: countByTopic(population),
    countByStatus: countByStatus(population),
    countByScope: countByScope(population),
    countByDifficulty: countByDifficulty(population),
    rankings: Object.fromEntries(
      rankingKinds.map((kind) => [kind, rankQuestions(measured, kind)]),
    ) as Record<RankingKind, SnapshotExercise[]>,
  };
}

/* ------------------------------------------------------------- format -- */

export function formatPercent(value: number | null): string {
  return value === null ? "—" : `%${Math.round(value)}`;
}

export function formatSeconds(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)} sn`;
}

/* ---------------------------------------------------------------- URL -- */

function parseId(value: string | null): number | undefined {
  if (value === null || !/^[1-9]\d{0,9}$/.test(value)) return undefined;
  return Number(value);
}

export function parsePerformanceFilters(
  params: URLSearchParams,
): PerformanceFilters {
  const min = Number(params.get("min"));
  const status = params.get("status");

  return {
    courseId: parseId(params.get("course")),
    status: publishStatuses.find((item) => item === status),
    minAttempts:
      MIN_ATTEMPT_OPTIONS.find((option) => option === min) ??
      DEFAULT_MIN_ATTEMPTS,
  };
}

export function serializePerformanceFilters(
  filters: PerformanceFilters,
): string {
  const params = new URLSearchParams();

  if (filters.courseId !== undefined) {
    params.set("course", String(filters.courseId));
  }
  if (filters.status !== undefined) params.set("status", filters.status);
  if (filters.minAttempts !== DEFAULT_MIN_ATTEMPTS) {
    params.set("min", String(filters.minAttempts));
  }

  return params.toString();
}
