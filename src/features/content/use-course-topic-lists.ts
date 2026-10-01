"use client";

import {
  useQueries,
  useQueryClient,
  type QueryObserverResult,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { CourseTopicsData } from "@/contracts/admin/exercise-editor";
import { CONTENT_SCAN_CONCURRENCY } from "@/features/content/content-scan";
import { courseTopicsQueryOptions } from "@/features/content/content-queries";
import { fetchWithAbort } from "@/features/content/scan-fetch";
import { runWithConcurrency } from "@/lib/async/run-with-concurrency";
import { toApiError, type ApiError } from "@/lib/api/error";
import { shouldHaltBatch } from "@/lib/api/retry-policy";

export type CourseTopicLists = Readonly<{
  /** Topic lists answered so far, in course order. */
  lists: readonly CourseTopicsData[];
  isLoading: boolean;
  /** Courses whose topic list could not be read. */
  failedCourseIds: readonly number[];
  /** Every course answered: the topic metrics describe the whole catalogue. */
  isComplete: boolean;
  haltError: ApiError | null;
  retry: () => void;
}>;

function combine(results: QueryObserverResult<CourseTopicsData>[]) {
  return results.map((result) => ({
    data: result.data,
    error: result.error === null ? null : toApiError(result.error),
  }));
}

/**
 * Topic lists for several courses, through the existing
 * `courses/{course}/topics` reads and their shared cache key. The full scan
 * does not read topics; the backend's per-topic `exercise_count` is the
 * authoritative coverage number (it counts every question of the topic, in
 * any course of the subject, any status). Used by Health and Coverage.
 *
 * Reads are bounded like the scan's, reuse fresh cache entries, and stop
 * when the page unmounts. Pass a stable array: a new identity re-runs it.
 */
export function useCourseTopicLists(
  courseIds: readonly number[],
): CourseTopicLists {
  const queryClient = useQueryClient();
  const [haltError, setHaltError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);

  const results = useQueries({
    queries: courseIds.map((courseId) => ({
      ...courseTopicsQueryOptions(courseId),
      enabled: false,
    })),
    combine,
  });

  useEffect(() => {
    if (courseIds.length === 0) return;

    const abort = new AbortController();
    let halted: ApiError | null = null;

    void runWithConcurrency(
      courseIds,
      CONTENT_SCAN_CONCURRENCY,
      async (courseId) => {
        try {
          await fetchWithAbort(
            queryClient,
            courseTopicsQueryOptions(courseId),
            courseTopicsQueryOptions(courseId).staleTime,
            abort.signal,
          );
        } catch (raw) {
          // The failure stays on the query; only a batch-halting one stops.
          const error = toApiError(raw);
          if (!abort.signal.aborted && shouldHaltBatch(error)) halted ??= error;
        }
      },
      () => abort.signal.aborted || halted !== null,
    ).then(() => {
      if (!abort.signal.aborted) setHaltError(halted);
    });

    return () => abort.abort();
  }, [courseIds, queryClient, attempt]);

  const lists = useMemo(
    () =>
      results.flatMap((result) =>
        result.data === undefined ? [] : [result.data],
      ),
    [results],
  );
  const failedCourseIds = useMemo(
    () =>
      courseIds.filter(
        (_, index) =>
          results[index]?.data === undefined && results[index]?.error !== null,
      ),
    [courseIds, results],
  );

  const retry = useCallback(() => {
    setHaltError(null);
    setAttempt((value) => value + 1);
  }, []);

  // Loading while some course has neither an answer nor a failure, unless a
  // halting error stopped the reads.
  const isLoading =
    haltError === null &&
    results.some(
      (result) => result.data === undefined && result.error === null,
    );

  return {
    lists,
    isLoading,
    failedCourseIds,
    isComplete: courseIds.length > 0 && lists.length === courseIds.length,
    haltError,
    retry,
  };
}
