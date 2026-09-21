export type CsvColumn<T> = Readonly<{
  header: string;
  value: (row: T) => string | number | null | undefined;
}>;

/** RFC 4180 quoting: only when the field actually needs it. */
function escapeCsvField(raw: string): string {
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

/**
 * Builds a CSV string from arbitrary rows and an explicit column list, so the
 * exported file's columns are always deliberate — never "every own-enumerable
 * key a backend object happens to carry".
 */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [columns.map((column) => escapeCsvField(column.header)).join(",")];

  for (const row of rows) {
    lines.push(
      columns
        .map((column) => escapeCsvField(String(column.value(row) ?? "")))
        .join(","),
    );
  }

  // CRLF is the RFC 4180 line ending and what Excel expects without guessing.
  return lines.join("\r\n");
}

/**
 * Triggers a browser download of the given CSV text. The UTF-8 BOM keeps
 * Excel from mangling Turkish characters (ç, ğ, ı, ö, ş, ü) when it opens the
 * file with its default "ANSI" guess instead of UTF-8.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(url);
  }
}
