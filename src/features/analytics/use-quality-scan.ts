"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  retryTarget,
  runQualityScan,
  type ScanFailure,
  type ScanProgress,
  type ScanTarget,
} from "@/features/analytics/quality-scan";
import {
  CONTENT_STALE_TIME_MS,
  courseUnitsQueryOptions,
  unitExercisesQueryOptions,
} from "@/features/content/content-queries";
import { fetchWithAbort } from "@/features/content/scan-fetch";
import type { ApiError } from "@/lib/api/error";

export type QualityScanState = Readonly<{
  status: "idle" | "running" | "completed" | "cancelled" | "halted";
  progress: ScanProgress | null;
  failures: readonly ScanFailure[];
  haltError: ApiError | null;
  /** Cancel was asked for; requests already in flight are still landing. */
  isCancelling: boolean;
}>;

const IDLE: QualityScanState = {
  status: "idle",
  progress: null,
  failures: [],
  haltError: null,
  isCancelling: false,
};

export type QualityScan = Readonly<{
  state: QualityScanState;
  start: (target: ScanTarget, options?: { refresh?: boolean }) => void;
  retryFailures: () => void;
  cancel: () => void;
}>;

/**
 * Drives `runQualityScan` through the shared query cache. Every read goes
 * through `fetchQuery` with the same key and options the browsers use, so a
 * list that is already fresh is served from the cache with no request, and
 * whatever the scan loads is immediately what the unit browser sees too.
 *
 * `refresh` sets the stale time to zero for that run only, which is how the
 * admin asks for "current numbers" instead of "whatever is cached".
 */
export function useQualityScan(): QualityScan {
  const queryClient = useQueryClient();
  const [state, setState] = useState<QualityScanState>(IDLE);
  const runRef = useRef<AbortController | null>(null);
  const failuresRef = useRef<readonly ScanFailure[]>([]);

  useEffect(
    () => () => {
      // Leaving the page aborts the run: nothing new starts and requests
      // still in flight are cancelled.
      runRef.current?.abort();
    },
    [],
  );

  const start = useCallback(
    (target: ScanTarget, options: { refresh?: boolean } = {}) => {
      if (runRef.current !== null) return;

      const run = new AbortController();
      const staleTime = options.refresh ? 0 : CONTENT_STALE_TIME_MS;

      runRef.current = run;
      setState({ ...IDLE, status: "running" });

      void runQualityScan(target, {
        loadUnits: (courseId) =>
          fetchWithAbort(
            queryClient,
            courseUnitsQueryOptions(courseId),
            staleTime,
            run.signal,
          ),
        loadExercises: (unitId) =>
          fetchWithAbort(
            queryClient,
            unitExercisesQueryOptions(unitId, {}),
            staleTime,
            run.signal,
          ),
        signal: run.signal,
        onProgress: (progress) => {
          if (runRef.current === run) {
            setState((current) => ({ ...current, progress }));
          }
        },
      }).then((outcome) => {
        if (runRef.current !== run) return;

        runRef.current = null;
        failuresRef.current = outcome.failures;
        setState((current) => ({
          status: outcome.status,
          progress: current.progress,
          failures: outcome.failures,
          haltError: outcome.haltError,
          isCancelling: false,
        }));
      });
    },
    [queryClient],
  );

  const retryFailures = useCallback(() => {
    const target = retryTarget(failuresRef.current);

    if (target.courseIds.length > 0 || target.units.length > 0) {
      start(target);
    }
  }, [start]);

  const cancel = useCallback(() => {
    if (runRef.current === null) return;

    runRef.current.abort();
    setState((current) => ({ ...current, isCancelling: true }));
  }, []);

  return { state, start, retryFailures, cancel };
}
