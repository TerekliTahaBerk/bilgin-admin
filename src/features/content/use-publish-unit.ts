"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type {
  PublishBlockingRow,
  PublishUnitData,
} from "@/contracts/admin/publication";
import { publishUnit } from "@/features/content/content-client";
import {
  courseUnitsQueryKey,
  coursesQueryKey,
  nodePreviewQueryKey,
  unitExercisesQueryPrefix,
  unitNodesQueryKey,
} from "@/features/content/content-queries";
import { publishBlockingRows } from "@/features/content/readiness";
import { toApiError, type ApiError } from "@/lib/api/error";

/**
 * Everything a successful publish can have changed, per the backend's
 * `publishUnit`: the unit's status (course list counts and the course's unit
 * list), every node's status, every non-archived question's status, and so
 * every node's selection pool.
 */
export async function invalidateAfterPublish(
  queryClient: ReturnType<typeof useQueryClient>,
  target: Readonly<{
    courseId: number;
    unitId: number;
    nodeIds: readonly number[];
  }>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: coursesQueryKey }),
    queryClient.invalidateQueries({
      queryKey: courseUnitsQueryKey(target.courseId),
    }),
    queryClient.invalidateQueries({
      queryKey: unitNodesQueryKey(target.unitId),
    }),
    queryClient.invalidateQueries({
      queryKey: unitExercisesQueryPrefix(target.unitId),
    }),
    ...target.nodeIds.map((nodeId) =>
      queryClient.invalidateQueries({ queryKey: nodePreviewQueryKey(nodeId) }),
    ),
  ]);
}

export type PublishUnitState = Readonly<{
  publish: () => void;
  isPending: boolean;
  error: ApiError | null;
  /** The backend's `details.blocking` rows for a CONTENT_NOT_PUBLISHABLE. */
  blocking: readonly PublishBlockingRow[];
  result: PublishUnitData | null;
}>;

/**
 * The one publish workflow, shared by the unit page and the Publishing
 * Center. `POST /units/{unit}/publish` re-runs the readiness gate itself, so
 * whatever the page showed a moment ago, the backend's answer here is final.
 */
export function usePublishUnit(
  target: Readonly<{
    courseId: number;
    unitId: number;
    nodeIds: readonly number[];
  }>,
  options: { onPublished?: (data: PublishUnitData) => void } = {},
): PublishUnitState {
  const queryClient = useQueryClient();
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<PublishUnitData | null>(null);
  const { onPublished } = options;

  const mutation = useMutation({
    mutationFn: () => publishUnit(target.unitId),
    // Publishing is never retried automatically: a second attempt after an
    // ambiguous failure would republish content the first call may have
    // already shipped.
    retry: 0,
    onSuccess: async (data) => {
      setError(null);
      setResult(data);
      onPublished?.(data);
      await invalidateAfterPublish(queryClient, target);
    },
    onError: (raw: unknown) => {
      setResult(null);
      setError(toApiError(raw));
    },
  });

  return {
    publish: () => mutation.mutate(),
    isPending: mutation.isPending,
    error,
    blocking: error === null ? [] : publishBlockingRows(error),
    result,
  };
}
