/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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
  SupportedEditorType,
} from "@/contracts/admin/exercise-editor";
import {
  validFlashcardDetailResponse,
  validNumericInputDetailResponse,
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
const numericDetail = {
  ...validNumericInputDetailResponse.data,
  id: 106,
} as ExerciseDetail;
const flashcardDetail = {
  ...validFlashcardDetailResponse.data,
  id: 107,
} as ExerciseDetail;

const list: UnitExercisesData = {
  unit: { id: 11, title: unit.title },
  exercises: [
    {
      id: 106,
      type: "numeric_input",
      topic: { id: 1, name: "İlk Türk Devletleri" },
      difficulty: 3,
      status: "published",
      version: 2,
      scopes: ["tyt"],
      preview: "Sıfırıncı yıl hangisidir?",
      stats: numericDetail.stats,
    },
    {
      id: 107,
      type: "flashcard",
      topic: { id: 1, name: "İlk Türk Devletleri" },
      difficulty: 2,
      status: "draft",
      version: 1,
      scopes: ["tyt", "ayt"],
      preview: "Kut",
      stats: flashcardDetail.stats,
    },
  ],
};

function renderEditor(
  createType: SupportedEditorType,
  exerciseId?: number,
  canEdit = true,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ExerciseEditor
        canEdit={canEdit}
        courseId={1}
        createType={createType}
        exerciseId={exerciseId}
        unitId={11}
      />
    </QueryClientProvider>,
  );
}

function saveButton() {
  return screen.getByRole("button", { name: "Kaydet" }) as HTMLButtonElement;
}

beforeEach(() => {
  getCourses.mockReset().mockResolvedValue([course]);
  getCourseUnits.mockReset().mockResolvedValue([unit]);
  getCourseTopics.mockReset().mockResolvedValue(topics);
  getUnitExercises.mockReset().mockResolvedValue(list);
  getExerciseDetail.mockReset().mockResolvedValue(numericDetail);
  createExercise.mockReset().mockResolvedValue({ id: 555, status: "draft" });
  updateExercise.mockReset().mockResolvedValue({
    id: 106,
    version: 3,
    answer_key_changed: true,
    warning: "Cevap anahtarı değişti; geçmiş istatistikleri kontrol edin.",
  });
  replace.mockReset();
  refresh.mockReset();
});

describe("numeric input create editor", () => {
  async function fillCommon(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole("heading", { name: "Yeni sayısal cevap sorusu" });
    await user.selectOptions(screen.getByLabelText("Konu"), "1");
    await user.type(screen.getByLabelText("Soru kökü"), "Kaç yılında?");
  }

  it("renders the shared common fields plus the numeric fields", async () => {
    renderEditor("numeric_input");
    await screen.findByRole("heading", { name: "Yeni sayısal cevap sorusu" });

    expect(screen.getByLabelText("Konu")).toBeDefined();
    expect(screen.getByLabelText("Zorluk")).toBeDefined();
    expect(screen.getByLabelText("TYT")).toBeDefined();
    expect(screen.getByLabelText("Açıklama")).toBeDefined();
    expect(screen.getByText("Tip: Sayısal cevap")).toBeDefined();

    expect(screen.getByLabelText("Soru kökü")).toBeDefined();
    expect(
      (screen.getByLabelText("Doğru sayı") as HTMLInputElement).value,
    ).toBe("");
    expect((screen.getByLabelText("Tolerans") as HTMLInputElement).value).toBe(
      "0",
    );
    expect(screen.getByLabelText("Birim / son ek (opsiyonel)")).toBeDefined();
    expect(screen.getByText(/0 tam eşleşme ister/)).toBeDefined();

    // Other editors' fields stay out.
    expect(screen.queryByLabelText("İfade")).toBeNull();
    expect(screen.queryByLabelText("Ön yüz")).toBeNull();
  });

  it("treats 0 as a real answer and sends it as the JSON number 0", async () => {
    const user = userEvent.setup();
    renderEditor("numeric_input");
    await fillCommon(user);

    // Save stays blocked while the answer is simply absent.
    expect(saveButton().disabled).toBe(true);

    await user.type(screen.getByLabelText("Doğru sayı"), "0");
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    await user.click(saveButton());

    await waitFor(() => expect(createExercise).toHaveBeenCalledTimes(1));
    const body = createExercise.mock.calls[0]?.[0];
    expect(body).toEqual({
      type: "numeric_input",
      topic_id: 1,
      owner_unit_id: 11,
      difficulty: 3,
      content: { stem: "Kaç yılında?" },
      answer_key: { value: 0, tolerance: 0 },
      explanation: null,
      applicable_scopes: ["tyt"],
    });
    expect(typeof body.answer_key.value).toBe("number");
    expect(JSON.stringify(body)).toContain('"value":0');
    expect(replace).toHaveBeenCalledWith("/courses/1/units/11/exercises/555");
  });

  it("accepts a negative decimal answer and a suffix", async () => {
    const user = userEvent.setup();
    renderEditor("numeric_input");
    await fillCommon(user);

    await user.type(screen.getByLabelText("Doğru sayı"), "-2.5");
    await user.type(screen.getByLabelText("Tolerans"), ".01");
    await user.type(
      screen.getByLabelText("Birim / son ek (opsiyonel)"),
      "derece",
    );
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    await user.click(saveButton());

    await waitFor(() => expect(createExercise).toHaveBeenCalledTimes(1));
    expect(createExercise.mock.calls[0]?.[0]).toMatchObject({
      content: { stem: "Kaç yılında?", suffix: "derece" },
      answer_key: { value: -2.5, tolerance: 0.01 },
    });
  });

  it("blocks save when the answer is cleared, never sending NaN", async () => {
    const user = userEvent.setup();
    renderEditor("numeric_input");
    await fillCommon(user);

    await user.type(screen.getByLabelText("Doğru sayı"), "5");
    await waitFor(() => expect(saveButton().disabled).toBe(false));

    await user.clear(screen.getByLabelText("Doğru sayı"));
    await waitFor(() => expect(saveButton().disabled).toBe(true));
    expect(createExercise).not.toHaveBeenCalled();
  });

  it("blocks save on a negative tolerance", async () => {
    const user = userEvent.setup();
    renderEditor("numeric_input");
    await fillCommon(user);

    await user.type(screen.getByLabelText("Doğru sayı"), "5");
    await user.clear(screen.getByLabelText("Tolerans"));
    await user.type(screen.getByLabelText("Tolerans"), "-1");

    await waitFor(() => expect(saveButton().disabled).toBe(true));
    expect(await screen.findByText("Tolerans negatif olamaz.")).toBeDefined();
  });

  it("shows the stem, answer, suffix and tolerance in the live preview", async () => {
    const user = userEvent.setup();
    renderEditor("numeric_input");
    await fillCommon(user);
    const preview = screen.getByLabelText("Canlı önizleme");

    expect(preview.textContent).toContain("Kaç yılında?");
    await user.type(screen.getByLabelText("Doğru sayı"), "0");
    await waitFor(() => expect(preview.textContent).toContain("0"));
    await user.type(
      screen.getByLabelText("Birim / son ek (opsiyonel)"),
      "yılı",
    );
    await waitFor(() => expect(preview.textContent).toContain("yılı"));
    expect(preview.textContent).toContain("Tolerans: ±0");
  });

  it("routes Ctrl+S through the same numeric serializer", async () => {
    const user = userEvent.setup();
    renderEditor("numeric_input");
    await fillCommon(user);
    await user.type(screen.getByLabelText("Doğru sayı"), "375");
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
      type: "numeric_input",
      answer_key: { value: 375, tolerance: 0 },
    });
  });

  it("Save & New keeps the context and resets the answer to empty", async () => {
    const user = userEvent.setup();
    renderEditor("numeric_input");
    await fillCommon(user);
    await user.selectOptions(screen.getByLabelText("Zorluk"), "5");
    await user.type(screen.getByLabelText("Doğru sayı"), "375");
    await user.type(
      screen.getByLabelText("Birim / son ek (opsiyonel)"),
      "yılı",
    );
    await waitFor(() => expect(saveButton().disabled).toBe(false));

    await user.click(screen.getByRole("button", { name: "Kaydet ve Yeni" }));

    expect(
      await screen.findByText("Kaydedildi. Yeni soru hazır."),
    ).toBeDefined();
    expect(screen.getByText("Tip: Sayısal cevap")).toBeDefined();
    expect((screen.getByLabelText("Konu") as HTMLSelectElement).value).toBe(
      "1",
    );
    expect((screen.getByLabelText("Zorluk") as HTMLSelectElement).value).toBe(
      "5",
    );
    expect(
      (screen.getByLabelText("Soru kökü") as HTMLTextAreaElement).value,
    ).toBe("");
    expect(
      (screen.getByLabelText("Doğru sayı") as HTMLInputElement).value,
    ).toBe("");
    expect((screen.getByLabelText("Tolerans") as HTMLInputElement).value).toBe(
      "0",
    );
    expect(
      (screen.getByLabelText("Birim / son ek (opsiyonel)") as HTMLInputElement)
        .value,
    ).toBe("");
    expect(replace).not.toHaveBeenCalled();
  });

  it("renders the page guard instead of a form when edit_content is false", async () => {
    renderEditor("numeric_input", undefined, false);
    expect(await screen.findByText("Düzenleme yetkiniz yok.")).toBeDefined();
    expect(screen.queryByLabelText("Doğru sayı")).toBeNull();
  });

  it("submits natively with POST from the one shared editor form", async () => {
    renderEditor("numeric_input");
    await screen.findByRole("heading", { name: "Yeni sayısal cevap sorusu" });

    const form = screen.getByLabelText("Doğru sayı").closest("form");
    expect(form).not.toBeNull();
    expect(form!.getAttribute("method")).toBe("post");
    expect(document.querySelectorAll("form")).toHaveLength(1);
  });
});

describe("numeric input edit editor", () => {
  it("hydrates a stored zero answer and zero tolerance", async () => {
    renderEditor("numeric_input", 106);
    await screen.findByRole("heading", {
      name: "Sayısal cevap sorusunu düzenle",
    });

    expect(
      (screen.getByLabelText("Doğru sayı") as HTMLInputElement).value,
    ).toBe("0");
    expect((screen.getByLabelText("Tolerans") as HTMLInputElement).value).toBe(
      "0",
    );
    expect(
      (screen.getByLabelText("Birim / son ek (opsiyonel)") as HTMLInputElement)
        .value,
    ).toBe("yılı");
    expect(screen.getByText("v2")).toBeDefined();
  });

  it("saves a changed answer and shows the version and warning", async () => {
    const user = userEvent.setup();
    renderEditor("numeric_input", 106);
    await screen.findByRole("heading", {
      name: "Sayısal cevap sorusunu düzenle",
    });

    await user.clear(screen.getByLabelText("Doğru sayı"));
    await user.type(screen.getByLabelText("Doğru sayı"), "0.33");
    await user.clear(screen.getByLabelText("Tolerans"));
    await user.type(screen.getByLabelText("Tolerans"), "0.01");
    await user.click(saveButton());

    await waitFor(() => expect(updateExercise).toHaveBeenCalledTimes(1));
    const [id, body] = updateExercise.mock.calls[0]!;
    expect(id).toBe(106);
    expect(body.answer_key).toEqual({ value: 0.33, tolerance: 0.01 });
    expect(body).not.toHaveProperty("owner_unit_id");
    expect(body).not.toHaveProperty("status");
    expect(body).not.toHaveProperty("version");

    expect(await screen.findByText("v3")).toBeDefined();
    expect(await screen.findByText(/Cevap anahtarı değişti/)).toBeDefined();
  });

  it("offers no type conversion control", async () => {
    renderEditor("numeric_input", 106);
    await screen.findByRole("heading", {
      name: "Sayısal cevap sorusunu düzenle",
    });
    expect(screen.queryByLabelText("Soru tipi")).toBeNull();
    expect(screen.queryByLabelText("Ön yüz")).toBeNull();
  });
});

describe("flashcard editor", () => {
  it("renders only the two faces beside the shared common fields", async () => {
    renderEditor("flashcard");
    await screen.findByRole("heading", { name: "Yeni bilgi kartı" });

    expect(screen.getByLabelText("Ön yüz")).toBeDefined();
    expect(screen.getByLabelText("Arka yüz")).toBeDefined();
    expect(screen.getByLabelText("Konu")).toBeDefined();
    expect(screen.getByText("Tip: Bilgi kartı")).toBeDefined();

    // self_assessed is editor metadata, never an author-facing control.
    expect(screen.queryByLabelText(/kendi değerlendir/i)).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /self/i })).toBeNull();
    expect(screen.queryByLabelText("Doğru sayı")).toBeNull();
  });

  it("creates a card with the canonical answer key", async () => {
    const user = userEvent.setup();
    renderEditor("flashcard");
    await screen.findByRole("heading", { name: "Yeni bilgi kartı" });

    await user.selectOptions(screen.getByLabelText("Konu"), "1");
    expect(saveButton().disabled).toBe(true);

    await user.type(screen.getByLabelText("Ön yüz"), "Kut");
    await user.type(screen.getByLabelText("Arka yüz"), "Yönetme yetkisi.");
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    await user.click(saveButton());

    await waitFor(() => expect(createExercise).toHaveBeenCalledTimes(1));
    expect(createExercise.mock.calls[0]?.[0]).toEqual({
      type: "flashcard",
      topic_id: 1,
      owner_unit_id: 11,
      difficulty: 3,
      content: { front: "Kut", back: "Yönetme yetkisi." },
      answer_key: { self_assessed: true },
      explanation: null,
      applicable_scopes: ["tyt"],
    });
    expect(replace).toHaveBeenCalledWith("/courses/1/units/11/exercises/555");
  });

  it("shows both faces in the live preview", async () => {
    const user = userEvent.setup();
    renderEditor("flashcard");
    await screen.findByRole("heading", { name: "Yeni bilgi kartı" });
    const preview = screen.getByLabelText("Canlı önizleme");

    await user.type(screen.getByLabelText("Ön yüz"), "Kut");
    await user.type(screen.getByLabelText("Arka yüz"), "Tanım metni");

    await waitFor(() => expect(preview.textContent).toContain("Kut"));
    expect(preview.textContent).toContain("Tanım metni");
    expect(preview.textContent).toContain("Ön yüz");
    expect(preview.textContent).toContain("Arka yüz");
  });

  it("Save & New keeps the context and clears both faces", async () => {
    const user = userEvent.setup();
    renderEditor("flashcard");
    await screen.findByRole("heading", { name: "Yeni bilgi kartı" });

    await user.selectOptions(screen.getByLabelText("Konu"), "1");
    await user.selectOptions(screen.getByLabelText("Zorluk"), "4");
    await user.type(screen.getByLabelText("Ön yüz"), "Kut");
    await user.type(screen.getByLabelText("Arka yüz"), "Tanım");
    await waitFor(() => expect(saveButton().disabled).toBe(false));

    await user.click(screen.getByRole("button", { name: "Kaydet ve Yeni" }));

    expect(
      await screen.findByText("Kaydedildi. Yeni soru hazır."),
    ).toBeDefined();
    expect(screen.getByText("Tip: Bilgi kartı")).toBeDefined();
    expect((screen.getByLabelText("Konu") as HTMLSelectElement).value).toBe(
      "1",
    );
    expect((screen.getByLabelText("Zorluk") as HTMLSelectElement).value).toBe(
      "4",
    );
    expect((screen.getByLabelText("Ön yüz") as HTMLTextAreaElement).value).toBe(
      "",
    );
    expect(
      (screen.getByLabelText("Arka yüz") as HTMLTextAreaElement).value,
    ).toBe("");
  });

  it("hydrates and updates a stored card without a self_assessed control", async () => {
    const user = userEvent.setup();
    getExerciseDetail.mockResolvedValue(flashcardDetail);
    updateExercise.mockResolvedValue({ id: 107, version: 2 });
    renderEditor("flashcard", 107);
    await screen.findByRole("heading", { name: "Bilgi kartını düzenle" });

    expect((screen.getByLabelText("Ön yüz") as HTMLTextAreaElement).value).toBe(
      "Kut",
    );
    expect(
      (screen.getByLabelText("Arka yüz") as HTMLTextAreaElement).value,
    ).toContain("Yönetme yetkisinin");
    expect(screen.getByText("v1")).toBeDefined();
    expect(screen.getByText("Taslak")).toBeDefined();

    await user.type(screen.getByLabelText("Ön yüz"), " (kavram)");
    await user.click(saveButton());

    await waitFor(() => expect(updateExercise).toHaveBeenCalledTimes(1));
    const [id, body] = updateExercise.mock.calls[0]!;
    expect(id).toBe(107);
    expect(body.content.front).toBe("Kut (kavram)");
    expect(body.answer_key).toEqual({ self_assessed: true });
    expect(await screen.findByText("v2")).toBeDefined();
  });

  it("opens a stored card whose answer key has no self_assessed", async () => {
    getExerciseDetail.mockResolvedValue({
      ...flashcardDetail,
      answer_key: {},
    } as ExerciseDetail);
    renderEditor("flashcard", 107);
    await screen.findByRole("heading", { name: "Bilgi kartını düzenle" });

    expect((screen.getByLabelText("Ön yüz") as HTMLTextAreaElement).value).toBe(
      "Kut",
    );
  });
});
