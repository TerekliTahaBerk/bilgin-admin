"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  checkUnitReadiness,
  checkUnitsReadiness,
  type ReadinessBatchProgress,
} from "@/features/content/readiness-check";
import type { ApiError } from "@/lib/api/error";

export type ReadinessCheckState = Readonly<{
  status: "idle" | "running" | "completed" | "cancelled" | "halted";
  progress: ReadinessBatchProgress | null;
  failedUnitIds: readonly number[];
  /** Also set by a single-unit check that hit a batch-halting error. */
  haltError: ApiError | null;
  isCancelling: boolean;
}>;

const IDLE: ReadinessCheckState = {
  status: "idle",
  progress: null,
  failedUnitIds: [],
  haltError: null,
  isCancelling: false,
};

export type ReadinessCheck = Readonly<{
  state: ReadinessCheckState;
  /** Checks several units, bounded; ignored while another batch runs. */
  checkMany: (
    unitIds: readonly number[],
    options?: { refresh?: boolean },
  ) => void;
  /** Checks one unit; its progress shows on the unit itself. */
  checkOne: (unitId: number, options?: { refresh?: boolean }) => void;
  cancel: () => void;
}>;

/**
 * The Publishing Center's only way of asking the backend for readiness. It
 * never runs on its own: opening the page shows what is cached, and each
 * preview request after that is the admin's explicit choice.
 */
export function useReadinessCheck(): ReadinessCheck {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ReadinessCheckState>(IDLE);
  const runRef = useRef<{ cancelled: boolean } | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      // Leaving the page stops scheduling; in-flight answers still land in
      // the cache, where the unit page can use them.
      if (runRef.current !== null) runRef.current.cancelled = true;
    };
  }, []);

  const checkMany = useCallback(
    (unitIds: readonly number[], options: { refresh?: boolean } = {}) => {
      if (runRef.current !== null || unitIds.length === 0) return;

      const run = { cancelled: false };
      runRef.current = run;
      setState({ ...IDLE, status: "running" });

      void checkUnitsReadiness(queryClient, unitIds, {
        refresh: options.refresh,
        isCancelled: () => run.cancelled,
        onProgress: (progress) => {
          if (runRef.current === run && mounted.current) {
            setState((current) => ({ ...current, progress }));
          }
        },
      }).then((outcome) => {
        if (runRef.current !== run) return;

        runRef.current = null;
        if (!mounted.current) return;

        setState((current) => ({
          status: outcome.status,
          progress: current.progress,
          failedUnitIds: outcome.failedUnitIds,
          haltError: outcome.haltError,
          isCancelling: false,
        }));
      });
    },
    [queryClient],
  );

  const checkOne = useCallback(
    (unitId: number, options: { refresh?: boolean } = {}) => {
      void checkUnitReadiness(queryClient, unitId, options).then((outcome) => {
        if (outcome.haltError !== null && mounted.current) {
          setState((current) => ({ ...current, haltError: outcome.haltError }));
        }
      });
    },
    [queryClient],
  );

  const cancel = useCallback(() => {
    if (runRef.current === null) return;

    runRef.current.cancelled = true;
    setState((current) => ({ ...current, isCancelling: true }));
  }, []);

  return { state, checkMany, checkOne, cancel };
}
