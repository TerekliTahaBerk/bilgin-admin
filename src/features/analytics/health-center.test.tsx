/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type {
  Course,
  Unit,
  UnitExercisesData,
} from "@/contracts/admin/content";
import type { CourseTopicsData } from "@/contracts/admin/exercise-editor";
import type { ApiError } from "@/lib/api/error";
import { topicList } from "@/test/fixtures/health";
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
const getCourseUnits = vi.fn<(courseId: number) => Promise<Unit[]>>();
const getUnitExercises =
  vi.fn<(unitId: number) => Promise<UnitExercisesData>>();
const getCourseTopics =
  vi.fn<(courseId: number) => Promise<CourseTopicsData>>();

vi.mock("@/features/content/content-client", () => ({
  getCourses: () => getCourses(),
  getCourseUnits: (courseId: number) => getCourseUnits(courseId),
  getUnitExercises: (unitId: number) => getUnitExercises(unitId),
  getCourseTopics: (courseId: number) => getCourseTopics(courseId),
}));

const { ContentScanProvider } =
  await import("@/features/content/content-scan-provider");
const { HealthCenter, PROBLEM_PAGE_SIZE } =
  await import("@/features/analytics/health-center");

const courses = [
  qualityCourse(1, { name: "TYT Tarih", unit_count: 2 }),
  qualityCourse(2, { name: "AYT Fizik", unit_count: 0 }),
];
const unitsByCourse: Record<number, Unit[]> = {
  1: [
    qualityUnit(10, { title: "İlk Çağ", exercise_count: 2, node_count: 3 }),
    qualityUnit(11, { title: "Zaman", exercise_count: 0, node_count: 0 }),
  ],
  2: [],
};
const listsByUnit: Record<number, UnitExercisesData> = {
  10: qualityUnitExercises(
    10,
    [
      qualityExercise(100, { preview: "Orhun Yazıtları" }),
      qualityExercise(101, {
        preview: "Uygurlar",
        stats: { attempts: 30, correct_rate: 97, needs_review: true },
      }),
    ],
    "İlk Çağ",
  ),
  11: qualityUnitExercises(11, [], "Zaman"),
};
const topicsByCourse: Record<number, CourseTopicsData> = {
  1: topicList(1, 1, { 1: 0, 2: 6 }, "TYT Tarih"),
  2: topicList(2, 2, { 5: 3 }, "AYT Fizik"),
};

const serverError: ApiError = {
  kind: "server",
  status: 500,
  message: "Sunucu hatası oluştu.",
};

function renderHealth({ canEdit = true } = {}) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ContentScanProvider>
        <HealthCenter canEdit={canEdit} />
      </ContentScanProvider>
    </QueryClientProvider>,
  );
}

async function scanned(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Taramayı başlat" }));
  return screen.findByRole(
    "heading",
    { name: /Yapılacaklar/ },
    { timeout: 5000 },
  );
}

function problemTitles() {
  return within(screen.getByRole("list", { name: "Problem listesi" }))
    .getAllByRole("listitem")
    .map((item) => item.querySelector("p.text-sm")?.textContent);
}

beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
  getCourses.mockReset().mockResolvedValue(courses);
  getCourseUnits
    .mockReset()
    .mockImplementation(async (courseId) => unitsByCourse[courseId]!);
  getUnitExercises
    .mockReset()
    .mockImplementation(async (unitId) => listsByUnit[unitId]!);
  getCourseTopics
    .mockReset()
    .mockImplementation(async (courseId) => topicsByCourse[courseId]!);
});

describe("HealthCenter without a snapshot", () => {
  it("says no full scan was made and shows no dashboard", async () => {
    renderHealth();

    expect(
      screen.getByRole("heading", { name: "Tam içerik taraması yapılmadı" }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Taramayı başlat" }),
    ).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "Tarama ayrıntıları" })
        .getAttribute("href"),
    ).toBe("/scan");
    expect(screen.queryByText("Toplam ders")).toBeNull();
    expect(screen.queryByText("İçerik Sağlığı Skoru")).toBeNull();

    await new Promise((done) => setTimeout(done, 5));
    expect(getCourses).not.toHaveBeenCalled();
    expect(getCourseTopics).not.toHaveBeenCalled();
  });

  it("shows the scan running, then the dashboard", async () => {
    const user = userEvent.setup();
    const pending: (() => void)[] = [];
    getUnitExercises.mockImplementation(
      (unitId) =>
        new Promise((resolve) => {
          pending.push(() => resolve(listsByUnit[unitId]!));
        }),
    );

    renderHealth();
    await user.click(screen.getByRole("button", { name: "Taramayı başlat" }));

    expect(await screen.findByText(/Tarama sürüyor/)).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Taramayı başlat" }),
    ).toBeNull();

    for (const release of pending.splice(0)) release();

    expect(
      await screen.findByRole("heading", { name: /Yapılacaklar/ }),
    ).toBeDefined();
  });

  it("explains a scan that produced nothing", async () => {
    const user = userEvent.setup();
    getCourses.mockRejectedValue(serverError);

    renderHealth();
    await user.click(screen.getByRole("button", { name: "Taramayı başlat" }));

    expect(
      await screen.findByText(
        "Son tarama bir sonuç üretmedi. Ayrıntılar için tarama sayfasına bakın.",
      ),
    ).toBeDefined();
  });
});

describe("HealthCenter with a snapshot", () => {
  it("lists actionable problems first, each linked to its page", async () => {
    const user = userEvent.setup();
    renderHealth();
    await scanned(user);

    await waitFor(() => expect(problemTitles()).toContain("Konu 1"));
    expect(problemTitles()).toEqual([
      "AYT Fizik",
      "TYT Tarih › Zaman",
      "TYT Tarih › Zaman",
      "Uygurlar",
      "TYT Tarih › İlk Çağ",
      "Konu 1",
      // 6 and 3 questions: under the app-wide "low" band (1–9).
      "Konu 2",
      "Konu 5",
    ]);
    expect(
      screen
        .getByRole("link", { name: "Soruyu düzenle: Uygurlar" })
        .getAttribute("href"),
    ).toBe("/courses/1/units/10/exercises/101");
    expect(
      screen
        .getByRole("link", { name: "Dersi aç: AYT Fizik" })
        .getAttribute("href"),
    ).toBe("/courses/2");

    // The problem list comes before the score on the page.
    const problemsHeading = screen.getByRole("heading", {
      name: /Yapılacaklar/,
    });
    const scoreHeading = screen.getByRole("heading", {
      name: "İçerik Sağlığı Skoru",
    });
    expect(
      problemsHeading.compareDocumentPosition(scoreHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("links read-only admins to unit pages", async () => {
    const user = userEvent.setup();
    renderHealth({ canEdit: false });
    await scanned(user);

    expect(
      screen
        .getByRole("link", { name: "Ünitede gör: Uygurlar" })
        .getAttribute("href"),
    ).toBe("/courses/1/units/10");
  });

  it("filters problems by kind", async () => {
    const user = userEvent.setup();
    renderHealth();
    await scanned(user);

    await user.click(
      screen.getByRole("button", { name: "Sorusu olmayan ünite (1)" }),
    );

    expect(problemTitles()).toEqual(["TYT Tarih › Zaman"]);

    await user.click(screen.getByRole("button", { name: /^Tümü/ }));
    expect(problemTitles().length).toBeGreaterThan(1);
  });

  it("labels the score as the panel's own metric and explains it", async () => {
    const user = userEvent.setup();
    renderHealth();
    await scanned(user);

    const score = screen.getByRole("region", { name: "İçerik Sağlığı Skoru" });
    expect(score.textContent).toContain(
      "backend'in resmi bir metriği değildir",
    );

    await user.click(within(score).getByText("Skor nasıl hesaplanıyor?"));
    const table = within(score).getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(7);
    expect(within(table).getByText("Sorusu olan üniteler")).toBeDefined();
    // 1 of 2 units has questions.
    const unitsRow = within(table)
      .getByText("Sorusu olan üniteler")
      .closest("tr");
    expect(unitsRow?.textContent).toContain("%50 (1/2)");
  });

  it("shows course, unit, question and topic metrics", async () => {
    const user = userEvent.setup();
    renderHealth();
    await scanned(user);

    const section = (name: string) => screen.getByRole("region", { name });
    const stat = (region: HTMLElement, label: string) =>
      within(region).getByText(label, { selector: "dt" }).nextElementSibling
        ?.textContent;

    expect(stat(section("Dersler"), "Toplam ders")).toBe("2");
    expect(stat(section("Dersler"), "Ünitesi olmayan")).toBe("1");
    expect(stat(section("Üniteler"), "Sorusu olmayan")).toBe("1");
    expect(stat(section("Üniteler"), "Toplam adım")).toBe("3");
    expect(stat(section("Üniteler"), "Adımı olmayan")).toBe("1");
    expect(stat(section("Sorular"), "Toplam soru")).toBe("2");
    expect(stat(section("Sorular"), "İnceleme gerekli")).toBe("1");
    await waitFor(() =>
      expect(stat(section("Konular"), "Toplam konu")).toBe("3"),
    );
    expect(stat(section("Konular"), "Sorusu olmayan")).toBe("1");
    expect(getCourseTopics.mock.calls.map(([id]) => id).sort()).toEqual([1, 2]);
  });

  it("reports topic lists that failed and retries them", async () => {
    const user = userEvent.setup();
    getCourseTopics.mockImplementation(async (courseId) => {
      if (courseId === 2) throw serverError;
      return topicsByCourse[courseId]!;
    });

    renderHealth();
    await scanned(user);

    expect(
      await screen.findByText(
        "1 dersin konu listesi okunamadı; konu sayıları eksik.",
      ),
    ).toBeDefined();
    expect(
      screen.getByText(
        "Bazı derslerin konu listesi okunamadı; konu sinyali eksik veriyle hesaplandı.",
      ),
    ).toBeDefined();

    getCourseTopics.mockImplementation(
      async (courseId) => topicsByCourse[courseId]!,
    );
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));

    await waitFor(() =>
      expect(
        screen.queryByText(
          "1 dersin konu listesi okunamadı; konu sayıları eksik.",
        ),
      ).toBeNull(),
    );
  });

  it("marks a partial scan wherever it matters", async () => {
    const user = userEvent.setup();
    getUnitExercises.mockImplementation(async (unitId) => {
      if (unitId === 11) throw serverError;
      return listsByUnit[unitId]!;
    });

    renderHealth();
    await scanned(user);

    expect(screen.getByText("(eksik)")).toBeDefined();
    expect(screen.getByText(/Tarama eksik: 1 liste okunamadı/)).toBeDefined();
    expect(problemTitles()[0]).toBe("TYT Tarih › Zaman — soru listesi");
  });

  it("re-scans on request", async () => {
    const user = userEvent.setup();
    renderHealth();
    await scanned(user);
    getCourses.mockClear();

    await user.click(screen.getByRole("button", { name: "Yeniden tara" }));

    await waitFor(() => expect(getCourses).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Yeniden tara" }),
      ).toBeDefined(),
    );
  });

  it("pages a long problem list", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: PROBLEM_PAGE_SIZE + 5 }, (_, index) =>
      qualityUnit(1000 + index, {
        title: `Boş ${index}`,
        exercise_count: 0,
        node_count: 1,
      }),
    );
    getCourses.mockResolvedValue([courses[0]!]);
    getCourseUnits.mockResolvedValue(many);
    getUnitExercises.mockImplementation(async (unitId) =>
      qualityUnitExercises(unitId, []),
    );

    renderHealth();
    await scanned(user);

    await waitFor(() =>
      expect(problemTitles()).toHaveLength(PROBLEM_PAGE_SIZE),
    );
    await user.click(
      screen.getByRole("button", {
        name: /Daha fazla göster \(\d+ problem daha\)/,
      }),
    );
    expect(problemTitles().length).toBeGreaterThan(PROBLEM_PAGE_SIZE);
  });

  it("says so when nothing is wrong", async () => {
    const user = userEvent.setup();
    getCourses.mockResolvedValue([courses[0]!]);
    getCourseUnits.mockResolvedValue([
      qualityUnit(10, { title: "İlk Çağ", exercise_count: 20, node_count: 3 }),
    ]);
    getUnitExercises.mockResolvedValue(
      qualityUnitExercises(
        10,
        Array.from({ length: 11 }, (_, index) => qualityExercise(500 + index)),
        "İlk Çağ",
      ),
    );
    getCourseTopics.mockResolvedValue(topicList(1, 1, { 1: 30, 2: 40 }));

    renderHealth();
    await scanned(user);

    await waitFor(() =>
      expect(
        screen.getByText(
          "Taranan içerikte bu ekranın aradığı bir problem bulunamadı.",
        ),
      ).toBeDefined(),
    );
  });

  it("redirects to login when the session expires while loading topics", async () => {
    const user = userEvent.setup();
    getCourseTopics.mockRejectedValue({
      kind: "authentication",
      status: 401,
      message: "Oturum doğrulanamadı.",
    });

    renderHealth();
    await scanned(user);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
