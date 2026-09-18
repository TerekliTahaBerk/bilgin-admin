import type { Course, Unit } from "@/contracts/admin/content";
import { getCourses, getCourseUnits } from "@/features/content/content-client";

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
