/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type {
  Course,
  Unit,
  UnitExercisesData,
} from "@/contracts/admin/content";
import type { CourseTopicsData } from "@/contracts/admin/exercise-editor";
import {
  DEFAULT_COVERAGE_STATE,
  type CoverageState,
} from "@/features/analytics/coverage-model";
import type { ApiError } from "@/lib/api/error";
import {
  qualityCourse,
  qualityExercise,
  qualityUnit,
  qualityUnitExercises,
} from "@/test/fixtures/quality";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

const getCourses = vi.fn<() => Promise<Course[]>>();
const getCourseTopics =
  vi.fn<(courseId: number) => Promise<CourseTopicsData>>();
const getCourseUnits = vi.fn<(courseId: number) => Promise<Unit[]>>();
const getUnitExercises =
  vi.fn<(unitId: number) => Promise<UnitExercisesData>>();

vi.mock("@/features/content/content-client", () => ({
  getCourses: () => getCourses(),
  getCourseTopics: (courseId: number) => getCourseTopics(courseId),
  getCourseUnits: (courseId: number) => getCourseUnits(courseId),
  getUnitExercises: (unitId: number) => getUnitExercises(unitId),
}));

const { ContentScanProvider } =
  await import("@/features/content/content-scan-provider");
const { CoverageCenter, SEARCH_COMMIT_DELAY_MS } =
  await import("@/features/analytics/coverage-center");

const courses = [
  qualityCourse(1, { name: "TYT Tarih", scope: "tyt" }),
  qualityCourse(2, { name: "AYT Tarih", scope: "ayt" }),
  qualityCourse(3, { name: "AYT Fizik", scope: "ayt" }),
];

function topics(
  courseId: number,
  subjectId: number,
  name: string,
): CourseTopicsData {
  return subjectId === 7
    ? {
        course: { id: courseId, name },
        subject_id: 7,
        topics: [
          {
            id: 1,
            code: "ilk_cag",
            name: "İlk Çağ",
            grade_level: 9,
            exercise_count: 30,
          },
          {
            id: 2,
            code: "osmanli",
            name: "Osmanlı",
            parent_id: 1,
            grade_level: 10,
            exercise_count: 4,
          },
          { id: 3, code: "cumhuriyet", name: "Cumhuriyet", exercise_count: 0 },
        ],
      }
    : {
        course: { id: courseId, name },
        subject_id: 8,
        topics: [
          { id: 9, code: "vektor", name: "Vektörler", exercise_count: 12 },
        ],
      };
}

const topicsByCourse: Record<number, CourseTopicsData> = {
  1: topics(1, 7, "TYT Tarih"),
  2: topics(2, 7, "AYT Tarih"),
  3: topics(3, 8, "AYT Fizik"),
};

let lastState: CoverageState | null = null;

function Harness({ initial }: { initial: CoverageState }) {
  const [state, setState] = useState(initial);

  return (
    <CoverageCenter
      onChange={(next) => {
        lastState = next;
        setState(next);
      }}
      state={state}
    />
  );
}

function renderCoverage(initial: Partial<CoverageState> = {}) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ContentScanProvider>
        <Harness initial={{ ...DEFAULT_COVERAGE_STATE, ...initial }} />
      </ContentScanProvider>
    </QueryClientProvider>,
  );
}

async function table() {
  return screen.findByRole("table", { name: "Konu kapsam tablosu" });
}

function rowOf(container: HTMLElement, name: string) {
  return within(container)
    .getAllByRole("row")
    .find((row) =>
      within(row).queryByRole("rowheader")?.textContent?.startsWith(name),
    )!;
}

function cells(row: HTMLElement) {
  return within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent);
}

beforeEach(() => {
  lastState = null;
  replace.mockReset();
  refresh.mockReset();
  getCourses.mockReset().mockResolvedValue(courses);
  getCourseTopics
    .mockReset()
    .mockImplementation(async (courseId) => topicsByCourse[courseId]!);
  getCourseUnits
    .mockReset()
    .mockImplementation(async (courseId) =>
      courseId === 1
        ? [qualityUnit(10)]
        : courseId === 2
          ? [qualityUnit(20)]
          : [],
    );
  getUnitExercises.mockReset().mockImplementation(async (unitId) =>
    unitId === 10
      ? qualityUnitExercises(10, [
          qualityExercise(100, {
            topic: { id: 1, name: "İlk Çağ" },
            scopes: ["tyt", "ayt"],
          }),
          qualityExercise(101, {
            topic: { id: 1, name: "İlk Çağ" },
            scopes: ["tyt"],
          }),
        ])
      : qualityUnitExercises(20, [
          qualityExercise(200, {
            topic: { id: 1, name: "İlk Çağ" },
            scopes: ["ayt"],
          }),
        ]),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CoverageCenter states", () => {
  it("shows a loading state, then an error with a retry", async () => {
    const user = userEvent.setup();
    getCourses.mockRejectedValueOnce({
      kind: "server",
      status: 500,
      message: "Hata.",
    });

    renderCoverage();
    expect(screen.getByText("Kapsam verileri yükleniyor.")).toBeDefined();

    expect(await screen.findByText("Dersler yüklenemedi")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(await table()).toBeDefined();
  });

  it("shows a forbidden state", async () => {
    getCourses.mockRejectedValue({
      kind: "authorization",
      status: 403,
      message: "Yetki yok.",
    });

    renderCoverage();

    expect(
      await screen.findByText("Bu bölüme erişim yetkiniz yok"),
    ).toBeDefined();
  });

  it("shows an empty catalogue", async () => {
    getCourses.mockResolvedValue([]);

    renderCoverage();

    expect(await screen.findByText("Henüz ders bulunmuyor.")).toBeDefined();
  });

  it("redirects to login when the session expires", async () => {
    getCourseTopics.mockRejectedValue({
      kind: "authentication",
      status: 401,
      message: "Oturum doğrulanamadı.",
    } satisfies ApiError);

    renderCoverage();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("reports a failed topic list and retries it", async () => {
    const user = userEvent.setup();
    getCourseTopics.mockRejectedValueOnce({
      kind: "server",
      status: 500,
      message: "Hata.",
    });

    renderCoverage();

    expect(await screen.findByText("Konular yüklenemedi")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(await table()).toBeDefined();
  });

  it("says when a course's subject has no topics", async () => {
    getCourseTopics.mockResolvedValue({ ...topicsByCourse[1]!, topics: [] });

    renderCoverage();

    expect(
      await screen.findByText("Bu dersin branşında konu yok."),
    ).toBeDefined();
  });
});

describe("CoverageCenter table", () => {
  it("defaults to the first course and shows backend counts, unknown scanned counts and bands", async () => {
    renderCoverage();

    const grid = await table();
    expect(getCourseTopics).toHaveBeenCalledTimes(1);
    expect(getCourseTopics).toHaveBeenCalledWith(1);
    expect(cells(rowOf(grid, "İlk Çağ"))).toEqual([
      "—",
      "9. sınıf",
      "30",
      "Bilinmiyor",
      "İyi",
    ]);
    expect(cells(rowOf(grid, "Osmanlı"))).toEqual([
      "İlk Çağ",
      "10. sınıf",
      "4",
      "Bilinmiyor",
      "Düşük",
    ]);
    expect(cells(rowOf(grid, "Cumhuriyet"))).toEqual([
      "—",
      "—",
      "0",
      "Bilinmiyor",
      "İçerik yok",
    ]);
    expect(
      within(rowOf(grid, "İlk Çağ"))
        .getByRole("link", { name: "İlk Çağ" })
        .getAttribute("href"),
    ).toBe("/quality?course=1&topic=1");
    expect(screen.getByText(/uygulama içi bir sınıflandırmadır/)).toBeDefined();
    expect(screen.getByText(/Tam içerik taraması yapılmadı/)).toBeDefined();
  });

  it("summarises the bands", async () => {
    renderCoverage();
    await table();

    const summary = screen.getByLabelText("Kapsam özeti");
    expect(
      Array.from(summary.querySelectorAll("dt, dd")).map(
        (node) => node.textContent,
      ),
    ).toEqual([
      "İçerik yok (0 soru)",
      "1",
      "Düşük (1–9 soru)",
      "1",
      "Orta (10–24 soru)",
      "0",
      "İyi (25+ soru)",
      "1",
    ]);
  });

  it("fills this course's scanned counts after a full scan", async () => {
    const user = userEvent.setup();
    renderCoverage();
    await table();

    await user.click(screen.getByRole("button", { name: "Taramayı başlat" }));

    expect(
      await screen.findByText(/tarihli tam taramadan/, {}, { timeout: 5000 }),
    ).toBeDefined();
    const grid = await table();
    expect(cells(rowOf(grid, "İlk Çağ"))[3]).toBe("2");
    expect(cells(rowOf(grid, "Osmanlı"))[3]).toBe("0");
  });

  it("changes course and drops the subject-specific filters", async () => {
    const user = userEvent.setup();
    renderCoverage({ grade: 10, parent: 1 });
    await table();

    await user.selectOptions(
      screen.getByLabelText("Ders", { exact: true }),
      "3",
    );

    expect(lastState).toMatchObject({
      courseId: 3,
      grade: undefined,
      parent: undefined,
    });
    expect(cells(rowOf(await table(), "Vektörler"))).toEqual([
      "—",
      "—",
      "12",
      "Bilinmiyor",
      "Orta",
    ]);
  });

  it("filters by view, grade and parent topic", async () => {
    const user = userEvent.setup();
    renderCoverage();
    const grid = await table();
    const topicNames = () =>
      within(grid)
        .getAllByRole("rowheader")
        .map((header) => header.querySelector("a")?.textContent);

    await user.click(screen.getByRole("button", { name: "Yalnız boş" }));
    expect(topicNames()).toEqual(["Cumhuriyet"]);

    await user.click(screen.getByRole("button", { name: "25 altı" }));
    expect(topicNames()).toEqual(["Osmanlı", "Cumhuriyet"]);

    await user.click(screen.getByRole("button", { name: "Tümü" }));
    await user.selectOptions(screen.getByLabelText("Sınıf düzeyi"), "9");
    expect(topicNames()).toEqual(["İlk Çağ"]);

    await user.selectOptions(screen.getByLabelText("Sınıf düzeyi"), "none");
    expect(topicNames()).toEqual(["Cumhuriyet"]);

    await user.selectOptions(screen.getByLabelText("Sınıf düzeyi"), "");
    await user.selectOptions(screen.getByLabelText("Üst konu"), "1");
    expect(topicNames()).toEqual(["Osmanlı"]);

    await user.selectOptions(screen.getByLabelText("Üst konu"), "root");
    expect(topicNames()).toEqual(["İlk Çağ", "Cumhuriyet"]);

    await user.selectOptions(screen.getByLabelText("Sırala"), "count_desc");
    expect(lastState?.sort).toBe("count_desc");
    expect(topicNames()).toEqual(["İlk Çağ", "Cumhuriyet"]);

    await user.selectOptions(screen.getByLabelText("Üst konu"), "");
    expect(topicNames()).toEqual(["İlk Çağ", "Osmanlı", "Cumhuriyet"]);
  });

  it("applies a search after a pause, not per keystroke", async () => {
    renderCoverage();
    await table();
    vi.useFakeTimers();

    const search = screen.getByRole("searchbox", { name: "Ara" });
    fireEvent.change(search, { target: { value: "o" } });
    fireEvent.change(search, { target: { value: "osm" } });
    expect(lastState).toBeNull();

    act(() => vi.advanceTimersByTime(SEARCH_COMMIT_DELAY_MS));
    expect(lastState?.query).toBe("osm");
    vi.useRealTimers();

    const grid = await table();
    expect(within(grid).getAllByRole("rowheader")).toHaveLength(1);
  });

  it("clears every filter and offers it for an empty result", async () => {
    const user = userEvent.setup();
    renderCoverage({ view: "empty", grade: 9 });

    expect(
      await screen.findByText("Bu filtrelerle eşleşen konu bulunmuyor."),
    ).toBeDefined();
    await user.click(
      screen.getAllByRole("button", { name: "Filtreleri temizle" })[0]!,
    );

    expect(lastState).toMatchObject({
      view: "all",
      grade: undefined,
      query: "",
    });
    expect(await table()).toBeDefined();
  });

  it("exports the visible rows as CSV", async () => {
    renderCoverage();
    await table();

    expect(
      (
        screen.getByRole("button", {
          name: "CSV olarak indir",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
});

describe("CoverageCenter matrices", () => {
  it("shows topic × scope as unknown without a scan", async () => {
    renderCoverage({ mode: "scope" });

    const matrix = await screen.findByRole("table", {
      name: "Konu × sınav kapsamı matrisi",
    });
    expect(cells(rowOf(matrix, "İlk Çağ"))).toEqual(["30", "Bilinmiyor"]);
  });

  it("fills topic × scope from the snapshot", async () => {
    const user = userEvent.setup();
    renderCoverage({ mode: "scope" });
    await screen.findByRole("table", { name: "Konu × sınav kapsamı matrisi" });

    await user.click(screen.getByRole("button", { name: "Taramayı başlat" }));
    await screen.findByText(/tarihli tam taramadan/, {}, { timeout: 5000 });

    const matrix = screen.getByRole("table", {
      name: "Konu × sınav kapsamı matrisi",
    });
    expect(
      within(matrix)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Konu", "Backend (konu geneli)", "TYT", "AYT"]);
    expect(cells(rowOf(matrix, "İlk Çağ"))).toEqual(["30", "2", "2"]);
  });

  it("builds topic × course from the courses of the same subject", async () => {
    const user = userEvent.setup();
    renderCoverage();
    await table();
    await user.click(screen.getByRole("button", { name: "Taramayı başlat" }));
    await screen.findByText(/tarihli tam taramadan/, {}, { timeout: 5000 });

    await user.click(screen.getByRole("button", { name: "Konu × Ders" }));

    const matrix = await screen.findByRole("table", {
      name: "Konu × ders matrisi",
    });
    await waitFor(() =>
      expect(
        within(matrix)
          .getAllByRole("columnheader")
          .map((header) => header.textContent),
      ).toEqual(["Konu", "Backend (konu geneli)", "TYT Tarih", "AYT Tarih"]),
    );
    expect(cells(rowOf(matrix, "İlk Çağ"))).toEqual(["30", "2", "1"]);
    expect(cells(rowOf(matrix, "Cumhuriyet"))).toEqual(["0", "0", "0"]);
    expect(
      screen.getByRole("button", { name: "Matrisi CSV indir" }),
    ).toBeDefined();
  });

  it("reports courses whose topic lists failed in the course matrix", async () => {
    const user = userEvent.setup();
    getCourseTopics.mockImplementation(async (courseId) => {
      if (courseId === 2)
        throw { kind: "server", status: 500, message: "Hata." };
      return topicsByCourse[courseId]!;
    });

    renderCoverage({ mode: "course" });

    expect(
      await screen.findByText(
        "1 dersin konu listesi okunamadı; bu dersler matriste eksik olabilir.",
      ),
    ).toBeDefined();

    getCourseTopics.mockImplementation(
      async (courseId) => topicsByCourse[courseId]!,
    );
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));

    await waitFor(() =>
      expect(
        screen.queryByText(
          "1 dersin konu listesi okunamadı; bu dersler matriste eksik olabilir.",
        ),
      ).toBeNull(),
    );
  });
});
