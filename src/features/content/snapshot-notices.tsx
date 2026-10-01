"use client";

import { RotateCw, ScanLine } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { scanCompletion } from "@/features/content/content-scan";
import { formatScanTime } from "@/features/content/content-scan-center";
import { useContentScan } from "@/features/content/content-scan-provider";
import type { ContentSnapshot } from "@/features/content/content-snapshot";

const primaryButton =
  "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Shown by every screen that is built only on the full-scan snapshot when
 * there is none yet: says so, explains why (`children`), and offers the scan
 * instead of presenting whatever happens to be cached as the whole catalogue.
 */
export function ScanRequiredNotice({ children }: { children: ReactNode }) {
  const { state, start } = useContentScan();
  const run = state.run;
  const completion =
    run?.progress == null ? null : scanCompletion(run.progress, true);

  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-base font-semibold">Tam içerik taraması yapılmadı</h2>
      <p className="mt-1.5 max-w-prose text-sm text-muted">{children}</p>
      <div
        aria-live="polite"
        className="mt-4 flex flex-wrap items-center gap-3"
      >
        {run === null ? (
          <button
            className={primaryButton}
            onClick={() => start()}
            type="button"
          >
            <ScanLine aria-hidden="true" className="size-4" />
            Taramayı başlat
          </button>
        ) : (
          <p className="text-sm text-muted">
            Tarama sürüyor
            {completion === null ? "…" : ` (%${Math.round(completion * 100)})`}
          </p>
        )}
        <Link
          className="text-sm font-medium text-primary underline"
          href="/scan"
        >
          Tarama ayrıntıları
        </Link>
      </div>
      {state.lastOutcome !== null &&
      state.lastOutcome.status !== "complete" &&
      state.lastOutcome.status !== "partial" &&
      run === null ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          Son tarama bir sonuç üretmedi. Ayrıntılar için tarama sayfasına bakın.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Which scan the screen is reading, with a refresh. Changes made after the
 * scan only show up once it is re-run, and the screen says so.
 */
export function SnapshotSourceBar({ snapshot }: { snapshot: ContentSnapshot }) {
  const { state, start } = useContentScan();

  return (
    <section
      aria-label="Veri kaynağı"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="text-sm">
        <p>
          Veri:{" "}
          <time className="font-medium" dateTime={snapshot.generatedAt}>
            {formatScanTime(snapshot.generatedAt)}
          </time>{" "}
          tarihli tam tarama
          {snapshot.status === "partial" ? (
            <span className="text-danger"> (eksik)</span>
          ) : null}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          Taramadan sonraki değişiklikler yeniden taranana kadar burada
          görünmez.
        </p>
      </div>
      <button
        className={secondaryButton}
        disabled={state.run !== null}
        onClick={() => start({ refresh: true })}
        type="button"
      >
        <RotateCw aria-hidden="true" className="size-4" />
        {state.run === null ? "Yeniden tara" : "Tarama sürüyor…"}
      </button>
    </section>
  );
}
