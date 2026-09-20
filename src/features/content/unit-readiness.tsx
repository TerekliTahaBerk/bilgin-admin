"use client";

import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type {
  NodePreview,
  UnitNode,
  UnitNodesData,
} from "@/contracts/admin/publication";
import { publishUnit } from "@/features/content/content-client";
import {
  courseUnitsQueryKey,
  coursesQueryKey,
  nodePreviewQueryKey,
  nodePreviewQueryOptions,
  unitExercisesQueryPrefix,
  unitNodesQueryKey,
  unitNodesQueryOptions,
} from "@/features/content/content-queries";
import {
  difficultyLevelLabels,
  nodePreviewAnchorId,
  nodeTypeLabels,
  publishBlockingRows,
  readinessState,
  readinessStateLabels,
  summarizeReadiness,
  type ReadinessState,
} from "@/features/content/readiness";
import { StatusBadge } from "@/features/content/status-badges";
import type { ApiError } from "@/lib/api/error";

const stateStyles: Readonly<Record<ReadinessState, string>> = {
  pass: "border-emerald-200 bg-emerald-50 text-emerald-800",
  relaxed: "border-amber-200 bg-amber-50 text-amber-800",
  fail: "border-red-200 bg-red-50 text-red-800",
};

function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { kind?: unknown }).kind === "string"
  );
}

function StateBadge({ state }: { state: ReadinessState }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${stateStyles[state]}`}
    >
      {readinessStateLabels[state]}
    </span>
  );
}

function NodeMeta({ node }: { node: UnitNode }) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      <span>{nodeTypeLabels[node.type]}</span>
      <span aria-hidden="true">·</span>
      <span>{difficultyLevelLabels[node.difficulty]}</span>
      <span aria-hidden="true">·</span>
      <span>{node.exercise_count} soru gerekiyor</span>
    </p>
  );
}

function NodeRow({
  node,
  preview,
  error,
  isPending,
}: {
  node: UnitNode;
  preview: NodePreview | undefined;
  error: ApiError | null;
  isPending: boolean;
}) {
  const state = preview === undefined ? null : readinessState(preview);

  return (
    <li
      className="scroll-mt-24 px-4 py-3 sm:px-5"
      id={nodePreviewAnchorId(node.id)}
    >
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{node.title}</p>
          <NodeMeta node={node} />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:shrink-0 sm:justify-end">
          {state === null ? null : <StateBadge state={state} />}
          <span className="inline-flex sm:w-20 sm:justify-end">
            <StatusBadge status={node.status} />
          </span>
        </div>
      </div>

      {isPending ? (
        <p aria-live="polite" className="mt-1.5 text-xs text-muted">
          Hazırlık durumu kontrol ediliyor…
        </p>
      ) : error !== null ? (
        /*
         * A failed preview is shown as unknown, never as a pass: the publish
         * button must not become available because a check could not run.
         */
        <p className="mt-1.5 text-xs text-muted" role="alert">
          Hazırlık durumu okunamadı: {error.message}
        </p>
      ) : preview === undefined ? null : (
        <p
          className={`mt-1.5 text-xs ${state === "fail" ? "text-red-800" : "text-muted"}`}
          {...(state === "fail" ? { role: "alert" } : {})}
        >
          <span className="font-medium">
            {preview.available} / {preview.required}
          </span>{" "}
          · {preview.message}
        </p>
      )}
    </li>
  );
}

function PublishPanel({
  canPublish,
  isPending,
  nodeCount,
  onPublish,
}: {
  canPublish: boolean;
  isPending: boolean;
  nodeCount: number;
  onPublish: () => void;
}) {
  const [isConfirming, setIsConfirming] = useState(false);

  if (!isConfirming) {
    return (
      <button
        className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!canPublish || isPending}
        onClick={() => setIsConfirming(true)}
        type="button"
      >
        Üniteyi yayınla
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface-muted p-4">
      <h3 className="text-sm font-semibold">Üniteyi yayınlamak üzeresiniz</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
        <li>Ünite yayına alınır ve öğrencilere görünür olur.</li>
        <li>{nodeCount} adımın tamamı yayınlanır.</li>
        <li>
          Ünitenin arşivlenmemiş soruları (taslak ve incelemedekiler dâhil)
          yayınlanır.
        </li>
        <li>Arşivlenmiş sorular arşivde kalır; yayına dönmez.</li>
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
          onClick={() => {
            setIsConfirming(false);
            onPublish();
          }}
          type="button"
        >
          {isPending ? "Yayınlanıyor…" : "Evet, yayınla"}
        </button>
        <button
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-muted"
          onClick={() => setIsConfirming(false)}
          type="button"
        >
          Vazgeç
        </button>
      </div>
    </div>
  );
}

/**
 * The publication readiness block.
 *
 * No count is multiplied, compared or turned into a verdict here. A pool
 * model cannot be second-guessed by arithmetic over stored totals: each node's
 * own selection rule decides what it needs, and only the backend's dry run can
 * answer that — so this block asks the backend, once per node, and reports
 * what it says.
 *
 * The node ids exist only in the nodes response, so nodes → previews is an
 * unavoidable waterfall. The previews themselves run in parallel, are never
 * polled and are not refetched on window focus.
 */
export function UnitReadiness({
  canPublish: hasPublishAbility,
  courseId,
  unitId,
}: {
  canPublish: boolean;
  courseId: number;
  unitId: number;
}) {
  const queryClient = useQueryClient();
  const [publishError, setPublishError] = useState<ApiError | null>(null);
  const [publishedNodes, setPublishedNodes] = useState<number | null>(null);

  const nodesQuery = useQuery<UnitNodesData, ApiError>(
    unitNodesQueryOptions(unitId),
  );
  const nodes = nodesQuery.data?.nodes ?? [];

  const previewQueries = useQueries({
    queries: nodes.map((node) => nodePreviewQueryOptions(node.id)),
  });

  const previews = previewQueries
    .map((query) => query.data)
    .filter((preview): preview is NodePreview => preview !== undefined);

  const summary = summarizeReadiness(nodes.length, previews);

  const publishMutation = useMutation({
    mutationFn: () => publishUnit(unitId),
    // Publishing is never retried automatically: a second attempt after an
    // ambiguous failure would republish content the first call may have
    // already shipped.
    retry: 0,
    onSuccess: async (data) => {
      setPublishError(null);
      setPublishedNodes(data.published_nodes);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: coursesQueryKey }),
        queryClient.invalidateQueries({
          queryKey: courseUnitsQueryKey(courseId),
        }),
        queryClient.invalidateQueries({ queryKey: unitNodesQueryKey(unitId) }),
        queryClient.invalidateQueries({
          queryKey: unitExercisesQueryPrefix(unitId),
        }),
        // Publishing moves every eligible question to `published`, so each
        // node's pool changed underneath its cached preview.
        ...nodes.map((node) =>
          queryClient.invalidateQueries({
            queryKey: nodePreviewQueryKey(node.id),
          }),
        ),
      ]);
    },
    onError: (error: unknown) => {
      setPublishedNodes(null);
      setPublishError(
        isApiError(error)
          ? error
          : { kind: "unknown", status: null, message: "İstek tamamlanamadı." },
      );
    },
  });

  const blocking =
    publishError === null ? [] : publishBlockingRows(publishError);

  if (nodesQuery.isError) {
    return (
      <section aria-labelledby="unit-readiness-heading" className="mt-8">
        <h2 className="text-sm font-semibold" id="unit-readiness-heading">
          Yayın hazırlığı
        </h2>
        <div
          className="mt-3 rounded-lg border border-border bg-surface p-4"
          role="alert"
        >
          <p className="max-w-prose text-sm text-muted">
            Hazırlık durumu yüklenemedi: {nodesQuery.error.message}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="unit-readiness-heading" className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold" id="unit-readiness-heading">
          Yayın hazırlığı
        </h2>
        {/*
         * The button is absent from the DOM without `publish_content` — not
         * disabled. `edit_content` alone is deliberately not enough: the
         * author of a question may not be the one who ships it.
         */}
        {hasPublishAbility ? (
          <PublishPanel
            canPublish={summary.canPublish}
            isPending={publishMutation.isPending}
            nodeCount={nodes.length}
            onPublish={() => publishMutation.mutate()}
          />
        ) : null}
      </div>

      {nodesQuery.isPending ? (
        <p
          aria-busy="true"
          aria-live="polite"
          className="mt-3 text-sm text-muted"
        >
          Adımlar yükleniyor…
        </p>
      ) : nodes.length === 0 ? (
        <p className="mt-3 max-w-prose text-sm text-muted">
          Bu ünitede henüz adım bulunmuyor; kontrol edilecek bir kural yok.
        </p>
      ) : (
        <>
          <p aria-live="polite" className="mt-2 text-sm text-muted">
            <strong className="font-semibold text-foreground">
              {summary.passing}
            </strong>{" "}
            / {summary.total} adım hazır
            {summary.relaxed === 0
              ? null
              : ` · ${summary.relaxed} adımda havuz dar`}
            {summary.failing === 0
              ? null
              : ` · ${summary.failing} adım yetersiz`}
          </p>

          {publishedNodes === null ? null : (
            <div
              className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4"
              role="status"
            >
              <p className="text-sm font-medium text-emerald-900">
                Ünite yayınlandı. {publishedNodes} adım yayına alındı.
              </p>
            </div>
          )}

          {publishError === null ? null : (
            <div
              className="mt-3 rounded-lg border border-red-200 bg-red-50 p-4"
              role="alert"
            >
              <h3 className="text-sm font-semibold text-red-900">
                Ünite yayınlanamadı
              </h3>
              <p className="mt-1.5 max-w-prose text-sm text-red-800">
                {publishError.message}
              </p>
              {blocking.length === 0 ? null : (
                <ul className="mt-2 space-y-1 text-sm text-red-800">
                  {blocking.map((row) => (
                    <li key={row.node_id}>
                      {/*
                       * No node detail route exists, so the link points at
                       * this page's own readiness row. Inventing a route the
                       * app does not serve would be a dead link.
                       */}
                      <a
                        className="font-medium underline"
                        href={`#${nodePreviewAnchorId(row.node_id)}`}
                      >
                        {row.node_title}
                      </a>
                      : {row.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <ul
            aria-label="Ünite adımları"
            className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface"
          >
            {nodes.map((node, index) => {
              const query = previewQueries[index];

              return (
                <NodeRow
                  error={isApiError(query?.error) ? query.error : null}
                  isPending={query?.isPending ?? true}
                  key={node.id}
                  node={node}
                  preview={query?.data}
                />
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
