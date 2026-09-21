"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import type { Course, UnitExercisesData } from "@/contracts/admin/content";
import type {
  CourseUnitsEntry,
  UnitExercisesEntry,
} from "@/features/analytics/attention-items";

/**
 * Everything under the `["content", ...]` query keys that happens to be sitting
 * in the cache right now, reshaped into the three buckets the attention panel
 * needs. Deliberately read-only: it never fetches anything of its own. The
 * point of the "Dikkat Gerektirenler" panel is to add up whatever the admin
 * has already loaded by browsing courses, units and exercise lists this
 * session — fetching the whole catalog just to compute a summary would be
 * exactly the request waterfall the rest of this app goes out of its way to
 * avoid (see `CourseDrilldown` in `analytics-dashboard.tsx`).
 *
 * `courseUnitsQueryKey`/`unitExercisesQueryPrefix` don't carry a course id on
 * the exercises side, so the course id for each unit-exercises entry is
 * recovered from whichever course-units entry already lists that unit.
 */
export type CachedContent = Readonly<{
  courses: readonly Course[];
  courseUnits: readonly CourseUnitsEntry[];
  unitExercises: readonly UnitExercisesEntry[];
}>;

function readCachedContent(
  queryClient: ReturnType<typeof useQueryClient>,
): CachedContent {
  const entries = queryClient.getQueriesData<unknown>({
    queryKey: ["content"],
  });

  let courses: readonly Course[] = [];
  const courseUnits: CourseUnitsEntry[] = [];
  const unitToCourse = new Map<number, number>();
  const rawUnitExercises: { unitId: number; data: UnitExercisesData }[] = [];

  for (const [key, data] of entries) {
    if (data === undefined) continue;

    // ["content", "courses"]
    if (key.length === 2 && key[1] === "courses") {
      courses = data as Course[];
      continue;
    }

    // ["content", "courses", courseId, "units"]
    if (key.length === 4 && key[1] === "courses" && key[3] === "units") {
      const courseId = key[2] as number;
      const units = data as CourseUnitsEntry["units"];
      courseUnits.push({ courseId, units });
      for (const unit of units) unitToCourse.set(unit.id, courseId);
      continue;
    }

    // ["content", "units", unitId, "exercises", filters]
    if (key.length === 5 && key[1] === "units" && key[3] === "exercises") {
      const unitId = key[2] as number;
      rawUnitExercises.push({ unitId, data: data as UnitExercisesData });
    }
  }

  const unitExercises: UnitExercisesEntry[] = rawUnitExercises
    .map(({ unitId, data }) => {
      const courseId = unitToCourse.get(unitId);
      return courseId === undefined ? null : { courseId, data };
    })
    .filter((entry): entry is UnitExercisesEntry => entry !== null);

  return { courses, courseUnits, unitExercises };
}

export function useCachedContent(): CachedContent {
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState<CachedContent>(() =>
    readCachedContent(queryClient),
  );

  useEffect(() => {
    // Re-read on every cache write, not just ones under "content" — filtering
    // here is cheap, and the cache doesn't expose a prefix-scoped subscribe.
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      setSnapshot(readCachedContent(queryClient));
    });
    return unsubscribe;
  }, [queryClient]);

  return snapshot;
}
