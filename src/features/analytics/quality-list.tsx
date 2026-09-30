"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { memo, useState } from "react";

import { isSupportedEditorType } from "@/contracts/admin/exercise-editor";
import { ExportCsvButton } from "@/components/export-csv-button";
import type { QualityRow } from "@/features/analytics/quality-dataset";
import {
  qualitySortKeys,
  qualitySortLabels,
  type QualitySort,
  type QualitySortKey,
} from "@/features/analytics/quality-filters";
import {
  courseScopeLabels,
  exerciseTypeLabels,
  publishStatusLabels,
} from "@/features/content/content-labels";
import { StatusBadge } from "@/features/content/status-badges";
import type { CsvColumn } from "@/lib/export/csv";

/** Rows rendered per step; the rest wait behind "Daha fazla göster". */
export const QUALITY_PAGE_SIZE = 50;

export const NOT_SOLVED_LABEL = "Henüz çözülmedi";

function previewText(row: QualityRow): string {
  return row.preview.trim() === "" ? "(önizleme yok)" : row.preview;
}

export function correctRateText(row: QualityRow): string {
  return row.stats.correct_rate === null
    ? NOT_SOLVED_LABEL
    : `%${row.stats.correct_rate}`;
}

export function avgSecondsText(row: QualityRow): string {
  return row.stats.avg_seconds === null ? "—" : `${row.stats.avg_seconds} sn`;
}

export function unitHref(row: QualityRow): string {
  return `/courses/${row.course.id}/units/${row.unit.id}`;
}

/**
 * The editor for admins who can edit a type the editor supports; everyone
 * else gets the unit's question list, which is the read-only detail view
 * (the editor itself shows "no access" to a read-only admin).
 */
export function exerciseHref(row: QualityRow, canEdit: boolean): string {
  return canEdit && isSupportedEditorType(row.type)
    ? `${unitHref(row)}/exercises/${row.id}`
    : unitHref(row);
}

export const qualityCsvColumns: readonly CsvColumn<QualityRow>[] = [
  { header: "Soru no", value: (row) => row.id },
  { header: "Ders", value: (row) => row.course.name },
  { header: "Ünite", value: (row) => row.unit.title },
  { header: "Önizleme", value: (row) => row.preview },
  { header: "Tip", value: (row) => exerciseTypeLabels[row.type] },
  { header: "Konu", value: (row) => row.topic.name },
  { header: "Zorluk", value: (row) => row.difficulty },
  { header: "Durum", value: (row) => publishStatusLabels[row.status] },
  { header: "Sürüm", value: (row) => row.version },
  {
    header: "Kapsamlar",
    value: (row) =>
      row.scopes.map((scope) => courseScopeLabels[scope]).join(" "),
  },
  { header: "Deneme", value: (row) => row.stats.attempts },
  // Empty, never 0, for a question nobody has attempted.
  { header: "Doğru oranı (%)", value: (row) => row.stats.correct_rate },
  { header: "Ortalama süre (sn)", value: (row) => row.stats.avg_seconds },
  {
    header: "İnceleme gerekli",
    value: (row) => (row.stats.needs_review ? "Evet" : "Hayır"),
  },
];

const QualityRowItem = memo(function QualityRowItem({
  row,
  canEdit,
}: {
  row: QualityRow;
  canEdit: boolean;
}) {
  const href = exerciseHref(row, canEdit);
  const opensEditor = href !== unitHref(row);

  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:px-5">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-4">
        <div className="min-w-0 flex-1">
          <Link
            aria-label={`${opensEditor ? "Soruyu düzenle" : "Soruyu ünitede görüntüle"}: ${previewText(row)}`}
            className="text-sm font-medium break-words hover:text-primary hover:underline"
            href={href}
          >
            {previewText(row)}
          </Link>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span>#{row.id}</span>
            <span aria-hidden="true">·</span>
            <span>
              {row.course.name} › {row.unit.title}
            </span>
            <span aria-hidden="true">·</span>
            <span>{exerciseTypeLabels[row.type]}</span>
            <span aria-hidden="true">·</span>
            <span>{row.topic.name}</span>
            <span aria-hidden="true">·</span>
            <span>Zorluk {row.difficulty}</span>
            {row.scopes.length === 0 ? null : (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {row.scopes
                    .map((scope) => courseScopeLabels[scope])
                    .join(", ")}
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>
              Sürüm {row.version}
              {row.version > 1 ? " (düzenlenmiş)" : ""}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:shrink-0 sm:justify-end">
          {row.stats.needs_review ? (
            <span className="inline-flex shrink-0 items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
              İnceleme gerekli
            </span>
          ) : null}
          <StatusBadge status={row.status} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <div className="flex gap-1">
            <dt className="text-muted">Deneme:</dt>
            <dd className="font-medium">{row.stats.attempts}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="text-muted">Doğru oranı:</dt>
            <dd
              className={
                row.stats.correct_rate === null ? "text-muted" : "font-medium"
              }
            >
              {correctRateText(row)}
            </dd>
          </div>
          <div className="flex gap-1">
            <dt className="text-muted">Ort. süre:</dt>
            <dd
              className={
                row.stats.avg_seconds === null ? "text-muted" : "font-medium"
              }
            >
              {avgSecondsText(row)}
            </dd>
          </div>
        </dl>
        {opensEditor ? (
          <Link
            className="text-xs font-semibold text-primary hover:underline"
            href={unitHref(row)}
          >
            Ünitede göster
          </Link>
        ) : null}
      </div>
    </li>
  );
});

function SortControls({
  sort,
  onChange,
}: {
  sort: QualitySort;
  onChange: (next: QualitySort) => void;
}) {
  const DirectionIcon = sort.direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <div className="flex items-end gap-2">
      <div>
        <label className="block text-xs font-medium" htmlFor="quality-sort">
          Sırala
        </label>
        <select
          className="mt-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
          id="quality-sort"
          onChange={(event) =>
            onChange({
              key: event.target.value as QualitySortKey,
              direction: sort.direction,
            })
          }
          value={sort.key}
        >
          {qualitySortKeys.map((key) => (
            <option key={key} value={key}>
              {qualitySortLabels[key]}
            </option>
          ))}
        </select>
      </div>
      <button
        aria-label={
          sort.direction === "asc"
            ? "Artan sırada; azalan sıraya çevir"
            : "Azalan sırada; artan sıraya çevir"
        }
        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted"
        onClick={() =>
          onChange({
            key: sort.key,
            direction: sort.direction === "asc" ? "desc" : "asc",
          })
        }
        type="button"
      >
        <DirectionIcon aria-hidden="true" className="size-4" />
        {sort.direction === "asc" ? "Artan" : "Azalan"}
      </button>
    </div>
  );
}

export type QualityListProps = Readonly<{
  rows: readonly QualityRow[];
  canEdit: boolean;
  sort: QualitySort;
  onSortChange: (next: QualitySort) => void;
  isUpdating: boolean;
}>;

/**
 * Renders a page of rows at a time: a scanned catalogue can hold thousands of
 * questions, and mounting them all at once would make every filter change
 * slow. The parent remounts this list (via `key`) when the view changes, so
 * the page count starts over with each new filter.
 */
export const QualityList = memo(function QualityList({
  rows,
  canEdit,
  sort,
  onSortChange,
  isUpdating,
}: QualityListProps) {
  const [visibleCount, setVisibleCount] = useState(QUALITY_PAGE_SIZE);
  const visible = rows.slice(0, visibleCount);

  return (
    <section aria-labelledby="quality-list-heading" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold" id="quality-list-heading">
            Sorular
          </h2>
          <p aria-live="polite" className="mt-0.5 text-sm text-muted">
            <strong className="font-semibold text-foreground">
              {rows.length}
            </strong>{" "}
            soru eşleşiyor
            {rows.length > visible.length
              ? ` · ilk ${visible.length} gösteriliyor`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <SortControls onChange={onSortChange} sort={sort} />
          <ExportCsvButton
            columns={qualityCsvColumns}
            filename="soru-kalitesi.csv"
            rows={rows}
          />
        </div>
      </div>

      <ul
        aria-busy={isUpdating}
        aria-label="Soru listesi"
        className={`divide-y divide-border rounded-lg border border-border bg-surface transition-opacity ${
          isUpdating ? "opacity-70" : ""
        }`}
      >
        {visible.map((row) => (
          <QualityRowItem canEdit={canEdit} key={row.id} row={row} />
        ))}
      </ul>

      {rows.length > visible.length ? (
        <div className="flex justify-center">
          <button
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-muted"
            onClick={() =>
              setVisibleCount((count) => count + QUALITY_PAGE_SIZE)
            }
            type="button"
          >
            Daha fazla göster (
            {Math.min(QUALITY_PAGE_SIZE, rows.length - visible.length)} soru
            daha)
          </button>
        </div>
      ) : null}
    </section>
  );
});
