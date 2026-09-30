/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import { summarizeQuality } from "@/features/analytics/quality-dataset";
import {
  DEFAULT_QUALITY_SORT,
  type QualityViewState,
} from "@/features/analytics/quality-filters";
import {
  QualityPresetBar,
  QualitySummaryTiles,
} from "@/features/analytics/quality-summary";
import { qualityRow } from "@/test/fixtures/quality";

const summary = summarizeQuality([
  qualityRow(1, { status: "draft" }),
  qualityRow(2, {
    status: "review",
    version: 2,
    stats: { attempts: 30, correct_rate: 96, needs_review: true },
  }),
  qualityRow(3, { stats: { attempts: 10, correct_rate: 20 } }),
  qualityRow(4, { status: "archived" }),
]);

const scoped: QualityViewState = {
  filters: { courseId: 2, unitId: 20, difficulty: 3 },
  sort: DEFAULT_QUALITY_SORT,
};

function tile(name: RegExp) {
  return screen.getByRole("button", { name });
}

describe("QualitySummaryTiles", () => {
  it("shows every required metric", () => {
    render(
      <QualitySummaryTiles
        onChange={vi.fn()}
        state={scoped}
        summary={summary}
      />,
    );

    const expected: [RegExp, string][] = [
      [/Taranan soru/, "4"],
      [/İnceleme gerekli/, "1"],
      [/Hiç çözülmemiş/, "2"],
      [/Yüksek doğru oranı/, "1"],
      [/Düşük doğru oranı/, "1"],
      [/Düzenlenmiş/, "1"],
      [/^\d+Taslak$/, "1"],
      [/^\d+İncelemede$/, "1"],
      [/^\d+Yayında$/, "1"],
      [/^\d+Arşiv$/, "1"],
    ];

    for (const [name, value] of expected) {
      expect(tile(name).textContent?.startsWith(value)).toBe(true);
    }
  });

  it("applies the matching view and keeps the course/unit scope", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <QualitySummaryTiles
        onChange={onChange}
        state={scoped}
        summary={summary}
      />,
    );

    await user.click(tile(/İnceleme gerekli/));
    expect(onChange).toHaveBeenLastCalledWith({
      filters: { courseId: 2, unitId: 20, needsReview: true },
      sort: { key: "attempts", direction: "desc" },
    });

    await user.click(tile(/^\d+Yayında$/));
    expect(onChange).toHaveBeenLastCalledWith({
      filters: { courseId: 2, unitId: 20, status: "published" },
      sort: DEFAULT_QUALITY_SORT,
    });

    await user.click(tile(/^\d+Taslak$/));
    expect(onChange).toHaveBeenLastCalledWith({
      filters: { courseId: 2, unitId: 20, status: "draft" },
      sort: DEFAULT_QUALITY_SORT,
    });

    await user.click(tile(/Taranan soru/));
    expect(onChange).toHaveBeenLastCalledWith({
      filters: { courseId: 2, unitId: 20 },
      sort: DEFAULT_QUALITY_SORT,
    });
  });

  it("marks the tile for the current view as pressed", () => {
    render(
      <QualitySummaryTiles
        onChange={vi.fn()}
        state={{
          filters: { courseId: 1, status: "archived" },
          sort: DEFAULT_QUALITY_SORT,
        }}
        summary={summary}
      />,
    );

    expect(tile(/^\d+Arşiv$/).getAttribute("aria-pressed")).toBe("true");
    expect(tile(/Taranan soru/).getAttribute("aria-pressed")).toBe("false");
  });
});

describe("QualityPresetBar", () => {
  it("lists 'Tümü' and the ten views", () => {
    render(<QualityPresetBar onChange={vi.fn()} state={scoped} />);

    expect(
      within(screen.getByRole("group", { name: "Hazır görünümler" }))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual([
      "Tümü",
      "İnceleme gerekli",
      "Hiç çözülmemiş",
      "Çok düşük doğru oranı",
      "Çok yüksek doğru oranı",
      "En yavaş çözülenler",
      "En hızlı çözülenler",
      "En çok çözülenler",
      "Düzenlenmiş sorular",
      "Taslaklar",
      "İncelemedekiler",
    ]);
  });

  it("applies a view inside the scope", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<QualityPresetBar onChange={onChange} state={scoped} />);

    await user.click(
      screen.getByRole("button", { name: "En yavaş çözülenler" }),
    );
    expect(onChange).toHaveBeenLastCalledWith({
      filters: { courseId: 2, unitId: 20, secondsMin: 0 },
      sort: { key: "avg_seconds", direction: "desc" },
    });

    await user.click(screen.getByRole("button", { name: "Tümü" }));
    expect(onChange).toHaveBeenLastCalledWith({
      filters: { courseId: 2, unitId: 20 },
      sort: DEFAULT_QUALITY_SORT,
    });
  });

  it("marks the active view", () => {
    render(
      <QualityPresetBar
        onChange={vi.fn()}
        state={{
          filters: { courseId: 1, edited: true },
          sort: { key: "version", direction: "desc" },
        }}
      />,
    );

    expect(
      screen
        .getByRole("button", { name: "Düzenlenmiş sorular" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Tümü" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("marks 'Tümü' when no list filter is set", () => {
    render(
      <QualityPresetBar
        onChange={vi.fn()}
        state={{ filters: { courseId: 1 }, sort: DEFAULT_QUALITY_SORT }}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Tümü" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });
});
