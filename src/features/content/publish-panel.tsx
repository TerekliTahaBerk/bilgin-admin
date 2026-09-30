"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { PublishBlockingRow } from "@/contracts/admin/publication";
import { nodePreviewAnchorId } from "@/features/content/readiness";
import type { ApiError } from "@/lib/api/error";

const primaryButton =
  "rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

export type PublishPanelProps = Readonly<{
  /** Every node answered and none failed — the backend's own verdicts. */
  canPublish: boolean;
  isPending: boolean;
  nodeCount: number;
  onPublish: () => void;
  /** Named in the confirmation so it is clear which unit is being shipped. */
  unitTitle?: string;
  /** Nodes that pass with a widened filter or a live-pool warning. */
  warningCount?: number;
  /** Shown under a disabled button, so "why can't I publish" has an answer. */
  disabledReason?: string;
  /** Distinguishes several panels on one page for assistive technology. */
  buttonLabel?: string;
}>;

/**
 * The explicit, per-unit publish confirmation. There is no bulk variant on
 * purpose: every unit is confirmed on its own, with its own consequences
 * listed. Escape or "Vazgeç" cancels and returns focus to the button; opening
 * moves focus into the confirmation so keyboard and screen-reader users land
 * on what they are being asked.
 */
export function PublishPanel({
  canPublish,
  isPending,
  nodeCount,
  onPublish,
  unitTitle,
  warningCount = 0,
  disabledReason,
  buttonLabel = "Üniteyi yayınla",
}: PublishPanelProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const headingId = useId();
  const reasonId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (isConfirming) {
      headingRef.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [isConfirming]);

  const cancel = () => {
    returnFocus.current = true;
    setIsConfirming(false);
  };

  if (!isConfirming) {
    const isDisabled = !canPublish || isPending;
    const showReason = !canPublish && disabledReason !== undefined;

    return (
      <div className="flex flex-col items-start gap-1">
        <button
          aria-describedby={showReason ? reasonId : undefined}
          className={primaryButton}
          disabled={isDisabled}
          onClick={() => setIsConfirming(true)}
          ref={triggerRef}
          type="button"
        >
          {isPending ? "Yayınlanıyor…" : buttonLabel}
        </button>
        {showReason ? (
          <p className="text-xs text-muted" id={reasonId}>
            {disabledReason}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      aria-labelledby={headingId}
      className="w-full rounded-lg border border-border bg-surface-muted p-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          cancel();
        }
      }}
      role="group"
    >
      <h3
        className="text-sm font-semibold outline-none"
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
      >
        {unitTitle === undefined
          ? "Üniteyi yayınlamak üzeresiniz"
          : `«${unitTitle}» ünitesini yayınlamak üzeresiniz`}
      </h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
        <li>Ünite yayına alınır ve öğrencilere görünür olur.</li>
        <li>{nodeCount} adımın tamamı yayınlanır.</li>
        <li>
          Ünitenin arşivlenmemiş soruları (taslak ve incelemedekiler dâhil)
          yayınlanır.
        </li>
        <li>Arşivlenmiş sorular arşivde kalır; yayına dönmez.</li>
        {warningCount > 0 ? (
          <li className="text-amber-800">
            {warningCount} adımda uyarı var (gevşetilmiş kural veya öğrenciye
            giden soru sayısı). Yayın bunları engellemez.
          </li>
        ) : null}
        <li>
          Sunucu yayından hemen önce tüm adımları yeniden doğrular; bu arada bir
          adım yetersiz kalmışsa yayın yapılmaz.
        </li>
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className={primaryButton}
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
          onClick={cancel}
          type="button"
        >
          Vazgeç
        </button>
      </div>
    </div>
  );
}

/**
 * A refused or failed publish. The blocking rows are the backend's own
 * `details.blocking`; each links to that node's readiness row, which must be
 * on the page (`nodePreviewAnchorId`).
 */
export function PublishErrorNotice({
  error,
  blocking,
}: {
  error: ApiError;
  blocking: readonly PublishBlockingRow[];
}) {
  return (
    <div
      className="rounded-lg border border-red-200 bg-red-50 p-4"
      role="alert"
    >
      <h3 className="text-sm font-semibold text-red-900">
        Ünite yayınlanamadı
      </h3>
      <p className="mt-1.5 max-w-prose text-sm text-red-800">{error.message}</p>
      {blocking.length === 0 ? null : (
        <ul className="mt-2 space-y-1 text-sm text-red-800">
          {blocking.map((row) => (
            <li key={row.node_id}>
              {/*
               * No node detail route exists, so the link points at the
               * node's readiness row on this page. Inventing a route the app
               * does not serve would be a dead link.
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
  );
}
