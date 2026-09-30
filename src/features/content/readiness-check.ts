import type { QueryClient } from "@tanstack/react-query";

import {
  CONTENT_STALE_TIME_MS,
  nodePreviewQueryOptions,
  unitNodesQueryOptions,
} from "@/features/content/content-queries";
import { runWithConcurrency } from "@/lib/async/run-with-concurrency";
import { toApiError, type ApiError } from "@/lib/api/error";
import { shouldHaltBatch } from "@/lib/api/retry-policy";

/**
 * Units checked at once. Each unit fans out to one preview per node (a real
 * pool query on the backend), so two units keep roughly a dozen requests in
 * flight — enough to be quick, not enough to flood the backend.
 */
export const READINESS_CHECK_CONCURRENCY = 2;

export type UnitCheckOutcome = Readonly<{
  /** Some read for this unit failed; the failure is in the cache entry. */
  failed: boolean;
  /** A failure that should stop any batch this unit is part of. */
  haltError: ApiError | null;
}>;

/**
 * Reads one unit's readiness into the shared cache: its node list, then every
 * node's preview in parallel — the same two reads, keys and options the unit
 * page uses. A fresh cache entry is served without a request unless
 * `refresh` is set.
 *
 * Failures are not thrown: the query cache keeps each error next to its node,
 * where the readiness view shows it as "unknown", never as a pass.
 */
export async function checkUnitReadiness(
  queryClient: QueryClient,
  unitId: number,
  { refresh = false }: { refresh?: boolean } = {},
): Promise<UnitCheckOutcome> {
  const staleTime = refresh ? 0 : CONTENT_STALE_TIME_MS;
  let nodeIds: number[];

  try {
    const data = await queryClient.fetchQuery({
      ...unitNodesQueryOptions(unitId),
      staleTime,
    });
    nodeIds = data.nodes.map((node) => node.id);
  } catch (raw) {
    const error = toApiError(raw);

    return { failed: true, haltError: shouldHaltBatch(error) ? error : null };
  }

  const results = await Promise.allSettled(
    nodeIds.map((nodeId) =>
      queryClient.fetchQuery({ ...nodePreviewQueryOptions(nodeId), staleTime }),
    ),
  );
  const errors = results.flatMap((result) =>
    result.status === "rejected" ? [toApiError(result.reason)] : [],
  );

  return {
    failed: errors.length > 0,
    haltError: errors.find(shouldHaltBatch) ?? null,
  };
}

export type ReadinessBatchProgress = Readonly<{
  completed: number;
  total: number;
}>;

export type ReadinessBatchOutcome = Readonly<{
  status: "completed" | "cancelled" | "halted";
  failedUnitIds: readonly number[];
  haltError: ApiError | null;
}>;

/** Checks several units, bounded, stopping early on a batch-halting error. */
export async function checkUnitsReadiness(
  queryClient: QueryClient,
  unitIds: readonly number[],
  deps: Readonly<{
    refresh?: boolean;
    isCancelled: () => boolean;
    onProgress: (progress: ReadinessBatchProgress) => void;
    concurrency?: number;
  }>,
): Promise<ReadinessBatchOutcome> {
  const failedUnitIds: number[] = [];
  let haltError: ApiError | null = null;
  let completed = 0;

  deps.onProgress({ completed, total: unitIds.length });

  await runWithConcurrency(
    unitIds,
    deps.concurrency ?? READINESS_CHECK_CONCURRENCY,
    async (unitId) => {
      const outcome = await checkUnitReadiness(queryClient, unitId, {
        refresh: deps.refresh,
      });

      if (outcome.haltError !== null) haltError ??= outcome.haltError;
      else if (outcome.failed) failedUnitIds.push(unitId);

      completed += 1;
      deps.onProgress({ completed, total: unitIds.length });
    },
    () => haltError !== null || deps.isCancelled(),
  );

  return {
    status:
      haltError !== null
        ? "halted"
        : deps.isCancelled()
          ? "cancelled"
          : "completed",
    failedUnitIds,
    haltError,
  };
}
