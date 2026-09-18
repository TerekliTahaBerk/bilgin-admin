"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import type { ExerciseFilterValues } from "@/features/content/exercise-filter-bar";
import {
  parseDifficulty,
  parseExerciseStatus,
  parseExerciseType,
  parseTopicId,
} from "@/features/content/exercise-filters";
import { ExercisesBrowser } from "@/features/content/exercises-browser";

/**
 * Filter state lives in the URL, so a filtered list is shareable and survives a
 * reload. Unparseable values fall back to "all" rather than throwing, and the
 * URL is left as the user typed it — rewriting it here would risk a replace
 * loop.
 */
export function ExercisesPage({
  canEdit,
  courseId,
  unitId,
}: {
  canEdit: boolean;
  courseId: number;
  unitId: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters: ExerciseFilterValues = {
    type: parseExerciseType(searchParams.get("type")),
    status: parseExerciseStatus(searchParams.get("status")),
    topicId: parseTopicId(searchParams.get("topic")),
    difficulty: parseDifficulty(searchParams.get("difficulty")),
  };

  const currentQuery = searchParams.toString();

  /*
   * `router.replace` is asynchronous and does not update `window.location`
   * before it returns, so two filter changes in quick succession would both
   * build on the pre-navigation params and the first one would be lost. The
   * query we last asked for is held here until the URL catches up.
   */
  const pendingQuery = useRef<string | null>(null);

  useEffect(() => {
    pendingQuery.current = null;
  }, [currentQuery]);

  const apply = useCallback(
    (next: Partial<ExerciseFilterValues>) => {
      const params = new URLSearchParams(pendingQuery.current ?? currentQuery);
      const entries: [string, string | undefined][] = [
        ["type", "type" in next ? next.type : undefined],
        ["status", "status" in next ? next.status : undefined],
        [
          "topic",
          "topicId" in next && next.topicId !== undefined
            ? String(next.topicId)
            : undefined,
        ],
        [
          "difficulty",
          "difficulty" in next && next.difficulty !== undefined
            ? String(next.difficulty)
            : undefined,
        ],
      ];

      for (const [key, value] of entries) {
        const touched =
          (key === "topic" && "topicId" in next) ||
          (key !== "topic" && key in next);

        if (!touched) {
          continue;
        }

        if (value === undefined) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }

      const query = params.toString();

      pendingQuery.current = query;
      router.replace(query.length === 0 ? pathname : `${pathname}?${query}`, {
        scroll: false,
      });
    },
    [currentQuery, pathname, router],
  );

  const clear = useCallback(() => {
    pendingQuery.current = "";
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  return (
    <ExercisesBrowser
      canEdit={canEdit}
      courseId={courseId}
      filters={filters}
      onClearFilters={clear}
      onFiltersChange={apply}
      unitId={unitId}
    />
  );
}
