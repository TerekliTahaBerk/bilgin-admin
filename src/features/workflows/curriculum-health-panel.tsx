"use client";

import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";

import type { Course } from "@/contracts/admin/content";
import { publishStatusLabels } from "@/features/content/content-labels";
import {
  countSignals,
  curriculumSignalLabels,
  curriculumSignals,
  variantMetrics,
  type CurriculumSection,
  type CurriculumSignal,
  type CurriculumVariant,
  type VariantMetrics,
} from "@/features/workflows/curriculum-health";
import {
  curriculumMappingQueryOptions,
  type CurriculumMapping,
} from "@/features/workflows/curriculum-queries";
import { toApiError, type ApiError } from "@/lib/api/error";
import type { CurriculumRow } from "@/contracts/admin/workflows";

const secondaryButton =
  "rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60";

export function SignalCount({
  signals,
  compact = false,
}: {
  signals: readonly CurriculumSignal[];
  compact?: boolean;
}) {
  const { errors, warnings } = countSignals(signals);

  if (errors === 0 && warnings === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
        <CheckCircle2 aria-hidden="true" className="size-3.5" />
        {compact ? "Sorun yok" : "Sinyal yok"}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs font-medium">
      {errors === 0 ? null : (
        <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-red-800">
          <AlertCircle aria-hidden="true" className="size-3.5" />
          {errors} hata
        </span>
      )}
      {warnings === 0 ? null : (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800">
          <AlertTriangle aria-hidden="true" className="size-3.5" />
          {warnings} uyarı
        </span>
      )}
    </span>
  );
}

function sectionText(metrics: VariantMetrics): string {
  return (
    metrics.sections
      .filter((section) => section.count > 0)
      .map((section) => `${section.name} ${section.count}`)
      .join(" · ") || "—"
  );
}

function statusText(metrics: VariantMetrics): string {
  return (
    (
      Object.entries(metrics.statuses) as [
        keyof typeof publishStatusLabels,
        number,
      ][]
    )
      .filter(([, count]) => count > 0)
      .map(([status, count]) => `${publishStatusLabels[status]} ${count}`)
      .join(" · ") || "—"
  );
}

function weightText(metrics: VariantMetrics): string {
  return metrics.weightMissing === 0
    ? `${metrics.weightTotal}`
    : `${metrics.weightTotal} (${metrics.weightMissing} boş)`;
}

/**
 * Every variant at a glance: one row each, from its saved mapping. Reads the
 * same mapping entries the editor uses, one request per variant.
 */
export function CurriculumHealthOverview({
  variants,
  sections,
  courses,
  selectedId,
  onSelect,
}: {
  variants: readonly CurriculumVariant[];
  sections: readonly CurriculumSection[];
  courses: readonly Course[] | undefined;
  selectedId: number | null;
  onSelect: (variantId: number) => void;
}) {
  const mappings = useQueries({
    queries: variants.map((variant) =>
      curriculumMappingQueryOptions(variant.id),
    ),
  }) as UseQueryResult<CurriculumMapping, ApiError>[];

  return (
    <section aria-labelledby="curriculum-health-heading" className="space-y-3">
      <div>
        <h2 className="text-base font-semibold" id="curriculum-health-heading">
          Müfredat sağlığı
        </h2>
        <p className="mt-0.5 max-w-prose text-sm text-muted">
          Her sınav varyantının kayıtlı eşlemesi. &quot;Hata&quot; veriden kesin
          görülen tutarsızlıktır; &quot;uyarı&quot; backend sözleşmesinin kesin
          doğrulayamadığı, kasıtlı da olabilecek durumlardır.
        </p>
      </div>

      {variants.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
          Tanımlı sınav varyantı yok.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[60rem] text-left text-sm">
            <caption className="sr-only">
              Varyant bazında müfredat sağlığı
            </caption>
            <thead className="border-b border-border text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium" scope="col">
                  Varyant
                </th>
                <th className="px-3 py-2 text-right font-medium" scope="col">
                  Ders
                </th>
                <th className="px-3 py-2 text-right font-medium" scope="col">
                  Zorunlu
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  Ücretsiz / Premium
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  Oturumlar
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  Sınav ağırlığı
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  Ders durumu
                </th>
                <th className="px-3 py-2 text-right font-medium" scope="col">
                  Ünite
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  Sinyaller
                </th>
                <th className="px-3 py-2" scope="col">
                  <span className="sr-only">İşlem</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {variants.map((variant, index) => {
                const query = mappings[index]!;
                const rows = query.data?.courses;
                const metrics =
                  rows === undefined
                    ? null
                    : variantMetrics(variant, rows, sections, courses);
                const signals =
                  rows === undefined
                    ? null
                    : curriculumSignals(variant, rows, sections, courses, {
                        mode: "saved",
                      });
                const selected = variant.id === selectedId;

                return (
                  <tr
                    className={selected ? "bg-primary-soft/60" : undefined}
                    key={variant.id}
                  >
                    <th className="px-3 py-2 font-normal" scope="row">
                      <span className="font-medium">{variant.name}</span>
                      <span className="block text-xs text-muted">
                        {variant.code}
                        {variant.is_active ? "" : " · Pasif"}
                      </span>
                    </th>
                    {metrics === null || signals === null ? (
                      <td className="px-3 py-2" colSpan={8}>
                        {query.isError ? (
                          <span
                            className="inline-flex items-center gap-2 text-xs text-danger"
                            role="alert"
                          >
                            Eşleme okunamadı: {toApiError(query.error).message}
                            <button
                              className={secondaryButton}
                              disabled={query.isFetching}
                              onClick={() => void query.refetch()}
                              type="button"
                            >
                              Tekrar dene
                            </button>
                          </span>
                        ) : (
                          <span aria-busy="true" className="text-xs text-muted">
                            Yükleniyor…
                          </span>
                        )}
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {metrics.courseCount}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {metrics.requiredCount}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {metrics.freeCount} / {metrics.premiumCount}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {sectionText(metrics)}
                        </td>
                        <td className="px-3 py-2 text-xs tabular-nums">
                          {weightText(metrics)}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {statusText(metrics)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {metrics.unitTotal ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          <SignalCount compact signals={signals} />
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2 text-right">
                      <button
                        aria-label={`${variant.name} eşlemesini aç`}
                        aria-pressed={selected}
                        className={secondaryButton}
                        onClick={() => onSelect(variant.id)}
                        type="button"
                      >
                        {selected ? "Açık" : "Eşlemeyi aç"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * The selected variant's health and pre-save validation, from the editor's
 * rows — so it follows unsaved edits live — with each row signal linking to
 * its row. Errors block the save; warnings do not.
 */
export function VariantHealthDetail({
  variant,
  rows,
  sections,
  courses,
  signals,
  hasUnsavedChanges,
  onFocusCourse,
}: {
  variant: CurriculumVariant;
  rows: readonly CurriculumRow[];
  sections: readonly CurriculumSection[];
  courses: readonly Course[] | undefined;
  signals: readonly CurriculumSignal[];
  hasUnsavedChanges: boolean;
  onFocusCourse: (courseId: number) => void;
}) {
  const metrics = variantMetrics(variant, rows, sections, courses);

  return (
    <section
      aria-labelledby="variant-health-heading"
      className="space-y-3 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold" id="variant-health-heading">
          {variant.name} · sağlık
          {hasUnsavedChanges ? (
            <span className="ml-2 text-xs font-normal text-amber-700">
              (kaydedilmemiş değişiklikler dahil)
            </span>
          ) : null}
        </h2>
        <SignalCount signals={signals} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted">Ders / zorunlu</dt>
          <dd className="font-medium tabular-nums">
            {metrics.courseCount} / {metrics.requiredCount}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Ücretsiz / premium</dt>
          <dd className="font-medium tabular-nums">
            {metrics.freeCount} / {metrics.premiumCount}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Sınav ağırlığı toplamı</dt>
          <dd className="font-medium tabular-nums">{weightText(metrics)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Toplam ünite</dt>
          <dd className="font-medium tabular-nums">
            {metrics.unitTotal ?? "—"}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-muted">Oturum dağılımı</dt>
          <dd>{sectionText(metrics)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-muted">Ders durumu</dt>
          <dd>{statusText(metrics)}</dd>
        </div>
      </dl>

      {signals.length === 0 ? null : (
        <ul className="space-y-1.5">
          {signals.map((signal) => (
            <li
              className={`flex flex-col gap-1 rounded-md border px-3 py-2 text-sm sm:flex-row sm:items-start sm:justify-between ${
                signal.severity === "error"
                  ? "border-red-200 bg-red-50 text-red-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
              key={signal.id}
            >
              <div>
                <p className="font-medium">
                  {signal.severity === "error"
                    ? "Hata (kaydı engeller)"
                    : "Uyarı"}{" "}
                  · {curriculumSignalLabels[signal.kind]}
                </p>
                <p className="text-xs">{signal.message}</p>
              </div>
              {signal.courseId === undefined ? null : (
                <button
                  className={`${secondaryButton} shrink-0 self-start text-foreground`}
                  onClick={() => onFocusCourse(signal.courseId!)}
                  type="button"
                >
                  Satıra git
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
