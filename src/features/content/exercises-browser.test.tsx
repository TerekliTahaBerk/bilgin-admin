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
import type { ExerciseFilterValues } from "@/features/content/exercise-filter-bar";
import type { ExerciseServerFilters } from "@/features/content/exercise-filters";
import type { NodePreview, UnitNodesData } from "@/contracts/admin/publication";
import type { ApiError } from "@/lib/api/error";
import {
  validCoursesResponse,
  validUnitsResponse,
} from "@/test/fixtures/courses-api";
import { validUnitExercisesResponse } from "@/test/fixtures/exercises-api";
import {
  passingPreviewResponse,
  validUnitNodesResponse,
} from "@/test/fixtures/publication-api";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

const getCourses = vi.fn<() => Promise<Course[]>>();
const getCourseUnits = vi.fn<() => Promise<Unit[]>>();
const getUnitExercises =
  vi.fn<
    (
      unitId: number,
      filters: ExerciseServerFilters,
    ) => Promise<UnitExercisesData>
  >();
// The readiness block lives on this page too, so its reads have to be mocked
// here even though this suite is about the exercise list.
const getUnitNodes = vi.fn<() => Promise<UnitNodesData>>();
const getNodePreview = vi.fn<(nodeId: number) => Promise<NodePreview>>();

vi.mock("@/features/content/content-client", () => ({
  getCourses: () => getCourses(),
  getCourseUnits: () => getCourseUnits(),
  getUnitExercises: (unitId: number, filters: ExerciseServerFilters) =>
    getUnitExercises(unitId, filters),
  getUnitNodes: () => getUnitNodes(),
  getNodePreview: (nodeId: number) => getNodePreview(nodeId),
  publishUnit: () => Promise.reject(new Error("not used in this suite")),
}));

const archiveExercise = vi.fn<(exerciseId: number) => Promise<unknown>>();

vi.mock("@/features/workflows/workflow-client", () => ({
  archiveExercise: (exerciseId: number) => archiveExercise(exerciseId),
}));

const { ExercisesBrowser } =
  await import("@/features/content/exercises-browser");

const courses = validCoursesResponse.data as Course[];
const units = validUnitsResponse.data as Unit[];
const data = validUnitExercisesResponse.data as UnitExercisesData;
const COURSE_ID = courses[0]!.id;
const UNIT_ID = units[0]!.id;

const onFiltersChange = vi.fn();
const onClearFilters = vi.fn();

function renderBrowser(
  filters: ExerciseFilterValues = {},
  canEdit = false,
  canPublish = false,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ExercisesBrowser
        canEdit={canEdit}
        canPublish={canPublish}
        courseId={COURSE_ID}
        filters={filters}
        onClearFilters={onClearFilters}
        onFiltersChange={onFiltersChange}
        unitId={UNIT_ID}
      />
    </QueryClientProvider>,
  );

  return {
    ...utils,
    rerenderWith(next: ExerciseFilterValues) {
      utils.rerender(
        <QueryClientProvider client={queryClient}>
          <ExercisesBrowser
            canEdit={canEdit}
            canPublish={canPublish}
            courseId={COURSE_ID}
            filters={next}
            onClearFilters={onClearFilters}
            onFiltersChange={onFiltersChange}
            unitId={UNIT_ID}
          />
        </QueryClientProvider>,
      );
    },
  };
}

function apiError(kind: ApiError["kind"], status: number | null): ApiError {
  return { kind, status, message: "Beklenmeyen bir hata oluştu." };
}

function unitData(overrides: Partial<UnitExercisesData> = {}) {
  return { ...data, unit: { ...data.unit, id: UNIT_ID }, ...overrides };
}

beforeEach(() => {
  getCourses.mockReset().mockResolvedValue(courses);
  getCourseUnits.mockReset().mockResolvedValue(units);
  getUnitExercises.mockReset().mockResolvedValue(unitData());
  getUnitNodes
    .mockReset()
    .mockResolvedValue(validUnitNodesResponse.data as UnitNodesData);
  getNodePreview
    .mockReset()
    .mockResolvedValue(passingPreviewResponse.data as NodePreview);
  replace.mockReset();
  refresh.mockReset();
  archiveExercise.mockReset().mockResolvedValue({ id: 1, status: "archived" });
  onFiltersChange.mockReset();
  onClearFilters.mockReset();
});

describe("ExercisesBrowser loading and context", () => {
  it("announces loading before the exercises arrive", async () => {
    getUnitExercises.mockImplementation(() => new Promise(() => {}));

    renderBrowser();

    expect(await screen.findByText("Sorular yükleniyor.")).toBeDefined();
  });

  it("starts the exercise query without waiting for course or unit metadata", async () => {
    getCourses.mockImplementation(() => new Promise(() => {}));
    getCourseUnits.mockImplementation(() => new Promise(() => {}));

    renderBrowser();

    expect(
      await screen.findByText("Orhun Yazıtları hangi Türk devletine aittir?"),
    ).toBeDefined();
    expect(getUnitExercises).toHaveBeenCalledTimes(1);
  });

  it("shows the unit title from the exercise payload and the course name", async () => {
    renderBrowser();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "İlk ve Orta Çağlarda Türk Dünyası",
      }),
    ).toBeDefined();
    expect(screen.getByText("TYT Türkçe")).toBeDefined();
  });

  it("links back to the unit list", async () => {
    renderBrowser();

    const back = await screen.findByRole("link", { name: /ünitelere dön/i });

    expect(back.getAttribute("href")).toBe(`/courses/${COURSE_ID}`);
  });
});

describe("ExercisesBrowser rows", () => {
  it("renders the backend preview as plain text", async () => {
    renderBrowser();

    expect(
      await screen.findByText("Orhun Yazıtları hangi Türk devletine aittir?"),
    ).toBeDefined();
    expect(screen.getByText("(önizleme yok)")).toBeDefined();
  });

  it("labels every exercise type in Turkish", async () => {
    renderBrowser();

    await screen.findByText("(önizleme yok)");

    // Scoped by accessible name: the filter selects carry the same labels as
    // options, and the readiness block on this page has a list of its own.
    const list = within(screen.getByRole("list", { name: "Sorular" }));

    for (const label of [
      "Çoktan Seçmeli",
      "Doğru / Yanlış",
      "Boşluk Doldurma",
      "Eşleştirme",
      "Görsel Bölge",
    ]) {
      expect(list.getByText(label)).toBeDefined();
    }
  });

  it("shows topic, difficulty, status and scopes", async () => {
    renderBrowser();

    await screen.findByText("(önizleme yok)");

    const list = within(screen.getByRole("list", { name: "Sorular" }));

    expect(list.getAllByText("İlk Türk Devletleri").length).toBeGreaterThan(0);
    expect(list.getAllByText("Zorluk 2").length).toBeGreaterThan(0);
    // Two fixture exercises are published.
    expect(list.getAllByText("Yayında")).toHaveLength(2);
    expect(list.getByText("Taslak")).toBeDefined();
    expect(list.getByText("İncelemede")).toBeDefined();
    expect(list.getByText("Arşiv")).toBeDefined();
    expect(list.getByText("TYT, AYT")).toBeDefined();
    expect(list.getByText("TYT, AYT, YDT")).toBeDefined();
  });

  it("shows attempts, correct rate and average time", async () => {
    renderBrowser();

    await screen.findByText("(önizleme yok)");

    expect(
      screen.getByText(/34 deneme · %97 doğru · Ort\. 8 sn/),
    ).toBeDefined();
  });

  it("omits the average time when the backend sent none", async () => {
    renderBrowser();

    await screen.findByText("(önizleme yok)");

    const line = screen.getByText(/3 deneme · %33 doğru/);

    expect(line.textContent).not.toContain("Ort.");
  });

  it("says a never-attempted exercise is not solved yet, never zero percent", async () => {
    renderBrowser();

    await screen.findByText("(önizleme yok)");

    expect(screen.getByText("Henüz çözülmedi")).toBeDefined();
    expect(document.body.textContent).not.toMatch(/%0 doğru/);
    expect(document.body.textContent).not.toMatch(/\b0%/);
  });

  it("marks an edited exercise with its version", async () => {
    renderBrowser();

    await screen.findByText("(önizleme yok)");

    expect(screen.getByText("Düzenlenmiş (v2)")).toBeDefined();
    expect(screen.getByText("Düzenlenmiş (v3)")).toBeDefined();
  });

  it("flags the exercises the backend marked for review", async () => {
    renderBrowser();

    await screen.findByText("(önizleme yok)");

    expect(screen.getAllByText("İnceleme gerekli")).toHaveLength(2);
  });

  it("puts the flagged exercises first while keeping backend order", async () => {
    renderBrowser();

    await screen.findByText("(önizleme yok)");

    const previews = [
      ...screen
        .getByRole("list", { name: "Sorular" })
        .querySelectorAll("li p:first-child"),
    ].map((node) => node.textContent);

    expect(previews[0]).toBe(
      "Uygurlar yerleşik hayata geçen ilk Türk devletidir.",
    );
    expect(previews[1]).toBe("Kavramı karşılığıyla birleştir.");
    expect(previews[2]).toBe("Orhun Yazıtları hangi Türk devletine aittir?");
  });

  it("derives the summary from the visible rows", async () => {
    const { container } = renderBrowser();

    await screen.findByText("(önizleme yok)");

    const summary = container.querySelector("dl")!;

    expect(summary.textContent).toContain("5");
    expect(summary.textContent).toContain("soru gösteriliyor");
    expect(summary.textContent).toContain("2");
    expect(summary.textContent).toContain("inceleme gerekli");
  });
});

describe("ExercisesBrowser filters", () => {
  it("sends a type change up as a filter change", async () => {
    const user = userEvent.setup();
    renderBrowser();

    await screen.findByText("(önizleme yok)");
    await user.selectOptions(screen.getByLabelText("Tip"), "true_false");

    expect(onFiltersChange).toHaveBeenCalledWith({ type: "true_false" });
  });

  it("sends a status change up as a filter change", async () => {
    const user = userEvent.setup();
    renderBrowser();

    await screen.findByText("(önizleme yok)");
    await user.selectOptions(screen.getByLabelText("Durum"), "draft");

    expect(onFiltersChange).toHaveBeenCalledWith({ status: "draft" });
  });

  it("refetches from the backend when the type filter changes", async () => {
    const { rerenderWith } = renderBrowser();

    await screen.findByText("(önizleme yok)");
    expect(getUnitExercises).toHaveBeenCalledTimes(1);

    rerenderWith({ type: "true_false" });

    await waitFor(() => {
      expect(getUnitExercises).toHaveBeenCalledTimes(2);
    });
    expect(getUnitExercises).toHaveBeenLastCalledWith(UNIT_ID, {
      type: "true_false",
      status: undefined,
    });
  });

  it("refetches from the backend when the status filter changes", async () => {
    const { rerenderWith } = renderBrowser();

    await screen.findByText("(önizleme yok)");

    rerenderWith({ status: "draft" });

    await waitFor(() => {
      expect(getUnitExercises).toHaveBeenCalledTimes(2);
    });
    expect(getUnitExercises).toHaveBeenLastCalledWith(UNIT_ID, {
      type: undefined,
      status: "draft",
    });
  });

  it("filters by topic in the browser without any new request", async () => {
    const { rerenderWith } = renderBrowser();

    await screen.findByText("(önizleme yok)");
    expect(getUnitExercises).toHaveBeenCalledTimes(1);

    rerenderWith({ topicId: 1 });

    await waitFor(() => {
      expect(screen.queryByText("Kavramı karşılığıyla birleştir.")).toBeNull();
    });
    expect(
      screen.getByText("Orhun Yazıtları hangi Türk devletine aittir?"),
    ).toBeDefined();
    expect(getUnitExercises).toHaveBeenCalledTimes(1);
  });

  it("filters by difficulty in the browser without any new request", async () => {
    const { rerenderWith } = renderBrowser();

    await screen.findByText("(önizleme yok)");

    rerenderWith({ difficulty: 3 });

    await waitFor(() => {
      expect(
        screen.queryByText("Orhun Yazıtları hangi Türk devletine aittir?"),
      ).toBeNull();
    });
    expect(screen.getByText("(önizleme yok)")).toBeDefined();
    expect(getUnitExercises).toHaveBeenCalledTimes(1);
  });

  it("lists topic options derived from the loaded exercises", async () => {
    renderBrowser();

    await screen.findByText("(önizleme yok)");

    const topicSelect = screen.getByLabelText("Konu");
    const options = [...within(topicSelect).getAllByRole("option")].map(
      (option) => option.textContent,
    );

    expect(options).toEqual([
      "Tümü",
      "İlk Türk Devletleri",
      "Kültür ve Medeniyet",
    ]);
  });

  it("offers a clear action only while a filter is active", async () => {
    const user = userEvent.setup();
    const { rerenderWith } = renderBrowser();

    await screen.findByText("(önizleme yok)");
    expect(
      screen.queryByRole("button", { name: "Filtreleri temizle" }),
    ).toBeNull();

    rerenderWith({ difficulty: 3 });

    await user.click(
      await screen.findByRole("button", { name: "Filtreleri temizle" }),
    );

    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });
});

describe("ExercisesBrowser empty states", () => {
  it("distinguishes an empty unit from an empty filter result", async () => {
    getUnitExercises.mockResolvedValue(unitData({ exercises: [] }));

    const { rerenderWith } = renderBrowser();

    expect(
      await screen.findByText("Bu ünitede henüz soru bulunmuyor."),
    ).toBeDefined();

    rerenderWith({ difficulty: 4 });

    expect(
      await screen.findByText("Bu filtrelerle eşleşen soru bulunmuyor."),
    ).toBeDefined();
  });

  it("shows the filtered empty state when the client filters match nothing", async () => {
    const { rerenderWith } = renderBrowser();

    await screen.findByText("(önizleme yok)");

    rerenderWith({ topicId: 1, difficulty: 5 });

    expect(
      await screen.findByText("Bu filtrelerle eşleşen soru bulunmuyor."),
    ).toBeDefined();
  });
});

describe("ExercisesBrowser hierarchy and errors", () => {
  it("refuses to render a unit that belongs to another course", async () => {
    getUnitExercises.mockResolvedValue({
      ...data,
      unit: { id: UNIT_ID + 999, title: "Başka ünite" },
    });

    renderBrowser();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Ünite bulunamadı",
      }),
    ).toBeDefined();
    expect(screen.queryByText("Başka ünite")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("says the unit is missing when it is absent from the course's unit list", async () => {
    getCourseUnits.mockResolvedValue([]);

    renderBrowser();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Ünite bulunamadı",
      }),
    ).toBeDefined();
    expect(replace).not.toHaveBeenCalled();
  });

  it("says the unit is missing when the backend answers 404", async () => {
    getUnitExercises.mockRejectedValue(apiError("not_found", 404));

    renderBrowser();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Ünite bulunamadı",
      }),
    ).toBeDefined();
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows a forbidden state without redirecting on 403", async () => {
    getUnitExercises.mockRejectedValue(apiError("authorization", 403));

    renderBrowser();

    const alert = await screen.findByRole("alert");

    expect(alert.textContent).toContain("erişim yetkiniz yok");
    expect(screen.queryByRole("button", { name: "Tekrar dene" })).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows a safe error with a working retry action", async () => {
    getUnitExercises.mockRejectedValueOnce(apiError("server", 502));
    getUnitExercises.mockResolvedValueOnce(unitData());
    const user = userEvent.setup();

    renderBrowser();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Sorular yüklenemedi");
    expect(document.body.textContent).not.toMatch(/SQLSTATE|stack|TypeError/i);

    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));

    expect(await screen.findByText("(önizleme yok)")).toBeDefined();
  });

  it("redirects to the login page on 401", async () => {
    getUnitExercises.mockRejectedValue(apiError("authentication", 401));

    renderBrowser();

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/login");
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("ExercisesBrowser editor actions", () => {
  it("offers one create action per editable type with edit_content", async () => {
    renderBrowser({}, true);
    await screen.findByText("(önizleme yok)");

    const base = `/courses/${COURSE_ID}/units/${UNIT_ID}/exercises/new`;
    const expected: [string, string][] = [
      // multiple_choice keeps the bare route for backward compatibility.
      ["Çoktan seçmeli", base],
      ["Doğru / yanlış", `${base}?type=true_false`],
      ["Boşluk doldurma", `${base}?type=fill_blank`],
      ["Sayısal cevap", `${base}?type=numeric_input`],
      ["Bilgi kartı", `${base}?type=flashcard`],
      ["Eşleştirme", `${base}?type=matching`],
      ["Sıralama", `${base}?type=ordering`],
      ["Kelime sıralama", `${base}?type=word_order`],
    ];

    const group = within(
      screen.getByRole("group", { name: "Yeni soru oluştur" }),
    );
    for (const [label, href] of expected) {
      expect(
        group.getByRole("link", { name: label }).getAttribute("href"),
      ).toBe(href);
    }
    expect(group.getAllByRole("link")).toHaveLength(expected.length);

    // The two media types have no create action.
    expect(screen.queryByRole("link", { name: /görsel/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /diyagram/i })).toBeNull();
  });

  it("links Düzenle for the editable types only", async () => {
    renderBrowser({}, true);
    await screen.findByText("(önizleme yok)");

    // Fixture rows: multiple_choice(1), true_false(2), fill_blank(3),
    // matching(4), image_hotspot(5). Only image_hotspot is not editable.
    const editLinks = screen.getAllByRole("link", { name: "Düzenle" });
    expect(editLinks.map((link) => link.getAttribute("href")).sort()).toEqual([
      `/courses/${COURSE_ID}/units/${UNIT_ID}/exercises/1`,
      `/courses/${COURSE_ID}/units/${UNIT_ID}/exercises/2`,
      `/courses/${COURSE_ID}/units/${UNIT_ID}/exercises/3`,
      `/courses/${COURSE_ID}/units/${UNIT_ID}/exercises/4`,
    ]);
  });

  it("links Düzenle for every editable type and no others", async () => {
    const rows = [
      "multiple_choice",
      "true_false",
      "fill_blank",
      "numeric_input",
      "flashcard",
      "matching",
      "ordering",
      "word_order",
      "image_hotspot",
      "diagram_label",
    ].map((type, index) => ({
      ...data.exercises[0]!,
      id: index + 1,
      type,
      preview: `${type} önizleme`,
    })) as UnitExercisesData["exercises"];
    getUnitExercises.mockResolvedValue(unitData({ exercises: rows }));

    renderBrowser({}, true);
    await screen.findByText("multiple_choice önizleme");

    // The eight text editor types are editable; the two media types stay
    // read-only until there is media infrastructure to edit them with.
    expect(
      screen
        .getAllByRole("link", { name: "Düzenle" })
        .map((link) => link.getAttribute("href"))
        .sort(),
    ).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8]
        .map((id) => `/courses/${COURSE_ID}/units/${UNIT_ID}/exercises/${id}`)
        .sort(),
    );
  });

  it("shows no create or edit actions without edit_content", async () => {
    renderBrowser();
    await screen.findByText("(önizleme yok)");
    expect(
      screen.queryByRole("group", { name: "Yeni soru oluştur" }),
    ).toBeNull();
    for (const label of [
      "Çoktan seçmeli",
      "Doğru / yanlış",
      "Boşluk doldurma",
      "Sayısal cevap",
      "Bilgi kartı",
    ]) {
      expect(screen.queryByRole("link", { name: label })).toBeNull();
    }
    expect(screen.queryByRole("link", { name: "Düzenle" })).toBeNull();
  });
});

describe("ExercisesBrowser is read-only", () => {
  it("offers no write action", async () => {
    renderBrowser();

    await screen.findByText("(önizleme yok)");

    // "Düzenlenmiş" is a read-only version marker, so check for actual
    // controls by accessible name rather than loose text.
    for (const name of [
      /Yeni Soru/,
      /^Düzenle$/,
      /Arşivle/,
      /^Sil$/,
      /Kaydet/,
      /Yayınla/,
      /İçe Aktar/,
    ]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
      expect(screen.queryByRole("link", { name })).toBeNull();
    }

    for (const absent of [/Yeni Soru/, /Arşivle/, /Kaydet/, /Yayınla/]) {
      expect(document.body.textContent).not.toMatch(absent);
    }
  });

  it("renders exercise rows that are neither links nor buttons", async () => {
    const { container } = renderBrowser();

    await screen.findByText("(önizleme yok)");

    for (const row of container.querySelectorAll("li")) {
      expect(row.querySelector("a")).toBeNull();
      expect(row.querySelector("button")).toBeNull();
    }
  });

  it("links only back to the unit list", async () => {
    renderBrowser();

    await screen.findByText("(önizleme yok)");

    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual([`/courses/${COURSE_ID}`]);
  });
});

describe("ExercisesBrowser archiving", () => {
  /*
   | A failed archive must not be silent.
   |
   | The optimistic-looking part of this flow is the button label flipping back
   | from "Arşivleniyor…": without a visible error that is indistinguishable
   | from a question that simply refuses to archive, and the editor has no
   | reason to retry or escalate.
   */
  it("surfaces a failed archive as an accessible alert", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    archiveExercise.mockRejectedValue(
      Object.assign(new Error("Sunucuya ulaşılamadı."), { kind: "network" }),
    );

    renderBrowser({}, true);

    const button = (
      await screen.findAllByRole("button", { name: "Arşivle" })
    )[0]!;
    await user.click(button);

    const alert = await screen.findByRole("alert");

    expect(alert.textContent).toMatch(/Soru arşivlenemedi/);
    expect(alert.textContent).toMatch(/Sunucuya ulaşılamadı/);
  });

  it("shows no alert when archiving succeeds", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderBrowser({}, true);

    const button = (
      await screen.findAllByRole("button", { name: "Arşivle" })
    )[0]!;
    await user.click(button);

    await waitFor(() => {
      expect(archiveExercise).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByText(/Soru arşivlenemedi/)).toBeNull();
  });

  it("asks for confirmation that explains what archiving preserves", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    renderBrowser({}, true);

    const button = (
      await screen.findAllByRole("button", { name: "Arşivle" })
    )[0]!;
    await user.click(button);

    expect(confirm).toHaveBeenCalledTimes(1);

    const message = confirm.mock.calls[0]![0] as string;

    expect(message).toMatch(/Yeni oturumlar/);
    expect(message).toMatch(/geçmiş kayıtları korunur/);

    // Declining must not call the backend.
    expect(archiveExercise).not.toHaveBeenCalled();
  });
});
