/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadCsv, toCsv } from "@/lib/export/csv";

type Row = Readonly<{ name: string; count: number; note: string | null }>;

const columns = [
  { header: "Ad", value: (row: Row) => row.name },
  { header: "Sayı", value: (row: Row) => row.count },
  { header: "Not", value: (row: Row) => row.note },
];

describe("toCsv", () => {
  it("renders a header row and one row per item", () => {
    const rows: Row[] = [
      { name: "TYT Matematik", count: 5, note: null },
      { name: "AYT Fizik", count: 2, note: "aktif" },
    ];

    expect(toCsv(rows, columns)).toBe(
      "Ad,Sayı,Not\r\nTYT Matematik,5,\r\nAYT Fizik,2,aktif",
    );
  });

  it("quotes fields containing a comma, quote or newline", () => {
    const rows: Row[] = [
      { name: 'Ders, "Özel"', count: 1, note: "satır\ndevamı" },
    ];

    expect(toCsv(rows, columns)).toBe(
      'Ad,Sayı,Not\r\n"Ders, ""Özel""",1,"satır\ndevamı"',
    );
  });

  it("renders an empty body for zero rows, keeping the header", () => {
    expect(toCsv([], columns)).toBe("Ad,Sayı,Not");
  });
});

describe("downloadCsv", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an object URL, clicks a download link and revokes the URL", () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    downloadCsv("dersler.csv", "Ad\r\nTYT");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

    vi.unstubAllGlobals();
  });
});
