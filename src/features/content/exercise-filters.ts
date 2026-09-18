import {
  exerciseTypeSchema,
  publishStatusSchema,
  type ExerciseType,
  type PublishStatus,
} from "@/contracts/admin/content";

/**
 * Filters the backend actually applies. Everything else the page offers is
 * filtered client-side and must never reach a request.
 */
export type ExerciseServerFilters = Readonly<{
  type?: ExerciseType;
  status?: PublishStatus;
}>;

export const DIFFICULTY_LEVELS = [1, 2, 3, 4, 5] as const;

export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

export type ExerciseClientFilters = Readonly<{
  topicId?: number;
  difficulty?: DifficultyLevel;
}>;

/**
 * Narrows an unknown value to an exact enum member. Anything else — a bad
 * value, an array from a repeated query parameter, a path-ish string — becomes
 * `undefined`, i.e. "all".
 */
export function parseExerciseType(value: unknown): ExerciseType | undefined {
  const parsed = exerciseTypeSchema.safeParse(value);

  return parsed.success ? parsed.data : undefined;
}

export function parseExerciseStatus(value: unknown): PublishStatus | undefined {
  const parsed = publishStatusSchema.safeParse(value);

  return parsed.success ? parsed.data : undefined;
}

export function parseDifficulty(value: unknown): DifficultyLevel | undefined {
  if (typeof value !== "string" || !/^[1-5]$/.test(value)) {
    return undefined;
  }

  return Number(value) as DifficultyLevel;
}

export function parseTopicId(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,15}$/.test(value)) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/**
 * Validates the filter pair eagerly, so a bad value fails at the public API
 * boundary rather than somewhere inside the request pipeline.
 */
export function requireExerciseFilters(
  filters: ExerciseServerFilters,
): ExerciseServerFilters {
  return {
    ...(filters.type === undefined
      ? {}
      : { type: exerciseTypeSchema.parse(filters.type) }),
    ...(filters.status === undefined
      ? {}
      : { status: publishStatusSchema.parse(filters.status) }),
  };
}

/**
 * Builds the backend query string from validated enum members only. The
 * browser's own search string is never forwarded.
 */
export function buildExerciseQuery(filters: ExerciseServerFilters): string {
  const params = new URLSearchParams();

  if (filters.type !== undefined) {
    params.set("type", exerciseTypeSchema.parse(filters.type));
  }

  if (filters.status !== undefined) {
    params.set("status", publishStatusSchema.parse(filters.status));
  }

  const query = params.toString();

  return query.length === 0 ? "" : `?${query}`;
}
