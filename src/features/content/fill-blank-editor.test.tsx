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
  validFillBlankDetailResponse,
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
const topics = validTopicsResponse.data as CourseTopicsData;
const detail = {
  ...validFillBlankDetailResponse.data,
  id: 103,
} as ExerciseDetail;
const TEMPLATE = "Türklerde yazısız hukuk kurallarına {{0}} denir.";
const list: UnitExercisesData = {
  unit: { id: 11, title: unit.title },
  exercises: [
    {
      id: 103,
      type: "fill_blank",
      topic: { id: 1, name: "İlk Türk Devletleri" },
      difficulty: 3,
      status: "published",
      version: 2,
      scopes: ["tyt", "ayt"],
      preview: TEMPLATE,
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
        createType="fill_blank"
        exerciseId={exerciseId}
        unitId={11}
      />
    </QueryClientProvider>,
  );
}

function template() {
  return screen.getByLabelText("Cümle şablonu") as HTMLTextAreaElement;
}

/**
 * user-event treats "{{" as its escape for a literal "{", so a placeholder
 * token cannot be typed through it. A change event is what the browser fires
 * for a paste anyway, and it is exactly what react-hook-form listens to.
 */
function setTemplate(value: string) {
  fireEvent.change(template(), { target: { value } });
}

function saveButton() {
  return screen.getByRole("button", { name: "Kaydet" }) as HTMLButtonElement;
}

beforeEach(() => {
  getCourses.mockReset().mockResolvedValue([course]);
  getCourseUnits.mockReset().mockResolvedValue([unit]);
  getCourseTopics.mockReset().mockResolvedValue(topics);
  getUnitExercises.mockReset().mockResolvedValue(list);
  getExerciseDetail.mockReset().mockResolvedValue(detail);
  createExercise.mockReset().mockResolvedValue({ id: 404, status: "draft" });
  updateExercise.mockReset().mockResolvedValue({
    id: 103,
    version: 3,
    answer_key_changed: true,
    warning: "Cevap anahtarı değişti; geçmiş istatistikleri kontrol edin.",
  });
  replace.mockReset();
  refresh.mockReset();
});

describe("fill blank create editor", () => {
  it("renders the shared common fields, a template and no blanks yet", async () => {
    renderEditor();
    await screen.findByRole("heading", {
      name: "Yeni boşluk doldurma sorusu",
    });

    expect(screen.getByLabelText("Konu")).toBeDefined();
    expect(screen.getByLabelText("Zorluk")).toBeDefined();
    expect(screen.getByLabelText("TYT")).toBeDefined();
    expect(screen.getByLabelText("Açıklama")).toBeDefined();
    expect(screen.getByText("Tip: Boşluk doldurma")).toBeDefined();

    expect(template().value).toBe("");
    expect(screen.getByRole("button", { name: "Boşluk ekle" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Seçenek ekle" })).toBeDefined();
    // No invented {{0}} and no answer control before the editor asks for one.
    expect(screen.queryByLabelText(/^Boşluk 1/)).toBeNull();
    expect(screen.getByText(/Boşluk bulunamadı/)).toBeDefined();

    // Fields of the other two editors stay out of this one.
    expect(screen.queryByLabelText("Soru kökü")).toBeNull();
    expect(screen.queryByLabelText("İfade")).toBeNull();
  });

  it("inserts a placeholder at the caret and grows the answer list", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByRole("heading", {
      name: "Yeni boşluk doldurma sorusu",
    });

    await user.type(template(), "Türklerde  denir.");
    template().setSelectionRange(10, 10);
    await user.click(screen.getByRole("button", { name: "Boşluk ekle" }));

    expect(template().value).toBe("Türklerde {{0}} denir.");
    expect(screen.getByText("1 boşluk bulundu.")).toBeDefined();
    expect(screen.getByLabelText("Boşluk 1 · {{0}}")).toBeDefined();
    await waitFor(() => expect(template().selectionStart).toBe(15));
  });

  it("derives the answer controls from tokens typed by hand", async () => {
    renderEditor();
    await screen.findByRole("heading", {
      name: "Yeni boşluk doldurma sorusu",
    });

    setTemplate("{{0}} ve {{1}} olur.");
    await waitFor(() =>
      expect(screen.getByText("2 boşluk bulundu.")).toBeDefined(),
    );
    expect(screen.getByLabelText("Boşluk 1 · {{0}}")).toBeDefined();
    expect(screen.getByLabelText("Boşluk 2 · {{1}}")).toBeDefined();

    // Deleting a token removes its control again.
    setTemplate("{{0}} tek.");
    await waitFor(() =>
      expect(screen.getByText("1 boşluk bulundu.")).toBeDefined(),
    );
    expect(screen.queryByLabelText("Boşluk 2 · {{1}}")).toBeNull();
  });

  it("uses a free-text answer until choices exist, then a select", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByRole("heading", {
      name: "Yeni boşluk doldurma sorusu",
    });

    setTemplate("Türklerde {{0}} denir.");
    await waitFor(() =>
      expect(screen.getByLabelText("Boşluk 1 · {{0}}")).toBeDefined(),
    );
    expect(
      (screen.getByLabelText("Boşluk 1 · {{0}}") as HTMLInputElement).tagName,
    ).toBe("INPUT");

    await user.click(screen.getByRole("button", { name: "Seçenek ekle" }));
    await user.type(screen.getByLabelText("1. seçenek metni"), "Töre");

    await waitFor(() =>
      expect(
        (screen.getByLabelText("Boşluk 1 · {{0}}") as HTMLElement).tagName,
      ).toBe("SELECT"),
    );
    const select = screen.getByLabelText(
      "Boşluk 1 · {{0}}",
    ) as HTMLSelectElement;
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Seçenek seçin", "Töre"]);
  });

  it("keeps save disabled until template, blanks and answers all line up", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByRole("heading", {
      name: "Yeni boşluk doldurma sorusu",
    });

    expect(saveButton().disabled).toBe(true);

    await user.selectOptions(screen.getByLabelText("Konu"), "1");
    setTemplate("Boşluksuz metin.");
    // A template with no placeholder can never be graded.
    expect(saveButton().disabled).toBe(true);

    setTemplate("Türklerde {{0}} denir.");
    // The blank exists but has no answer yet.
    await waitFor(() => expect(saveButton().disabled).toBe(true));

    await user.type(screen.getByLabelText("Boşluk 1 · {{0}}"), "Töre");
    await waitFor(() => expect(saveButton().disabled).toBe(false));
  });

  it("sends the exact create payload and routes to the returned draft", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByRole("heading", {
      name: "Yeni boşluk doldurma sorusu",
    });

    await user.selectOptions(screen.getByLabelText("Konu"), "1");
    setTemplate("Türklerde {{0}} denir.");
    await user.click(screen.getByRole("button", { name: "Seçenek ekle" }));
    await user.type(screen.getByLabelText("1. seçenek metni"), "Töre");
    await user.click(screen.getByRole("button", { name: "Seçenek ekle" }));
    await user.type(screen.getByLabelText("2. seçenek metni"), "Kurultay");
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Boşluk 1 · {{0}}") as HTMLElement).tagName,
      ).toBe("SELECT"),
    );
    await user.selectOptions(screen.getByLabelText("Boşluk 1 · {{0}}"), "Töre");
    await waitFor(() => expect(saveButton().disabled).toBe(false));

    await user.click(saveButton());

    await waitFor(() => expect(createExercise).toHaveBeenCalledTimes(1));
    expect(createExercise.mock.calls[0]?.[0]).toEqual({
      type: "fill_blank",
      topic_id: 1,
      owner_unit_id: 11,
      difficulty: 3,
      content: {
        template: "Türklerde {{0}} denir.",
        choices: ["Töre", "Kurultay"],
      },
      answer_key: { blanks: ["Töre"] },
      explanation: null,
      applicable_scopes: ["tyt"],
    });
    expect(replace).toHaveBeenCalledWith("/courses/1/units/11/exercises/404");
  });

  it("saves two blanks in template occurrence order", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByRole("heading", {
      name: "Yeni boşluk doldurma sorusu",
    });

    await user.selectOptions(screen.getByLabelText("Konu"), "1");
    setTemplate("{{0}} ve {{1}} birlikte.");
    await waitFor(() =>
      expect(screen.getByLabelText("Boşluk 2 · {{1}}")).toBeDefined(),
    );
    await user.type(screen.getByLabelText("Boşluk 1 · {{0}}"), "birinci");
    await user.type(screen.getByLabelText("Boşluk 2 · {{1}}"), "ikinci");
    await waitFor(() => expect(saveButton().disabled).toBe(false));

    await user.click(saveButton());

    await waitFor(() => expect(createExercise).toHaveBeenCalledTimes(1));
    expect(createExercise.mock.calls[0]?.[0].answer_key).toEqual({
      blanks: ["birinci", "ikinci"],
    });
    expect(createExercise.mock.calls[0]?.[0].content.choices).toEqual([]);
  });

  it("shows the template with readable blanks in the live preview", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByRole("heading", {
      name: "Yeni boşluk doldurma sorusu",
    });

    const preview = screen.getByLabelText("Canlı önizleme");
    setTemplate("Türklerde {{0}} denir.");

    await waitFor(() => expect(preview.textContent).toContain("Türklerde"));
    expect(preview.textContent).toContain("denir.");
    // The raw token is replaced by a readable blank, not printed as-is.
    expect(preview.textContent).not.toContain("{{0}}");

    await user.type(screen.getByLabelText("Boşluk 1 · {{0}}"), "Töre");
    await waitFor(() => expect(preview.textContent).toContain("Töre"));
  });

  it("routes Ctrl+S through the same fill blank serializer", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByRole("heading", {
      name: "Yeni boşluk doldurma sorusu",
    });

    await user.selectOptions(screen.getByLabelText("Konu"), "1");
    setTemplate("Türklerde {{0}} denir.");
    await waitFor(() =>
      expect(screen.getByLabelText("Boşluk 1 · {{0}}")).toBeDefined(),
    );
    await user.type(screen.getByLabelText("Boşluk 1 · {{0}}"), "Töre");
    await waitFor(() => expect(saveButton().disabled).toBe(false));

    const event = new KeyboardEvent("keydown", {
      key: "s",
      ctrlKey: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(createExercise).toHaveBeenCalledTimes(1));
    expect(createExercise.mock.calls[0]?.[0]).toMatchObject({
      type: "fill_blank",
      answer_key: { blanks: ["Töre"] },
    });
  });

  it("Save & New keeps the shared context and clears the whole question", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByRole("heading", {
      name: "Yeni boşluk doldurma sorusu",
    });

    await user.selectOptions(screen.getByLabelText("Konu"), "1");
    await user.selectOptions(screen.getByLabelText("Zorluk"), "5");
    setTemplate("Türklerde {{0}} denir.");
    await waitFor(() =>
      expect(screen.getByLabelText("Boşluk 1 · {{0}}")).toBeDefined(),
    );
    await user.type(screen.getByLabelText("Boşluk 1 · {{0}}"), "Töre");
    await user.type(screen.getByLabelText("Açıklama"), "Açıklama metni");
    await waitFor(() => expect(saveButton().disabled).toBe(false));

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
    expect(screen.getByText("Tip: Boşluk doldurma")).toBeDefined();
    expect(template().value).toBe("");
    expect(
      (screen.getByLabelText("Açıklama") as HTMLTextAreaElement).value,
    ).toBe("");
    expect(screen.queryByLabelText(/^Boşluk 1/)).toBeNull();
    expect(screen.queryByLabelText("1. seçenek metni")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("renders the page guard instead of a form when edit_content is false", async () => {
    renderEditor(undefined, false);
    expect(await screen.findByText("Düzenleme yetkiniz yok.")).toBeDefined();
    expect(screen.queryByLabelText("Cümle şablonu")).toBeNull();
    expect(screen.queryByRole("button", { name: "Kaydet" })).toBeNull();
  });

  it("submits natively with POST from the one shared editor form", async () => {
    renderEditor();
    await screen.findByRole("heading", {
      name: "Yeni boşluk doldurma sorusu",
    });

    const form = template().closest("form");
    expect(form).not.toBeNull();
    expect(form!.getAttribute("method")).toBe("post");
    expect(document.querySelectorAll("form")).toHaveLength(1);
  });
});

describe("fill blank choices and answers", () => {
  async function setupWithTwoChoices(user: ReturnType<typeof userEvent.setup>) {
    renderEditor();
    await screen.findByRole("heading", {
      name: "Yeni boşluk doldurma sorusu",
    });
    await user.selectOptions(screen.getByLabelText("Konu"), "1");
    setTemplate("Türklerde {{0}} denir.");
    await user.click(screen.getByRole("button", { name: "Seçenek ekle" }));
    await user.type(screen.getByLabelText("1. seçenek metni"), "Töre");
    await user.click(screen.getByRole("button", { name: "Seçenek ekle" }));
    await user.type(screen.getByLabelText("2. seçenek metni"), "Kurultay");
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Boşluk 1 · {{0}}") as HTMLElement).tagName,
      ).toBe("SELECT"),
    );
    await user.selectOptions(screen.getByLabelText("Boşluk 1 · {{0}}"), "Töre");
    await waitFor(() => expect(saveButton().disabled).toBe(false));
  }

  it("leaves the answer alone when an unused choice is removed", async () => {
    const user = userEvent.setup();
    await setupWithTwoChoices(user);

    await user.click(
      screen.getByRole("button", { name: "2. seçeneği kaldır" }),
    );

    expect(
      (screen.getByLabelText("Boşluk 1 · {{0}}") as HTMLSelectElement).value,
    ).toBe("Töre");
    await waitFor(() => expect(saveButton().disabled).toBe(false));
  });

  it("clears the answer and blocks save when its choice is removed", async () => {
    const user = userEvent.setup();
    await setupWithTwoChoices(user);

    await user.click(
      screen.getByRole("button", { name: "1. seçeneği kaldır" }),
    );

    const answer = screen.getByLabelText(
      "Boşluk 1 · {{0}}",
    ) as HTMLSelectElement;
    // Never silently swapped for the remaining choice.
    expect(answer.value).toBe("");
    expect(answer.value).not.toBe("Kurultay");
    await waitFor(() => expect(saveButton().disabled).toBe(true));
  });

  it("migrates the answer as its choice is edited", async () => {
    const user = userEvent.setup();
    await setupWithTwoChoices(user);

    // Editing "Töre" into "Töre (yasa)" keeps the question answerable instead
    // of orphaning an answer the editor did not mean to break.
    await user.type(screen.getByLabelText("1. seçenek metni"), " (yasa)");

    await waitFor(() =>
      expect(
        (screen.getByLabelText("Boşluk 1 · {{0}}") as HTMLSelectElement).value,
      ).toBe("Töre (yasa)"),
    );
    await waitFor(() => expect(saveButton().disabled).toBe(false));

    await user.click(saveButton());
    await waitFor(() => expect(createExercise).toHaveBeenCalledTimes(1));
    expect(createExercise.mock.calls[0]?.[0]).toMatchObject({
      content: { choices: ["Töre (yasa)", "Kurultay"] },
      answer_key: { blanks: ["Töre (yasa)"] },
    });
  });

  it("orphans the answer when its choice is emptied, never guessing a new one", async () => {
    const user = userEvent.setup();
    await setupWithTwoChoices(user);

    await user.clear(screen.getByLabelText("1. seçenek metni"));

    const answer = screen.getByLabelText(
      "Boşluk 1 · {{0}}",
    ) as HTMLSelectElement;
    expect(answer.value).toBe("");
    expect(answer.value).not.toBe("Kurultay");
    await waitFor(() => expect(saveButton().disabled).toBe(true));
  });

  it("warns about duplicate choices without refusing them", async () => {
    const user = userEvent.setup();
    await setupWithTwoChoices(user);

    await user.clear(screen.getByLabelText("2. seçenek metni"));
    await user.type(screen.getByLabelText("2. seçenek metni"), "Töre");

    expect(
      await screen.findByText(/Aynı seçenek birden fazla kez yazılmış/),
    ).toBeDefined();
    await waitFor(() => expect(saveButton().disabled).toBe(false));
  });
});

describe("fill blank edit editor", () => {
  it("hydrates the template, choices and answer exactly", async () => {
    renderEditor(103);
    await screen.findByRole("heading", {
      name: "Boşluk doldurma sorusunu düzenle",
    });

    expect(template().value).toBe(TEMPLATE);
    expect(
      (screen.getByLabelText("1. seçenek metni") as HTMLInputElement).value,
    ).toBe("Töre");
    expect(
      (screen.getByLabelText("4. seçenek metni") as HTMLInputElement).value,
    ).toBe("Yuğ");
    expect(
      (screen.getByLabelText("Boşluk 1 · {{0}}") as HTMLSelectElement).value,
    ).toBe("Töre");
    expect(screen.getByText("v2")).toBeDefined();
    expect(screen.getByText("Yayında")).toBeDefined();
  });

  it("opens a stored question that has no choices in free-text mode", async () => {
    getExerciseDetail.mockResolvedValue({
      ...detail,
      content: { template: "Başkent {{0}} şehridir." },
      answer_key: { blanks: ["Karabalgasun"] },
    } as ExerciseDetail);
    renderEditor(103);
    await screen.findByRole("heading", {
      name: "Boşluk doldurma sorusunu düzenle",
    });

    const answer = screen.getByLabelText("Boşluk 1 · {{0}}");
    expect(answer.tagName).toBe("INPUT");
    expect((answer as HTMLInputElement).value).toBe("Karabalgasun");
    expect(screen.queryByLabelText("1. seçenek metni")).toBeNull();
  });

  it("keeps a non-sequential template untouched on load and on save", async () => {
    const user = userEvent.setup();
    getExerciseDetail.mockResolvedValue({
      ...detail,
      content: { template: "{{4}} sonra {{1}} gelir.", choices: [] },
      answer_key: { blanks: ["ilk", "ikinci"] },
    } as ExerciseDetail);
    renderEditor(103);
    await screen.findByRole("heading", {
      name: "Boşluk doldurma sorusunu düzenle",
    });

    expect(template().value).toBe("{{4}} sonra {{1}} gelir.");
    expect(screen.getByLabelText("Boşluk 1 · {{4}}")).toBeDefined();
    expect(screen.getByLabelText("Boşluk 2 · {{1}}")).toBeDefined();

    await user.type(screen.getByLabelText("Açıklama"), "Not");
    await user.click(saveButton());

    await waitFor(() => expect(updateExercise).toHaveBeenCalledTimes(1));
    expect(updateExercise.mock.calls[0]?.[1].content.template).toBe(
      "{{4}} sonra {{1}} gelir.",
    );
  });

  it("appends past the highest token instead of renumbering on edit", async () => {
    const user = userEvent.setup();
    getExerciseDetail.mockResolvedValue({
      ...detail,
      content: { template: "{{0}} ve {{2}} var.", choices: [] },
      answer_key: { blanks: ["a", "b"] },
    } as ExerciseDetail);
    renderEditor(103);
    await screen.findByRole("heading", {
      name: "Boşluk doldurma sorusunu düzenle",
    });

    template().setSelectionRange(
      template().value.length,
      template().value.length,
    );
    await user.click(screen.getByRole("button", { name: "Boşluk ekle" }));

    expect(template().value).toBe("{{0}} ve {{2}} var.{{3}}");
    await waitFor(() =>
      expect(screen.getByLabelText("Boşluk 3 · {{3}}")).toBeDefined(),
    );
    // The first two answers survive the growth.
    expect(
      (screen.getByLabelText("Boşluk 1 · {{0}}") as HTMLInputElement).value,
    ).toBe("a");
    expect(
      (screen.getByLabelText("Boşluk 2 · {{2}}") as HTMLInputElement).value,
    ).toBe("b");
  });

  it("saves an edited answer, shows the new version and the backend warning", async () => {
    const user = userEvent.setup();
    renderEditor(103);
    await screen.findByRole("heading", {
      name: "Boşluk doldurma sorusunu düzenle",
    });

    await user.selectOptions(
      screen.getByLabelText("Boşluk 1 · {{0}}"),
      "Kurultay",
    );
    await user.click(saveButton());

    await waitFor(() => expect(updateExercise).toHaveBeenCalledTimes(1));
    const [id, body] = updateExercise.mock.calls[0]!;
    expect(id).toBe(103);
    expect(body).toEqual({
      type: "fill_blank",
      topic_id: 1,
      difficulty: 3,
      content: {
        template: TEMPLATE,
        choices: ["Töre", "Kurultay", "Toy", "Yuğ"],
      },
      answer_key: { blanks: ["Kurultay"] },
      explanation: "Töre, yazısız hukuk kurallarının adıdır.",
      applicable_scopes: ["tyt", "ayt"],
    });
    expect(body).not.toHaveProperty("owner_unit_id");
    expect(body).not.toHaveProperty("status");
    expect(body).not.toHaveProperty("version");

    expect(await screen.findByText("v3")).toBeDefined();
    expect(await screen.findByText(/Cevap anahtarı değişti/)).toBeDefined();
    expect(screen.getByText("Kaydedildi")).toBeDefined();
  });

  it("Save & New from edit mode returns to the fill blank create route", async () => {
    const user = userEvent.setup();
    renderEditor(103);
    await screen.findByRole("heading", {
      name: "Boşluk doldurma sorusunu düzenle",
    });

    await user.type(screen.getByLabelText("Açıklama"), " Ek not.");
    await user.click(screen.getByRole("button", { name: "Kaydet ve Yeni" }));

    await waitFor(() => expect(updateExercise).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith(
      "/courses/1/units/11/exercises/new?type=fill_blank",
    );
  });

  it("offers no type conversion control on an existing question", async () => {
    renderEditor(103);
    await screen.findByRole("heading", {
      name: "Boşluk doldurma sorusunu düzenle",
    });

    expect(screen.queryByLabelText("Soru tipi")).toBeNull();
    expect(screen.queryByLabelText("Soru kökü")).toBeNull();
    expect(screen.queryByLabelText("İfade")).toBeNull();
  });
});
