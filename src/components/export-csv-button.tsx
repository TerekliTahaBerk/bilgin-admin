"use client";

import { Download } from "lucide-react";

import { downloadCsv, toCsv, type CsvColumn } from "@/lib/export/csv";

export type ExportCsvButtonProps<T> = Readonly<{
  rows: readonly T[];
  columns: readonly CsvColumn<T>[];
  filename: string;
  label?: string;
}>;

/**
 * A pure client-side export: it turns data already on the page into a CSV
 * file and hands it to the browser's own download flow. No request leaves
 * the app and no backend endpoint is involved.
 */
export function ExportCsvButton<T>({
  rows,
  columns,
  filename,
  label = "CSV olarak indir",
}: ExportCsvButtonProps<T>) {
  return (
    <button
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
      disabled={rows.length === 0}
      onClick={() => downloadCsv(filename, toCsv(rows, columns))}
      type="button"
    >
      <Download aria-hidden="true" className="size-4" />
      {label}
    </button>
  );
}
