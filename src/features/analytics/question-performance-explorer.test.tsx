/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type {
  Course,
  Unit,
  UnitExercisesData,
} from "@/contracts/admin/content";
import {
  DEFAULT_PERFORMANCE_FILTERS,
  RANKING_SIZE,
  type PerformanceFilters,
} from "@/features/analytics/question-performance";
import { snapshotExercise } from "@/test/fixtures/health";
import { performanceSnapshot } from "@/test/fixtures/performance";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

const getCourses = vi.fn<() => Promise<Course[]>>();
const getCourseUnits = vi.fn<(courseId: number) => Promise<Unit[]>>();
const getUnitExercises =
  vi.fn<(unitId: number) => Promise<UnitExercisesData>>();

vi.mock("@/features/content/content-client", () => ({
  getCourses: () => getCourses(),
  getCourseUnits: (courseId: number) => getCourseUnits(courseId),
  getUnitExercises: (unitId: number) => getUnitExercises(unitId),
}));

const { ContentScanProvider } =
  await import("@/features/content/content-scan-provider");
const { QuestionPerformanceExplorer, TOPIC_PREVIEW_SIZE } =
  await import("@/features/analytics/question-performance-explorer");

function omit<T extends object, K extends keyof T>(
  value: T,
  ...keys: K[]
): Omit<T, K> {
  const copy = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}

/** Serves a snapshot's catalogue through the mocked client. */
function serve(snapshot = performanceSnapshot()) {
  getCourses.mockResolvedValue([...snapshot.courses]);
  getCourseUnits.mockImplementation(async (courseId) =>
    snapshot.units
      .filter((unit) => unit.courseId === courseId)
      .map((unit) => ({
        ...omit(unit, "courseId"),
        exercise_count: snapshot.exercises.filter(
          (exercise) => exercise.unitId === unit.id,
        ).length,
      })),
  );
  getUnitExercises.mockImplementation(async (unitId) => ({
    unit: {
      id: unitId,
      title: snapshot.units.find((unit) => unit.id === unitId)!.title,
    },
    exercises: snapshot.exercises
      .filter((exercise) => exercise.unitId === unitId)
      .map((exercise) => omit(exercise, "courseId", "unitId")),
  }));
}

let lastFilters: PerformanceFilters | null = null;

function Harness({
  initial,
  canEdit,
}: {
  initial: PerformanceFilters;
  canEdit: boolean;
}) {
  const [filters, setFilters] = useState(initial);

  return (
    <QuestionPerformanceExplorer
      canEdit={canEdit}
      filters={filters}
      onChange={(next) => {
        lastFilters = next;
        setFilters(next);
      }}
    />
  );
}

function renderExplorer(
  initial: Partial<PerformanceFilters> = {},
  canEdit = true,
) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ContentScanProvider>
        <Harness
          canEdit={canEdit}
          initial={{ ...DEFAULT_PERFORMANCE_FILTERS, ...initial }}
        />
      </ContentScanProvider>
    </QueryClientProvider>,
  );
}

async function scan() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Taramayı başlat" }));
  await screen.findByText(/tarihli tam tarama/);
  return user;
}

function chart(title: string) {
  return screen.getByRole("heading", { name: title }).parentElement!;
}

function stat(label: string) {
  return screen.getByText(label, { selector: "dt" }).nextElementSibling!
    .textContent;
}

beforeEach(() => {
  lastFilters = null;
  getCourses.mockReset();
  getCourseUnits.mockReset();
  getUnitExercises.mockReset();
  serve();
});

describe("QuestionPerformanceExplorer", () => {
  it("asks for a full scan when there is no snapshot", () => {
    renderExplorer();

    expect(
      screen.getByRole("heading", { name: "Tam içerik taraması yapılmadı" }),
    ).toBeDefined();
    expect(getCourses).not.toHaveBeenCalled();
  });

  it("summarises the sample and the weighted and unweighted averages", async () => {
    renderExplorer();
    await scan();

    expect(stat("Kapsamdaki soru")).toBe("5");
    expect(stat("Hiç çözülmemiş")).toBe("1");
    expect(stat("Örneklem altında")).toBe("0");
    expect(stat("Analize giren")).toBe("4");
    // 10100 / 143 ≈ 70.6; the plain mean is 40.
    expect(stat("Doğru oranı (ağırlıklı)")).toBe("%71");
    expect(screen.getByText("Ağırlıksız %40")).toBeDefined();
    expect(stat("Ort. süre (ağırlıklı)")).toBe("24 sn");
    expect(
      screen.getByText("Ortalamalar nasıl hesaplanıyor?").closest("details"),
    ).not.toBeNull();
  });

  it("charts correct rate and time by difficulty, with no data where nothing was measured", async () => {
    renderExplorer();
    await scan();

    const rate = chart("Zorluğa göre doğru oranı");
    expect(
      within(rate).getByLabelText("Zorluk 1: %86 doğru oranı"),
    ).toBeDefined();
    expect(within(rate).getByLabelText("Zorluk 2: Veri yok")).toBeDefined();
    expect(
      within(rate).getByText("2 soru · 110 deneme · ağırlıksız %70"),
    ).toBeDefined();
    expect(within(rate).getByText(/Σ\(doğru oranı × deneme\)/)).toBeDefined();

    const time = chart("Zorluğa göre ortalama süre");
    expect(
      within(time).getByLabelText("Zorluk 1: 22 sn ortalama süre"),
    ).toBeDefined();
    // Question 102 has attempts but no timing.
    expect(within(time).getByLabelText("Zorluk 3: Veri yok")).toBeDefined();
  });

  it("charts type performance and attempt volume", async () => {
    renderExplorer();
    await scan();

    expect(
      within(chart("Soru türüne göre doğru oranı")).getByLabelText(
        "Doğru / Yanlış: %20 doğru oranı",
      ),
    ).toBeDefined();
    expect(
      within(chart("Soru türüne göre deneme sayısı")).getByLabelText(
        "Çoktan Seçmeli: 110 deneme",
      ),
    ).toBeDefined();
  });

  it("charts the count distributions", async () => {
    renderExplorer();
    await scan();

    expect(
      within(chart("Konuya göre soru sayısı")).getByLabelText("Hunlar: 2 soru"),
    ).toBeDefined();
    expect(
      within(chart("Duruma göre soru sayısı")).getByLabelText(
        "Yayında: 3 soru",
      ),
    ).toBeDefined();
    expect(
      within(chart("Sınav kapsamına göre soru sayısı")).getByLabelText(
        "AYT: 2 soru",
      ),
    ).toBeDefined();
    expect(
      within(chart("Zorluğa göre soru sayısı")).getByLabelText(
        "Zorluk 5: 1 soru",
      ),
    ).toBeDefined();
  });

  it("applies the minimum sample to performance but not to counts", async () => {
    renderExplorer();
    const user = await scan();

    await user.selectOptions(screen.getByLabelText("Minimum örneklem"), "20");

    expect(lastFilters?.minAttempts).toBe(20);
    expect(stat("Örneklem altında")).toBe("2");
    expect(stat("Analize giren")).toBe("2");
    expect(
      within(chart("Zorluğa göre doğru oranı")).getByLabelText(
        "Zorluk 5: Veri yok",
      ),
    ).toBeDefined();
    expect(
      within(chart("Zorluğa göre soru sayısı")).getByLabelText(
        "Zorluk 5: 1 soru",
      ),
    ).toBeDefined();
    expect(
      screen.getByRole("option", {
        name: "En az 20 deneme (backend inceleme eşiği)",
      }),
    ).toBeDefined();
  });

  it("says when nothing reaches the sample", async () => {
    // Course 2's only question has 3 attempts.
    renderExplorer({ courseId: 2, minAttempts: 5 });
    await scan();

    expect(screen.getByText(/En az 5 denemesi olan soru yok/)).toBeDefined();
    expect(screen.getByText("Örneklem eşiğini geçen soru yok.")).toBeDefined();
  });

  it("filters by course and status, and recovers from an empty result", async () => {
    renderExplorer();
    const user = await scan();

    await user.selectOptions(screen.getByLabelText("Ders"), "2");
    expect(stat("Kapsamdaki soru")).toBe("1");

    await user.selectOptions(screen.getByLabelText("Durum"), "draft");
    expect(lastFilters).toEqual({
      courseId: 2,
      status: "draft",
      minAttempts: 1,
    });
    expect(screen.getByText("Bu filtrelerle eşleşen soru yok.")).toBeDefined();

    await user.click(
      screen.getByRole("button", { name: "Ders ve durum filtresini kaldır" }),
    );
    expect(lastFilters).toEqual({ minAttempts: 1 });
    expect(stat("Kapsamdaki soru")).toBe("5");
  });

  it("switches between the ranking tables and links each question", async () => {
    renderExplorer();
    const user = await scan();

    const table = () => screen.getByRole("table", { name: /soru|oranı|süre/i });
    const order = () =>
      within(table())
        .getAllByRole("rowheader")
        .map((cell) => cell.querySelector("a")!.textContent);

    expect(
      screen
        .getByRole("button", { name: `En çok çözülen ${RANKING_SIZE} soru` })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(order()).toEqual([
      "Kolay soru",
      "Zor soru",
      "Orta soru",
      "Yavaş soru",
    ]);
    expect(
      within(table()).getByRole("link", { name: "Kolay soru" }),
    ).toHaveProperty(
      "href",
      expect.stringContaining("/courses/1/units/10/exercises/100"),
    );

    await user.click(
      screen.getByRole("button", { name: "En düşük doğru oranı" }),
    );
    expect(order()[0]).toBe("Yavaş soru");

    await user.click(
      screen.getByRole("button", { name: "En yüksek doğru oranı" }),
    );
    expect(order()[0]).toBe("Kolay soru");

    await user.click(
      screen.getByRole("button", { name: "En uzun ortalama süre" }),
    );
    expect(order()).toEqual(["Yavaş soru", "Orta soru", "Kolay soru"]);

    await user.click(
      screen.getByRole("button", { name: "En kısa ortalama süre" }),
    );
    expect(order()).toEqual(["Kolay soru", "Orta soru", "Yavaş soru"]);
    const first = within(table()).getAllByRole("row")[1]!;
    expect(within(first).getByText("TYT Tarih")).toBeDefined();
    expect(within(first).getByText("İlk Çağ")).toBeDefined();
    expect(within(first).getByText("%90")).toBeDefined();
    expect(within(first).getByText("20 sn")).toBeDefined();
  });

  it("links to the read-only unit list without the edit ability", async () => {
    renderExplorer({}, false);
    await scan();

    expect(
      screen.getByRole("link", { name: "Kolay soru" }).getAttribute("href"),
    ).toBe("/courses/1/units/10");
  });

  it("shows the busiest topics first and expands to all", async () => {
    const snapshot = performanceSnapshot();
    serve({
      ...snapshot,
      exercises: Array.from({ length: TOPIC_PREVIEW_SIZE + 3 }, (_, index) =>
        snapshotExercise(index + 1, 1, 10, {
          topic: { id: index + 1, name: `Konu ${index + 1}` },
        }),
      ),
    });
    renderExplorer();
    const user = await scan();

    const topics = chart("Konuya göre soru sayısı");
    expect(within(topics).getAllByRole("listitem")).toHaveLength(
      TOPIC_PREVIEW_SIZE,
    );

    await user.click(
      screen.getByRole("button", {
        name: `Tümünü göster (${TOPIC_PREVIEW_SIZE + 3})`,
      }),
    );
    expect(
      within(chart("Konuya göre soru sayısı")).getAllByRole("listitem"),
    ).toHaveLength(TOPIC_PREVIEW_SIZE + 3);
  });

  it("marks a partial scan", async () => {
    getUnitExercises.mockImplementation(async (unitId) => {
      if (unitId === 20) {
        throw { kind: "server", status: 500, message: "Hata." };
      }
      const snapshot = performanceSnapshot();
      return {
        unit: { id: unitId, title: "İlk Çağ" },
        exercises: snapshot.exercises
          .filter((exercise) => exercise.unitId === unitId)
          .map((exercise) => omit(exercise, "courseId", "unitId")),
      };
    });
    renderExplorer();
    await scan();

    expect(screen.getByText(/Tarama eksik: 1 liste okunamadı/)).toBeDefined();
    expect(stat("Kapsamdaki soru")).toBe("4");
  });
});
