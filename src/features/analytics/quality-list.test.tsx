/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import {
  avgSecondsText,
  correctRateText,
  exerciseHref,
  NOT_SOLVED_LABEL,
  QUALITY_PAGE_SIZE,
  qualityCsvColumns,
  QualityList,
  unitHref,
} from "@/features/analytics/quality-list";
import { DEFAULT_QUALITY_SORT } from "@/features/analytics/quality-filters";
import type { QualityRow } from "@/features/analytics/quality-dataset";
import { toCsv } from "@/lib/export/csv";
import { qualityRow } from "@/test/fixtures/quality";

// A row whose stats reach the calibration sample renders the difficulty
// action, which reads the router and the query client.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

const location = {
  course: { id: 3, name: "AYT Fizik" },
  unit: { id: 30, title: "Kuvvet" },
};

function renderList(
  rows: readonly QualityRow[],
  { canEdit = true, onSortChange = vi.fn() } = {},
) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <QualityList
        canEdit={canEdit}
        isUpdating={false}
        onSortChange={onSortChange}
        rows={rows}
        sort={DEFAULT_QUALITY_SORT}
      />
    </QueryClientProvider>,
  );

  return { onSortChange };
}

describe("row text helpers", () => {
  it("shows 'Henüz çözülmedi' — never 0% — for an unsolved question", () => {
    expect(correctRateText(qualityRow(1))).toBe(NOT_SOLVED_LABEL);
    expect(
      correctRateText(
        qualityRow(1, { stats: { attempts: 4, correct_rate: 0 } }),
      ),
    ).toBe("%0");
  });

  it("shows a dash for missing timing", () => {
    expect(avgSecondsText(qualityRow(1))).toBe("—");
    expect(
      avgSecondsText(
        qualityRow(1, { stats: { attempts: 2, avg_seconds: 14 } }),
      ),
    ).toBe("14 sn");
  });
});

describe("exerciseHref", () => {
  it("opens the editor for an editor", () => {
    expect(exerciseHref(qualityRow(7, location), true)).toBe(
      "/courses/3/units/30/exercises/7",
    );
  });

  it("opens the unit's question list for a read-only admin", () => {
    expect(exerciseHref(qualityRow(7, location), false)).toBe(
      "/courses/3/units/30",
    );
    expect(unitHref(qualityRow(7, location))).toBe("/courses/3/units/30");
  });
});

describe("qualityCsvColumns", () => {
  it("exports an empty cell, not 0, for a missing rate", () => {
    const csv = toCsv(
      [
        qualityRow(1, { ...location, preview: "Soru, virgüllü" }),
        qualityRow(2, {
          ...location,
          scopes: ["tyt", "ayt"],
          stats: {
            attempts: 20,
            correct_rate: 96,
            avg_seconds: 9,
            needs_review: true,
          },
        }),
      ],
      qualityCsvColumns,
    );

    expect(csv.split("\r\n")).toEqual([
      "Soru no,Ders,Ünite,Önizleme,Tip,Konu,Zorluk,Durum,Sürüm,Kapsamlar,Deneme,Doğru oranı (%),Ortalama süre (sn),İnceleme gerekli,Performans sinyali (tahmini zorluk)",
      '1,AYT Fizik,Kuvvet,"Soru, virgüllü",Çoktan Seçmeli,İlk Türk Devletleri,3,Yayında,1,TYT,0,,,Hayır,',
      "2,AYT Fizik,Kuvvet,Soru 2,Çoktan Seçmeli,İlk Türk Devletleri,3,Yayında,1,TYT AYT,20,96,9,Evet,1",
    ]);
  });
});

describe("QualityList", () => {
  it("renders a row with its location, stats and backend flags", () => {
    renderList([
      qualityRow(7, {
        ...location,
        preview: "Newton'un ikinci yasası",
        status: "review",
        version: 3,
        stats: {
          attempts: 40,
          correct_rate: 97,
          avg_seconds: 12,
          needs_review: true,
        },
      }),
    ]);

    const item = within(
      screen.getByRole("list", { name: "Soru listesi" }),
    ).getAllByRole("listitem")[0]!;

    expect(
      within(item)
        .getByRole("link", {
          name: "Soruyu düzenle: Newton'un ikinci yasası",
        })
        .getAttribute("href"),
    ).toBe("/courses/3/units/30/exercises/7");
    expect(
      within(item)
        .getByRole("link", { name: "Ünitede göster" })
        .getAttribute("href"),
    ).toBe("/courses/3/units/30");
    expect(within(item).getByText("AYT Fizik › Kuvvet")).toBeDefined();
    expect(within(item).getByText("İnceleme gerekli")).toBeDefined();
    expect(within(item).getByText("İncelemede")).toBeDefined();
    expect(within(item).getByText("Sürüm 3 (düzenlenmiş)")).toBeDefined();
    expect(within(item).getByText("%97")).toBeDefined();
    expect(within(item).getByText("12 sn")).toBeDefined();
    expect(within(item).getByText("40")).toBeDefined();
  });

  it("shows 'Henüz çözülmedi' and no review badge for an unflagged unsolved question", () => {
    renderList([qualityRow(1, location)]);

    expect(screen.getByText(NOT_SOLVED_LABEL)).toBeDefined();
    expect(screen.queryByText("%0")).toBeNull();
    expect(screen.queryByText("İnceleme gerekli")).toBeNull();
  });

  it("links a read-only admin to the unit page and hides the second link", () => {
    renderList([qualityRow(1, { ...location, preview: "Soru bir" })], {
      canEdit: false,
    });

    expect(
      screen
        .getByRole("link", { name: "Soruyu ünitede görüntüle: Soru bir" })
        .getAttribute("href"),
    ).toBe("/courses/3/units/30");
    expect(screen.queryByRole("link", { name: "Ünitede göster" })).toBeNull();
  });

  it("falls back to a placeholder for an empty preview", () => {
    renderList([qualityRow(1, { ...location, preview: "  " })]);

    expect(screen.getByText("(önizleme yok)")).toBeDefined();
  });

  it("renders one page at a time and reveals more on request", async () => {
    const user = userEvent.setup();
    const rows = Array.from({ length: QUALITY_PAGE_SIZE * 2 + 5 }, (_, index) =>
      qualityRow(index + 1, location),
    );

    renderList(rows);

    const list = () => screen.getByRole("list", { name: "Soru listesi" });
    expect(within(list()).getAllByRole("listitem")).toHaveLength(
      QUALITY_PAGE_SIZE,
    );
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent === "105 soru eşleşiyor · ilk 50 gösteriliyor",
      ),
    ).toBeDefined();

    await user.click(
      screen.getByRole("button", { name: /Daha fazla göster \(50/ }),
    );
    expect(within(list()).getAllByRole("listitem")).toHaveLength(
      QUALITY_PAGE_SIZE * 2,
    );

    await user.click(
      screen.getByRole("button", { name: /Daha fazla göster \(5/ }),
    );
    expect(within(list()).getAllByRole("listitem")).toHaveLength(105);
    expect(
      screen.queryByRole("button", { name: /Daha fazla göster/ }),
    ).toBeNull();
  });

  it("changes the sort key and flips the direction", async () => {
    const user = userEvent.setup();
    const { onSortChange } = renderList([qualityRow(1, location)]);

    await user.selectOptions(screen.getByLabelText("Sırala"), "correct_rate");
    expect(onSortChange).toHaveBeenLastCalledWith({
      key: "correct_rate",
      direction: "asc",
    });

    await user.click(
      screen.getByRole("button", { name: "Artan sırada; azalan sıraya çevir" }),
    );
    expect(onSortChange).toHaveBeenLastCalledWith({
      key: "id",
      direction: "desc",
    });
  });

  it("offers every sort key", () => {
    renderList([qualityRow(1, location)]);

    expect(
      within(screen.getByLabelText("Sırala"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      "Deneme sayısı",
      "Doğru oranı",
      "Ortalama süre",
      "Zorluk",
      "Sürüm",
      "Soru no",
    ]);
  });

  it("offers the CSV export of the matching rows", () => {
    renderList([qualityRow(1, location)]);

    expect(
      (
        screen.getByRole("button", {
          name: "CSV olarak indir",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
});
