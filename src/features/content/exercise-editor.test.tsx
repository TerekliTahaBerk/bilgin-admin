/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type {
  Course,
  Unit,
  UnitExercisesData,
} from "@/contracts/admin/content";
import type {
  CourseTopicsData,
  ExerciseDetail,
} from "@/contracts/admin/exercise-editor";
import {
  validExerciseDetailResponse,
  validTopicsResponse,
} from "@/test/fixtures/exercise-editor-api";
import {
  validCoursesResponse,
  validUnitsResponse,
} from "@/test/fixtures/courses-api";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

const getCourses = vi.fn<() => Promise<Course[]>>();
const getCourseUnits = vi.fn<() => Promise<Unit[]>>();
const getCourseTopics = vi.fn<() => Promise<CourseTopicsData>>();
const getUnitExercises = vi.fn<() => Promise<UnitExercisesData>>();
const getExerciseDetail = vi.fn<() => Promise<ExerciseDetail>>();
const createExercise = vi.fn();
const updateExercise = vi.fn();

vi.mock("@/features/content/content-client", () => ({
  getCourses: () => getCourses(),
  getCourseUnits: () => getCourseUnits(),
  getCourseTopics: () => getCourseTopics(),
  getUnitExercises: () => getUnitExercises(),
  getExerciseDetail: () => getExerciseDetail(),
  createExercise: (input: unknown) => createExercise(input),
  updateExercise: (id: number, input: unknown) => updateExercise(id, input),
}));

const { ExerciseEditor } = await import("@/features/content/exercise-editor");

const course = { ...validCoursesResponse.data[0]!, id: 1 } as Course;
const unit = { ...validUnitsResponse.data[0]!, id: 11 } as Unit;
const detail = {
  ...validExerciseDetailResponse.data,
  id: 101,
} as ExerciseDetail;
const topics = validTopicsResponse.data as CourseTopicsData;
const list: UnitExercisesData = {
  unit: { id: 11, title: unit.title },
  exercises: [
    {
      id: 101,
      type: "multiple_choice",
      topic: { id: 1, name: "İlk Türk Devletleri" },
      difficulty: 2,
      status: "published",
      version: 3,
      scopes: ["tyt", "ayt"],
      preview: "Orhun Yazıtları hangi devlete aittir?",
      stats: detail.stats,
    },
  ],
};

function renderEditor(exerciseId?: number, canEdit = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ExerciseEditor
        canEdit={canEdit}
        courseId={1}
        exerciseId={exerciseId}
        unitId={11}
      />
    </QueryClientProvider>,
  );
}

async function fillValidCreate(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("heading", { name: "Yeni çoktan seçmeli soru" });
  await user.selectOptions(screen.getByLabelText("Konu"), "1");
  await user.type(screen.getByLabelText("Soru kökü"), "Yeni soru kökü");
  for (const id of ["a", "b", "c", "d"]) {
    await user.type(screen.getByLabelText(`${id} şıkkı metni`), `Şık ${id}`);
  }
  await user.click(screen.getByLabelText("b şıkkını doğru cevap seç"));
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Kaydet" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
}

beforeEach(() => {
  getCourses.mockReset().mockResolvedValue([course]);
  getCourseUnits.mockReset().mockResolvedValue([unit]);
  getCourseTopics.mockReset().mockResolvedValue(topics);
  getUnitExercises.mockReset().mockResolvedValue(list);
  getExerciseDetail.mockReset().mockResolvedValue(detail);
  createExercise.mockReset().mockResolvedValue({ id: 123, status: "draft" });
  updateExercise.mockReset().mockResolvedValue({
    id: 101,
    version: 4,
    answer_key_changed: true,
    warning: "Cevap anahtarı değişti; geçmiş istatistikleri kontrol edin.",
  });
  replace.mockReset();
  refresh.mockReset();
});

describe("ExerciseEditor native fallback semantics", () => {
  it("submits natively with POST so question content can never reach the URL", async () => {
    const { container } = renderEditor();
    await screen.findByRole("heading", { name: "Yeni çoktan seçmeli soru" });

    // Resolve the real editor form through the DOM the user submits, not a
    // source-string match: the form that actually owns the answer-key fields.
    const stem = screen.getByLabelText("Soru kökü") as HTMLTextAreaElement;
    const form = stem.closest("form");

    expect(form).not.toBeNull();
    expect(container.contains(form)).toBe(true);
    // A form without an explicit method defaults to GET, which would serialise
    // stem, option texts, correctOptionId and explanation into the query
    // string on a pre-hydration submit.
    expect(form!.getAttribute("method")).toBe("post");
    expect(form!.method).toBe("post");
    expect(
      within(form!).getByLabelText("b şıkkını doğru cevap seç"),
    ).toBeDefined();
  });
});

describe("multiple choice create editor", () => {
  it("renders real topics, four stable options and a live preview", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByRole("heading", { name: "Yeni çoktan seçmeli soru" });

    expect(
      within(screen.getByLabelText("Konu")).getAllByRole("option"),
    ).toHaveLength(3);
    expect(screen.getByLabelText("a şıkkı metni")).toBeDefined();
    expect(screen.getByLabelText("d şıkkı metni")).toBeDefined();
    expect((screen.getByLabelText("TYT") as HTMLInputElement).checked).toBe(
      true,
    );

    await user.type(screen.getByLabelText("Soru kökü"), "Önizlenen soru");
    expect(screen.getByLabelText("Canlı önizleme").textContent).toContain(
      "Önizlenen soru",
    );
  });

  it("adds a unique option and clears the answer when its option is removed", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByRole("heading", { name: "Yeni çoktan seçmeli soru" });

    await user.click(screen.getByRole("button", { name: "Şık ekle" }));
    expect(screen.getByLabelText("e şıkkı metni")).toBeDefined();
    await user.click(screen.getByLabelText("b şıkkını doğru cevap seç"));
    await user.click(screen.getByLabelText("b şıkkını kaldır"));
    expect(screen.queryByLabelText("b şıkkı metni")).toBeNull();
    expect(screen.getByText("Doğru şıkkı seçin.")).toBeDefined();
  });

  it("creates once and replaces the route with the returned draft id", async () => {
    const user = userEvent.setup();
    renderEditor();
    await fillValidCreate(user);
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(createExercise).toHaveBeenCalledTimes(1));
    expect(createExercise.mock.calls[0]?.[0]).toMatchObject({
      type: "multiple_choice",
      owner_unit_id: 11,
      topic_id: 1,
      answer_key: { correct_option_id: "b" },
    });
    expect(replace).toHaveBeenCalledWith("/courses/1/units/11/exercises/123");
  });

  it("Save & New preserves common defaults and clears content without reload", async () => {
    const user = userEvent.setup();
    renderEditor();
    await fillValidCreate(user);
    await user.selectOptions(screen.getByLabelText("Zorluk"), "5");
    await user.click(screen.getByRole("button", { name: "Kaydet ve Yeni" }));

    expect(
      await screen.findByText("Kaydedildi. Yeni soru hazır."),
    ).toBeDefined();
    expect((screen.getByLabelText("Konu") as HTMLSelectElement).value).toBe(
      "1",
    );
    expect((screen.getByLabelText("Zorluk") as HTMLSelectElement).value).toBe(
      "5",
    );
    expect((screen.getByLabelText("TYT") as HTMLInputElement).checked).toBe(
      true,
    );
    expect(
      (screen.getByLabelText("Soru kökü") as HTMLTextAreaElement).value,
    ).toBe("");
    expect(
      (screen.getByLabelText("a şıkkı metni") as HTMLInputElement).value,
    ).toBe("");
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ["Ctrl+S", { ctrlKey: true }],
    ["Meta+S", { metaKey: true }],
  ])(
    "%s prevents browser save and uses the same valid submit path",
    async (_label, modifier) => {
      const user = userEvent.setup();
      renderEditor();
      await fillValidCreate(user);
      const event = new KeyboardEvent("keydown", {
        key: "s",
        ...modifier,
        cancelable: true,
      });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      await waitFor(() => expect(createExercise).toHaveBeenCalledTimes(1));
    },
  );

  it.each([
    ["Ctrl+Shift+Enter", { ctrlKey: true }],
    ["Meta+Shift+Enter", { metaKey: true }],
  ])("%s uses Save & New and clears content", async (_label, modifier) => {
    const user = userEvent.setup();
    renderEditor();
    await fillValidCreate(user);
    fireEvent.keyDown(window, { key: "Enter", shiftKey: true, ...modifier });
    expect(
      await screen.findByText("Kaydedildi. Yeni soru hazır."),
    ).toBeDefined();
    expect(
      (screen.getByLabelText("Soru kökü") as HTMLTextAreaElement).value,
    ).toBe("");
    expect(createExercise).toHaveBeenCalledTimes(1);
  });

  it("does not mutate for invalid shortcuts or duplicate a pending mutation", async () => {
    let resolveCreate:
      ((value: { id: number; status: string }) => void) | undefined;
    createExercise.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const user = userEvent.setup();
    renderEditor();
    await screen.findByRole("heading", { name: "Yeni çoktan seçmeli soru" });
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    expect(createExercise).not.toHaveBeenCalled();

    await fillValidCreate(user);
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    await waitFor(() => expect(createExercise).toHaveBeenCalledTimes(1));
    resolveCreate?.({ id: 123, status: "draft" });
  });

  it("maps TOPIC_MISMATCH beside the topic without exposing backend detail", async () => {
    createExercise.mockRejectedValue({
      kind: "validation",
      status: 422,
      code: "TOPIC_MISMATCH",
      message: "internal topic/course relation detail",
    });
    const user = userEvent.setup();
    renderEditor();
    await fillValidCreate(user);
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(
      await screen.findAllByText("Seçilen konu bu derse ait değil."),
    ).toHaveLength(2);
    expect(
      screen.queryByText("internal topic/course relation detail"),
    ).toBeNull();
  });

  it("renders INVALID_EXERCISE_CONTENT schema errors as a safe list", async () => {
    createExercise.mockRejectedValue({
      kind: "validation",
      status: 422,
      code: "INVALID_EXERCISE_CONTENT",
      message: "raw validator detail",
      details: {
        schema_errors: [
          "content.options ids must be unique",
          "answer_key.correct_option_id must reference an option",
        ],
      },
    });
    const user = userEvent.setup();
    renderEditor();
    await fillValidCreate(user);
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(
      await screen.findByText("Soru içeriği doğrulanamadı."),
    ).toBeDefined();
    expect(
      screen.getByText("content.options ids must be unique"),
    ).toBeDefined();
    expect(
      screen.getByText("answer_key.correct_option_id must reference an option"),
    ).toBeDefined();
    expect(screen.queryByText("raw validator detail")).toBeNull();
  });
});

describe("multiple choice edit editor", () => {
  it("hydrates ids, answer, status and version then shows update warning", async () => {
    const user = userEvent.setup();
    renderEditor(101);
    await screen.findByRole("heading", {
      name: "Çoktan seçmeli soruyu düzenle",
    });
    expect(screen.getByText("v3")).toBeDefined();
    expect(screen.getByText("Yayında")).toBeDefined();
    expect(
      (screen.getByLabelText("a şıkkı metni") as HTMLInputElement).value,
    ).toBe("Asya Hun");
    expect(
      (screen.getByLabelText("b şıkkını doğru cevap seç") as HTMLInputElement)
        .checked,
    ).toBe(true);

    await user.type(screen.getByLabelText("Soru kökü"), " güncel");
    await user.click(screen.getByLabelText("a şıkkını doğru cevap seç"));
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(await screen.findByText("v4")).toBeDefined();
    expect(screen.getByText(/Cevap anahtarı değişti/)).toBeDefined();
    expect(updateExercise).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ answer_key: { correct_option_id: "a" } }),
    );
  });

  it("renders a safe unsupported-type state without a mutation form", async () => {
    // matching is not an M2 editor type; it stays readable but not editable.
    getExerciseDetail.mockResolvedValue({
      ...detail,
      type: "matching",
      content: { pairs: [{ left: "a", right: "b" }] },
      answer_key: { pairs: [["a", "b"]] },
    });
    renderEditor(101);
    expect(
      await screen.findByRole("heading", {
        name: "Bu soru tipi henüz bu editörde desteklenmiyor.",
      }),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: "Kaydet" })).toBeNull();
  });

  it("renders a page guard when edit_content is false", async () => {
    renderEditor(undefined, false);
    expect(await screen.findByText("Düzenleme yetkiniz yok.")).toBeDefined();
    expect(screen.queryByRole("form")).toBeNull();
  });
});
