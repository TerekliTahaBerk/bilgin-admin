import type {
  Course,
  Unit,
  UnitExercisesData,
} from "@/contracts/admin/content";
import {
  getCourses,
  getCourseUnits,
  getUnitExercises,
} from "@/features/content/content-client";
import type { ExerciseServerFilters } from "@/features/content/exercise-filters";

/**
 * Query keys and options live here so both browsers share one cache entry per
 * resource instead of importing keys across client components.
 */
export const CONTENT_STALE_TIME_MS = 120_000;

export const coursesQueryKey = ["content", "courses"] as const;

export function courseUnitsQueryKey(courseId: number) {
  return ["content", "courses", courseId, "units"] as const;
}

export function coursesQueryOptions() {
  return {
    queryKey: coursesQueryKey,
    queryFn: ({ signal }: { signal: AbortSignal }): Promise<Course[]> =>
      getCourses({ signal }),
    staleTime: CONTENT_STALE_TIME_MS,
  };
}

export function courseUnitsQueryOptions(courseId: number) {
  return {
    queryKey: courseUnitsQueryKey(courseId),
    queryFn: ({ signal }: { signal: AbortSignal }): Promise<Unit[]> =>
      getCourseUnits(courseId, { signal }),
    staleTime: CONTENT_STALE_TIME_MS,
  };
}

/**
 * Only the server filters belong in the key. Topic and difficulty are applied
 * to the loaded array, so including them would split the cache and trigger a
 * needless refetch on every local filter change.
 */
export function unitExercisesQueryKey(
  unitId: number,
  filters: ExerciseServerFilters,
) {
  return [
    "content",
    "units",
    unitId,
    "exercises",
    { type: filters.type ?? null, status: filters.status ?? null },
  ] as const;
}

export function unitExercisesQueryOptions(
  unitId: number,
  filters: ExerciseServerFilters,
) {
  return {
    queryKey: unitExercisesQueryKey(unitId, filters),
    queryFn: ({
      signal,
    }: {
      signal: AbortSignal;
    }): Promise<UnitExercisesData> =>
      getUnitExercises(unitId, filters, { signal }),
    staleTime: CONTENT_STALE_TIME_MS,
  };
}
