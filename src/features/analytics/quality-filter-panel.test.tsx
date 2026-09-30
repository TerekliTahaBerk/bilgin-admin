/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import {
  parseBoundInput,
  QualityFilterPanel,
  RANGE_COMMIT_DELAY_MS,
  type QualityFilterPanelProps,
} from "@/features/analytics/quality-filter-panel";
import type { QualityFilters } from "@/features/analytics/quality-filters";
import { qualityCourse, qualityUnit } from "@/test/fixtures/quality";

const courses = [
  qualityCourse(1, { name: "TYT Tarih" }),
  qualityCourse(2, { name: "AYT Fizik" }),
];

function renderPanel(props: Partial<QualityFilterPanelProps> = {}) {
  const onChange = vi.fn<(next: QualityFilters) => void>();
  const all: QualityFilterPanelProps = {
    filters: {},
    courses,
    units: undefined,
    unitsPending: false,
    unitsError: null,
    topics: [
      { id: 5, name: "Kuvvet" },
      { id: 6, name: "Enerji" },
    ],
    onChange,
    ...props,
  };
  const view = render(<QualityFilterPanel {...all} />);

  return {
    onChange,
    rerender: (next: Partial<QualityFilterPanelProps>) =>
      view.rerender(<QualityFilterPanel {...all} {...next} />),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("parseBoundInput", () => {
  it.each([
    ["", { ok: true, value: undefined }],
    ["  ", { ok: true, value: undefined }],
    ["0", { ok: true, value: 0 }],
    [" 42 ", { ok: true, value: 42 }],
    ["100", { ok: true, value: 100 }],
    ["101", { ok: false }],
    ["-1", { ok: false }],
    ["1,5", { ok: false }],
    ["abc", { ok: false }],
  ] as const)("parses %j against max 100", (raw, expected) => {
    expect(parseBoundInput(raw, { max: 100 })).toEqual(expected);
  });
});

describe("QualityFilterPanel selects", () => {
  it("changing the course drops the unit and topic", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPanel({
      filters: { courseId: 1, unitId: 10, topicId: 5, status: "draft" },
      units: [qualityUnit(10)],
    });

    await user.selectOptions(screen.getByLabelText("Ders"), "2");

    expect(onChange).toHaveBeenLastCalledWith({ courseId: 2, status: "draft" });
  });

  it("keeps the unit select disabled until a course is chosen", () => {
    renderPanel();

    const unit = screen.getByLabelText("Ünite") as HTMLSelectElement;
    expect(unit.disabled).toBe(true);
    expect(screen.getByText("Önce bir ders seçin.")).toBeDefined();
  });

  it("shows loading and error states for the unit list", () => {
    const { rerender } = renderPanel({
      filters: { courseId: 1 },
      unitsPending: true,
    });
    expect(screen.getByText("Üniteler yükleniyor…")).toBeDefined();

    rerender({
      unitsPending: false,
      unitsError: { kind: "server", status: 500, message: "Sunucu hatası." },
    });
    expect(
      screen.getByText("Üniteler yüklenemedi: Sunucu hatası."),
    ).toBeDefined();
  });

  it("lists the course's units and selects one", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPanel({
      filters: { courseId: 1 },
      units: [qualityUnit(10, { title: "İlk Çağ" }), qualityUnit(11)],
    });

    await user.selectOptions(screen.getByLabelText("Ünite"), "10");

    expect(onChange).toHaveBeenLastCalledWith({ courseId: 1, unitId: 10 });
  });

  it.each<[string, string, QualityFilters]>([
    ["Konu", "6", { topicId: 6 }],
    ["Soru tipi", "matching", { type: "matching" }],
    ["Zorluk", "4", { difficulty: 4 }],
    ["Durum", "review", { status: "review" }],
    ["Kapsam (sınav)", "ayt", { scope: "ayt" }],
    ["İnceleme durumu", "yes", { needsReview: true }],
    ["İnceleme durumu", "no", { needsReview: false }],
  ])("sets %s", async (label, value, expected) => {
    const user = userEvent.setup();
    const { onChange } = renderPanel();

    await user.selectOptions(screen.getByLabelText(label), value);

    expect(onChange).toHaveBeenLastCalledWith(expected);
  });

  it("clears a select back to 'all'", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPanel({
      filters: { needsReview: true, type: "matching" },
    });

    await user.selectOptions(screen.getByLabelText("İnceleme durumu"), "");

    expect(onChange).toHaveBeenLastCalledWith({ type: "matching" });
  });

  it("explains where topics come from when none are loaded", () => {
    renderPanel({ topics: [] });

    expect(
      screen.getByText("Konular taranan sorulardan listelenir."),
    ).toBeDefined();
  });

  it("toggles the edited filter", async () => {
    const user = userEvent.setup();
    const { onChange, rerender } = renderPanel();

    await user.click(screen.getByLabelText("Yalnızca düzenlenmiş (sürüm > 1)"));
    expect(onChange).toHaveBeenLastCalledWith({ edited: true });

    rerender({ filters: { edited: true } });
    await user.click(screen.getByLabelText("Yalnızca düzenlenmiş (sürüm > 1)"));
    expect(onChange).toHaveBeenLastCalledWith({});
  });

  it("offers 'Filtreleri temizle' only when something is set", async () => {
    const user = userEvent.setup();
    const { onChange, rerender } = renderPanel();

    expect(
      screen.queryByRole("button", { name: "Filtreleri temizle" }),
    ).toBeNull();

    rerender({ filters: { courseId: 1, rateMax: 20 } });
    await user.click(
      screen.getByRole("button", { name: "Filtreleri temizle" }),
    );

    expect(onChange).toHaveBeenLastCalledWith({});
  });
});

describe("QualityFilterPanel ranges", () => {
  function rateMin() {
    return screen.getAllByLabelText("En az")[1] as HTMLInputElement;
  }

  it("commits a bound on Enter", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPanel({ filters: { rateMax: 80 } });

    await user.type(rateMin(), "25{Enter}");

    expect(onChange).toHaveBeenLastCalledWith({ rateMin: 25, rateMax: 80 });
  });

  it("commits a bound on blur", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPanel();

    await user.type(screen.getAllByLabelText("En çok")[0]!, "0");
    await user.tab();

    expect(onChange).toHaveBeenLastCalledWith({ attemptsMax: 0 });
  });

  it("commits once after a pause instead of on every keystroke", () => {
    vi.useFakeTimers();
    const { onChange } = renderPanel();
    const input = screen.getAllByLabelText("En çok")[2]!;

    fireEvent.change(input, { target: { value: "1" } });
    act(() => vi.advanceTimersByTime(RANGE_COMMIT_DELAY_MS - 100));
    fireEvent.change(input, { target: { value: "12" } });
    act(() => vi.advanceTimersByTime(RANGE_COMMIT_DELAY_MS - 100));
    fireEvent.change(input, { target: { value: "120" } });
    expect(onChange).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(RANGE_COMMIT_DELAY_MS));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ secondsMax: 120 });
  });

  it("marks an invalid bound and never commits it", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPanel();

    await user.type(rateMin(), "150{Enter}");
    await user.tab();

    expect(rateMin().getAttribute("aria-invalid")).toBe("true");
    expect(
      screen.getByText("0 ile 100 arasında bir tam sayı girin."),
    ).toBeDefined();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears a bound when emptied", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPanel({ filters: { rateMin: 25 } });

    await user.clear(rateMin());
    await user.tab();

    expect(onChange).toHaveBeenLastCalledWith({});
  });

  it("follows a value changed from outside (a preset or clear)", () => {
    const { rerender } = renderPanel({ filters: { rateMin: 25 } });
    expect(rateMin().value).toBe("25");

    rerender({ filters: {} });
    expect(rateMin().value).toBe("");

    rerender({ filters: { rateMin: 25 } });
    expect(rateMin().value).toBe("25");
  });

  it("keeps typing intact when its own commit comes back", async () => {
    const user = userEvent.setup();
    const { onChange, rerender } = renderPanel();

    await user.type(rateMin(), "3{Enter}");
    expect(onChange).toHaveBeenLastCalledWith({ rateMin: 3 });

    await user.type(rateMin(), "5");
    // The URL now catches up with the earlier commit.
    rerender({ filters: { rateMin: 3 } });

    expect(rateMin().value).toBe("35");
  });

  it("warns about an inverted range", () => {
    renderPanel({ filters: { attemptsMin: 10, attemptsMax: 2 } });

    expect(
      screen.getByText(
        "En az değer en çok değerden büyük; hiçbir soru eşleşmez.",
      ),
    ).toBeDefined();
  });
});
