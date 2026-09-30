"use client";

import { ChevronDown, ChevronRight, RotateCw, ScanSearch } from "lucide-react";
import Link from "next/link";
import { memo, useId, useState } from "react";

import type { PublishUnitData } from "@/contracts/admin/publication";
import { NodeReadinessDetails } from "@/features/content/node-readiness-details";
import {
  PublishErrorNotice,
  PublishPanel,
} from "@/features/content/publish-panel";
import {
  blockingCount,
  nodeCount,
  warningCount,
  type PublishingRow,
} from "@/features/content/publishing-model";
import { UnitCategoryBadge } from "@/features/content/readiness-badges";
import { StatusBadge } from "@/features/content/status-badges";
import { usePublishUnit } from "@/features/content/use-publish-unit";

const secondaryButton =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60";

function checkStatusText(row: PublishingRow): string | null {
  const snapshot = row.snapshot;

  if (snapshot === undefined || snapshot.nodesState === "unchecked") {
    return "Hazırlık henüz kontrol edilmedi.";
  }
  if (snapshot.nodesState === "error" && snapshot.nodesError !== null) {
    return `Adımlar okunamadı: ${snapshot.nodesError.message}`;
  }
  if (snapshot.isChecking) return "Kontrol ediliyor…";

  const unanswered = snapshot.checks.filter(
    (check) => check.preview === undefined,
  );
  const failed = unanswered.filter((check) => check.state === "error").length;

  if (failed > 0) return `${failed} adımın kontrolü başarısız oldu.`;
  if (unanswered.length > 0) {
    return `${unanswered.length} adım henüz kontrol edilmedi.`;
  }

  return null;
}

function disabledReason(row: PublishingRow): string {
  if (row.category === "blocked") {
    return "Bloklayan adımlar var; sunucu yayını reddeder.";
  }

  return "Önce hazırlığı kontrol edin; tüm adımlar geçmeden yayın açılmaz.";
}

export type PublishingUnitCardProps = Readonly<{
  row: PublishingRow;
  canPublish: boolean;
  onCheck: (unitId: number, options: { refresh: boolean }) => void;
  onPublished: (row: PublishingRow, data: PublishUnitData) => void;
}>;

/**
 * One unit, its counts and its actions. Every number is either the unit
 * list's own field or a count of the backend's per-node verdicts; a count
 * the page does not have yet reads "—", never zero.
 */
export const PublishingUnitCard = memo(function PublishingUnitCard({
  row,
  canPublish: hasPublishAbility,
  onCheck,
  onPublished,
}: PublishingUnitCardProps) {
  const { course, unit, snapshot, category } = row;
  const titleId = useId();
  const detailsId = useId();
  const [isExpanded, setIsExpanded] = useState(false);
  const summary = snapshot?.summary ?? null;
  const nodeIds = (snapshot?.nodes ?? []).map((node) => node.id);

  const publish = usePublishUnit(
    { courseId: course.id, unitId: unit.id, nodeIds },
    { onPublished: (data) => onPublished(row, data) },
  );

  // A refusal names blocking nodes by anchor, so their rows must be on the
  // page: a new error opens the details once.
  const [seenError, setSeenError] = useState(publish.error);
  if (publish.error !== seenError) {
    setSeenError(publish.error);
    if (publish.error !== null) setIsExpanded(true);
  }

  const blocking = blockingCount(row);
  const warnings = warningCount(row);
  const hasChecked =
    snapshot !== undefined && snapshot.nodesState !== "unchecked";
  const status = checkStatusText(row);

  return (
    <article
      aria-labelledby={titleId}
      className="rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs text-muted">{course.name}</p>
          <h3 className="mt-0.5 text-sm font-semibold" id={titleId}>
            <Link
              className="hover:text-primary hover:underline"
              href={`/courses/${course.id}/units/${unit.id}`}
            >
              {unit.title}
            </Link>
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
          <UnitCategoryBadge category={category} />
          <StatusBadge status={unit.status} />
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-5">
        <div>
          <dt className="text-muted">Adım</dt>
          <dd className="font-medium">{nodeCount(row)}</dd>
        </div>
        <div>
          <dt className="text-muted">Toplam soru</dt>
          <dd className="font-medium">{unit.exercise_count}</dd>
        </div>
        <div>
          <dt className="text-muted">Hazır adım</dt>
          <dd className="font-medium">
            {summary === null ? "—" : `${summary.passing} / ${summary.total}`}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Bloklayan adım</dt>
          <dd
            className={`font-medium ${blocking !== null && blocking > 0 ? "text-red-800" : ""}`}
          >
            {blocking ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Uyarı</dt>
          <dd
            className={`font-medium ${warnings !== null && warnings > 0 ? "text-amber-800" : ""}`}
          >
            {warnings ?? "—"}
          </dd>
        </div>
      </dl>

      {status === null ? null : (
        <p aria-live="polite" className="mt-2 text-xs text-muted">
          {status}
        </p>
      )}

      {publish.result === null ? null : (
        <p className="mt-2 text-xs font-medium text-emerald-800" role="status">
          Ünite yayınlandı. {publish.result.published_nodes} adım yayına alındı.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-start gap-2">
        <button
          aria-controls={detailsId}
          aria-expanded={isExpanded}
          className={secondaryButton}
          onClick={() => setIsExpanded((value) => !value)}
          type="button"
        >
          {isExpanded ? (
            <ChevronDown aria-hidden="true" className="size-4" />
          ) : (
            <ChevronRight aria-hidden="true" className="size-4" />
          )}
          Adım ayrıntıları
        </button>
        <button
          aria-label={`${unit.title}: ${hasChecked ? "hazırlığı yeniden kontrol et" : "hazırlığı kontrol et"}`}
          className={secondaryButton}
          disabled={snapshot?.isChecking ?? false}
          onClick={() => onCheck(unit.id, { refresh: hasChecked })}
          type="button"
        >
          {hasChecked ? (
            <RotateCw aria-hidden="true" className="size-4" />
          ) : (
            <ScanSearch aria-hidden="true" className="size-4" />
          )}
          {hasChecked ? "Yeniden kontrol et" : "Hazırlığı kontrol et"}
        </button>
        {/*
         * Absent from the DOM without `publish_content` — not disabled —
         * exactly as on the unit page.
         */}
        {hasPublishAbility ? (
          <PublishPanel
            buttonLabel={
              unit.status === "published"
                ? "Üniteyi yeniden yayınla"
                : "Üniteyi yayınla"
            }
            canPublish={summary?.canPublish ?? false}
            disabledReason={disabledReason(row)}
            isPending={publish.isPending}
            nodeCount={nodeCount(row)}
            onPublish={publish.publish}
            unitTitle={unit.title}
            warningCount={summary?.warnings ?? 0}
          />
        ) : null}
      </div>

      {publish.error === null ? null : (
        <div className="mt-3">
          <PublishErrorNotice
            blocking={publish.blocking}
            error={publish.error}
          />
        </div>
      )}

      <div className="mt-3" hidden={!isExpanded} id={detailsId}>
        {!isExpanded ? null : snapshot === undefined ||
          snapshot.nodesState !== "answered" ? (
          <p className="text-sm text-muted">
            Adımları görmek için hazırlığı kontrol edin.
          </p>
        ) : snapshot.nodes.length === 0 ? (
          <p className="text-sm text-muted">
            Bu ünitede adım yok; kontrol edilecek bir kural bulunmuyor.
          </p>
        ) : (
          <NodeReadinessDetails
            checks={snapshot.checks}
            label={`${unit.title} adımları`}
          />
        )}
      </div>
    </article>
  );
});
