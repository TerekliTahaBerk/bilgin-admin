import type {
  ExerciseListItem,
  ExerciseTopic,
} from "@/contracts/admin/content";
import type {
  DifficultyLevel,
  ExerciseClientFilters,
} from "@/features/content/exercise-filters";

/**
 * Applies the filters the backend does not: topic and difficulty. Returns a new
 * array — the query cache's data is never mutated.
 */
export function applyClientFilters(
  exercises: readonly ExerciseListItem[],
  filters: ExerciseClientFilters,
): ExerciseListItem[] {
  return exercises.filter((exercise) => {
    if (
      filters.topicId !== undefined &&
      exercise.topic.id !== filters.topicId
    ) {
      return false;
    }

    return (
      filters.difficulty === undefined ||
      exercise.difficulty === filters.difficulty
    );
  });
}

/**
 * Stable partition: exercises the backend flagged for review come first, and
 * within each group the backend's own ordering (by id) is preserved.
 */
export function prioritizeNeedsReview(
  exercises: readonly ExerciseListItem[],
): ExerciseListItem[] {
  const flagged = exercises.filter((exercise) => exercise.stats.needs_review);
  const rest = exercises.filter((exercise) => !exercise.stats.needs_review);

  return [...flagged, ...rest];
}

/**
 * Topic options come from the exercises already loaded — this screen never
 * calls the topics endpoint.
 */
export function topicOptions(
  exercises: readonly ExerciseListItem[],
): ExerciseTopic[] {
  const byId = new Map<number, ExerciseTopic>();

  for (const exercise of exercises) {
    if (!byId.has(exercise.topic.id)) {
      byId.set(exercise.topic.id, exercise.topic);
    }
  }

  return [...byId.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "tr"),
  );
}

export function difficultyOptions(
  exercises: readonly ExerciseListItem[],
): DifficultyLevel[] {
  const levels = new Set(exercises.map((exercise) => exercise.difficulty));

  return [...levels].sort((a, b) => a - b) as DifficultyLevel[];
}

export function isEdited(exercise: ExerciseListItem): boolean {
  return exercise.version > 1;
}

/** Null means "not attempted yet" — never render it as 0%. */
export function correctRateLabel(correctRate: number | null): string | null {
  return correctRate === null ? null : `%${correctRate} doğru`;
}

export function countNeedsReview(
  exercises: readonly ExerciseListItem[],
): number {
  return exercises.filter((exercise) => exercise.stats.needs_review).length;
}
