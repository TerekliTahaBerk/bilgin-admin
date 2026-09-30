"use client";

import { useQueries, type QueryObserverResult } from "@tanstack/react-query";
import { useMemo } from "react";

import type {
  NodePreview,
  UnitNode,
  UnitNodesData,
} from "@/contracts/admin/publication";
import {
  nodePreviewQueryOptions,
  unitNodesQueryOptions,
} from "@/features/content/content-queries";
import {
  summarizeReadiness,
  type ReadinessSummary,
} from "@/features/content/readiness";
import { toApiError, type ApiError } from "@/lib/api/error";

/**
 * Where one backend answer stands:
 * - `unchecked`: nothing cached and nothing asked for yet (observe-only mode);
 * - `checking`: a request is in flight and there is no answer yet;
 * - `error`: the request failed and there is no answer;
 * - `answered`: the backend's answer is here (it may be refreshing).
 */
export type CheckState = "unchecked" | "checking" | "error" | "answered";

export type NodeCheck = Readonly<{
  node: UnitNode;
  state: CheckState;
  preview: NodePreview | undefined;
  error: ApiError | null;
}>;

export type UnitReadinessSnapshot = Readonly<{
  unitId: number;
  nodesState: CheckState;
  nodesError: ApiError | null;
  nodes: readonly UnitNode[];
  checks: readonly NodeCheck[];
  /** `null` until the unit's node list is known. */
  summary: ReadinessSummary | null;
  /** Anything for this unit is in flight (first load or refresh). */
  isChecking: boolean;
}>;

type Slim<Data> = Readonly<{
  data: Data | undefined;
  error: ApiError | null;
  isFetching: boolean;
}>;

/*
 * Reduce each observer result to what this module reads. TanStack
 * structurally shares the combined value, so unrelated cache events keep the
 * same identity and the memo below does not rebuild every snapshot.
 */
function slim<Data>(results: QueryObserverResult<Data>[]): Slim<Data>[] {
  return results.map((result) => ({
    data: result.data,
    error: result.error === null ? null : toApiError(result.error),
    isFetching: result.fetchStatus === "fetching",
  }));
}

const combineNodes = slim<UnitNodesData>;
const combinePreviews = slim<NodePreview>;

function stateOf(result: Slim<unknown> | undefined): CheckState {
  if (result === undefined) return "unchecked";
  if (result.data !== undefined) return "answered";
  if (result.isFetching) return "checking";
  if (result.error !== null) return "error";

  return "unchecked";
}

/**
 * Readiness for any number of units, from the same two backend reads the
 * unit page has always used: `GET /units/{unit}/nodes`, then one
 * `GET /nodes/{node}/preview-selection` per node. This is the only place in
 * the app that turns those cache entries into a readiness picture, so the
 * unit page and the Publishing Center cannot drift apart.
 *
 * `enabled: true` fetches (the unit page, one unit). `enabled: false` only
 * observes what is cached (the Publishing Center, every unit) — previews are
 * real pool queries on the backend, so checking the whole catalogue is an
 * explicit action there, never a side effect of opening the page. Observing
 * also keeps those cache entries alive while the page is open.
 */
export function useReadinessSnapshots(
  unitIds: readonly number[],
  { enabled }: { enabled: boolean },
): ReadonlyMap<number, UnitReadinessSnapshot> {
  const nodeResults = useQueries({
    queries: unitIds.map((unitId) => ({
      ...unitNodesQueryOptions(unitId),
      enabled,
    })),
    combine: combineNodes,
  });

  const allNodes = useMemo(
    () => nodeResults.flatMap((result) => result.data?.nodes ?? []),
    [nodeResults],
  );

  const previewResults = useQueries({
    queries: allNodes.map((node) => ({
      ...nodePreviewQueryOptions(node.id),
      enabled,
    })),
    combine: combinePreviews,
  });

  return useMemo(() => {
    const snapshots = new Map<number, UnitReadinessSnapshot>();
    let previewIndex = 0;

    unitIds.forEach((unitId, index) => {
      const nodesResult = nodeResults[index];
      const nodes = nodesResult?.data?.nodes ?? [];
      const unitPreviews = previewResults.slice(
        previewIndex,
        previewIndex + nodes.length,
      );
      previewIndex += nodes.length;

      const checks: NodeCheck[] = nodes.map((node, offset) => {
        const result = unitPreviews[offset];

        return {
          node,
          state: stateOf(result),
          preview: result?.data,
          error: result?.data === undefined ? (result?.error ?? null) : null,
        };
      });
      const nodesState = stateOf(nodesResult);
      const previews = checks
        .map((check) => check.preview)
        .filter((preview): preview is NodePreview => preview !== undefined);

      snapshots.set(unitId, {
        unitId,
        nodesState,
        nodesError:
          nodesResult?.data === undefined ? (nodesResult?.error ?? null) : null,
        nodes,
        checks,
        summary:
          nodesState === "answered"
            ? summarizeReadiness(nodes.length, previews)
            : null,
        isChecking:
          (nodesResult?.isFetching ?? false) ||
          unitPreviews.some((result) => result.isFetching),
      });
    });

    return snapshots;
  }, [unitIds, nodeResults, previewResults]);
}
