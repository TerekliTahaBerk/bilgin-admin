"use client";

import { LoaderCircle, RotateCw, ScanSearch, Square } from "lucide-react";

import type { ScanCoverage } from "@/features/analytics/quality-dataset";
import type { ScanFailure } from "@/features/analytics/quality-scan";
import type { QualityScanState } from "@/features/analytics/use-quality-scan";

const primaryButton =
  "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60";

function failureLabel(
  failure: ScanFailure,
  courseName: (courseId: number) => string,
): string {
  return failure.kind === "course"
    ? `${courseName(failure.courseId)} — ünite listesi: ${failure.error.message}`
    : `${courseName(failure.courseId)} › ${failure.title}: ${failure.error.message}`;
}

function ProgressLine({ state }: { state: QualityScanState }) {
  const progress = state.progress;

  if (progress === null) {
    return <p className="text-sm text-muted">Tarama başlatılıyor…</p>;
  }

  const label =
    progress.phase === "units"
      ? `Ünite listeleri okunuyor: ${progress.completed}/${progress.total} ders`
      : `Soru listeleri okunuyor: ${progress.completed}/${progress.total} ünite`;
  const percent =
    progress.total === 0
      ? 100
      : Math.round((progress.completed / progress.total) * 100);

  return (
    <div className="space-y-1.5">
      <p className="text-sm text-muted">{label}</p>
      <div
        aria-label="Tarama ilerlemesi"
        aria-valuemax={progress.total}
        aria-valuemin={0}
        aria-valuenow={progress.completed}
        aria-valuetext={label}
        className="h-2 overflow-hidden rounded-full bg-surface-muted"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function OutcomeMessage({ state }: { state: QualityScanState }) {
  if (state.status === "completed" && state.failures.length === 0) {
    return <p className="text-sm text-muted">Tarama tamamlandı.</p>;
  }

  if (state.status === "cancelled") {
    return (
      <p className="text-sm text-muted">
        Tarama durduruldu. O ana kadar okunan sorular listede.
      </p>
    );
  }

  if (state.status === "halted" && state.haltError?.kind === "rate_limit") {
    const wait = state.haltError.retryAfterSeconds;

    return (
      <p className="text-sm text-danger">
        Sunucu çok fazla istek aldığını bildirdi; tarama durduruldu.
        {wait === undefined
          ? " Bir süre sonra tekrar deneyin."
          : ` ${wait} saniye sonra tekrar deneyin.`}
      </p>
    );
  }

  return null;
}

export type QualityScanPanelProps = Readonly<{
  coverage: ScanCoverage;
  loadedQuestions: number;
  scopeLabel: string;
  state: QualityScanState;
  courseName: (courseId: number) => string;
  onScan: (options: { refresh: boolean }) => void;
  onCancel: () => void;
  onRetryFailures: () => void;
}>;

/**
 * Shows how much of the chosen scope has been read and lets the admin read
 * the rest. Nothing is scanned until they ask: opening this page never
 * starts a catalogue-wide run of requests on its own.
 */
export function QualityScanPanel({
  coverage,
  loadedQuestions,
  scopeLabel,
  state,
  courseName,
  onScan,
  onCancel,
  onRetryFailures,
}: QualityScanPanelProps) {
  const isRunning = state.status === "running";
  const remaining = coverage.totalUnits - coverage.scannedUnits;
  const isComplete = coverage.totalUnits > 0 && remaining === 0;

  return (
    <section
      aria-labelledby="quality-scan-heading"
      className="rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold" id="quality-scan-heading">
            Veri kapsamı: {scopeLabel}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {coverage.scannedUnits}/{coverage.totalUnits} ünite tarandı ·{" "}
            {loadedQuestions} soru yüklendi
            {coverage.unlistedCourses > 0
              ? ` · ${coverage.unlistedCourses} dersin ünite listesi henüz okunmadı`
              : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 sm:shrink-0">
          {isRunning ? (
            <button
              className={secondaryButton}
              disabled={state.isCancelling}
              onClick={onCancel}
              type="button"
            >
              <Square aria-hidden="true" className="size-4" />
              {state.isCancelling ? "Durduruluyor…" : "Taramayı durdur"}
            </button>
          ) : (
            <>
              {isComplete || coverage.totalUnits === 0 ? null : (
                <button
                  className={primaryButton}
                  onClick={() => onScan({ refresh: false })}
                  type="button"
                >
                  <ScanSearch aria-hidden="true" className="size-4" />
                  {coverage.scannedUnits === 0
                    ? `Tara (${remaining} ünite)`
                    : `Kalanları tara (${remaining} ünite)`}
                </button>
              )}
              {coverage.scannedUnits > 0 ? (
                <button
                  className={secondaryButton}
                  onClick={() => onScan({ refresh: true })}
                  type="button"
                >
                  <RotateCw aria-hidden="true" className="size-4" />
                  Güncel verilerle yeniden tara
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div aria-live="polite" className="mt-3 space-y-2">
        {isRunning ? (
          <div className="flex items-start gap-2">
            <LoaderCircle
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 animate-spin text-muted"
            />
            <div className="min-w-0 flex-1">
              <ProgressLine state={state} />
            </div>
          </div>
        ) : (
          <OutcomeMessage state={state} />
        )}
      </div>

      {!isRunning && state.failures.length > 0 ? (
        <div
          className="mt-3 rounded-md border border-danger/30 bg-danger/5 p-3"
          role="alert"
        >
          <p className="text-sm font-medium text-danger">
            {state.failures.length} liste okunamadı. Diğer sonuçlar listede.
          </p>
          <details className="mt-1.5">
            <summary className="cursor-pointer text-sm text-muted">
              Ayrıntıları göster
            </summary>
            <ul className="mt-1.5 space-y-1 text-sm text-muted">
              {state.failures.map((failure) => (
                <li
                  key={
                    failure.kind === "course"
                      ? `course-${failure.courseId}`
                      : `unit-${failure.unitId}`
                  }
                >
                  {failureLabel(failure, courseName)}
                </li>
              ))}
            </ul>
          </details>
          <button
            className={`${secondaryButton} mt-2`}
            onClick={onRetryFailures}
            type="button"
          >
            <RotateCw aria-hidden="true" className="size-4" />
            Okunamayanları tekrar dene
          </button>
        </div>
      ) : null}

      {coverage.scannedUnits === 0 && !isRunning ? (
        <p className="mt-3 text-xs text-muted">
          Bu sayfa, ders ve ünite sayfalarında açtığınız soru listelerini
          otomatik olarak gösterir. Tüm kapsamı görmek için taramayı başlatın;
          tarama ünite başına bir liste isteği gönderir ve güncel listeleri
          yeniden istemez.
        </p>
      ) : null}
    </section>
  );
}
