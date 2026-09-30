"use client";

import { useMemo } from "react";

import type { NodePreview, UnitNode } from "@/contracts/admin/publication";
import {
  PublishErrorNotice,
  PublishPanel,
} from "@/features/content/publish-panel";
import {
  difficultyLevelLabels,
  nodePreviewAnchorId,
  nodeTypeLabels,
  readinessState,
} from "@/features/content/readiness";
import { ReadinessStateBadge } from "@/features/content/readiness-badges";
import { StatusBadge } from "@/features/content/status-badges";
import { usePublishUnit } from "@/features/content/use-publish-unit";
import { useReadinessSnapshots } from "@/features/content/use-readiness-snapshots";
import type { ApiError } from "@/lib/api/error";

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
          {state === null ? null : <ReadinessStateBadge state={state} />}
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
      {preview?.live_warning == null ? null : (
        <p className="mt-1 text-xs text-amber-800">{preview.live_warning}</p>
      )}
    </li>
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
  const unitIds = useMemo(() => [unitId], [unitId]);
  const snapshot = useReadinessSnapshots(unitIds, { enabled: true }).get(
    unitId,
  );
  const nodes = snapshot?.nodes ?? [];
  const summary = snapshot?.summary ?? null;

  const publish = usePublishUnit({
    courseId,
    unitId,
    nodeIds: nodes.map((node) => node.id),
  });
  const publishedNodes = publish.result?.published_nodes ?? null;

  if (snapshot?.nodesState === "error" && snapshot.nodesError !== null) {
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
            Hazırlık durumu yüklenemedi: {snapshot.nodesError.message}
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
            canPublish={summary?.canPublish ?? false}
            isPending={publish.isPending}
            nodeCount={nodes.length}
            onPublish={publish.publish}
            warningCount={summary?.warnings ?? 0}
          />
        ) : null}
      </div>

      {summary === null ? (
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

          {publish.error === null ? null : (
            <div className="mt-3">
              <PublishErrorNotice
                blocking={publish.blocking}
                error={publish.error}
              />
            </div>
          )}

          <ul
            aria-label="Ünite adımları"
            className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface"
          >
            {(snapshot?.checks ?? []).map((check) => (
              <NodeRow
                error={check.error}
                isPending={
                  check.state === "checking" || check.state === "unchecked"
                }
                key={check.node.id}
                node={check.node}
                preview={check.preview}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
