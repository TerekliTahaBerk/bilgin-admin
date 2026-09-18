/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  validTopicsResponse,
  validTrueFalseDetailResponse,
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
  ...validTrueFalseDetailResponse.data,
  id: 102,
} as ExerciseDetail;
const list: UnitExercisesData = {
  unit: { id: 11, title: unit.title },
  exercises: [
    {
      id: 102,
      type: "true_false",
      topic: { id: 1, name: "İlk Türk Devletleri" },
      difficulty: 4,
      status: "published",
      version: 2,
      scopes: ["tyt"],
      preview: detail.content.statement as string,
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
        createType="true_false"
        exerciseId={exerciseId}
        unitId={11}
      />
    </QueryClientProvider>,
  );
}

const STATEMENT = "Uygurlar yerleşik hayata geçmiştir.";

async function fillValidCreate(
  user: ReturnType<typeof userEvent.setup>,
  answer: "Doğru" | "Yanlış" = "Yanlış",
) {
  await screen.findByRole("heading", { name: "Yeni doğru / yanlış sorusu" });
  await user.selectOptions(screen.getByLabelText("Konu"), "1");
  await user.type(screen.getByLabelText("İfade"), STATEMENT);
  await user.click(screen.getByLabelText(answer));
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
  createExercise.mockReset().mockResolvedValue({ id: 321, status: "draft" });
  updateExercise.mockReset().mockResolvedValue({
    id: 102,
    version: 3,
    answer_key_changed: true,
    warning: "Cevap anahtarı değişti; geçmiş istatistikleri kontrol edin.",
  });
  replace.mockReset();
  refresh.mockReset();
});

describe("true/false create editor", () => {
  it("renders the shared common fields with a statement and two answer radios", async () => {
    renderEditor();
    await screen.findByRole("heading", { name: "Yeni doğru / yanlış sorusu" });

    expect(screen.getByLabelText("Konu")).toBeDefined();
    expect(screen.getByLabelText("Zorluk")).toBeDefined();
    expect(screen.getByLabelText("TYT")).toBeDefined();
    expect(screen.getByLabelText("Açıklama")).toBeDefined();
    expect(screen.getByLabelText("İfade")).toBeDefined();
    expect(screen.getByText("Tip: Doğru / Yanlış")).toBeDefined();

    const yes = screen.getByLabelText("Doğru") as HTMLInputElement;
    const no = screen.getByLabelText("Yanlış") as HTMLInputElement;
    expect(yes.type).toBe("radio");
    expect(no.type).toBe("radio");
    // No answer may be preselected: a default would be a silent wrong key.
    expect(yes.checked).toBe(false);
    expect(no.checked).toBe(false);

    // Multiple choice fields belong to the other editor only.
    expect(screen.queryByLabelText("Soru kökü")).toBeNull();
    expect(screen.queryByLabelText("a şıkkı metni")).toBeNull();
  });

  it("shows the statement and the chosen answer in the live preview", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByRole("heading", { name: "Yeni doğru / yanlış sorusu" });

    const preview = screen.getByLabelText("Canlı önizleme");
    expect(preview.textContent).toContain("Seçilmedi");

    await user.type(screen.getByLabelText("İfade"), STATEMENT);
    expect(preview.textContent).toContain(STATEMENT);

    await user.click(screen.getByLabelText("Yanlış"));
    expect(preview.textContent).toContain("Yanlış");
    expect(preview.textContent).not.toContain("Seçilmedi");
  });

  it("keeps save disabled until a statement and an answer exist", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByRole("heading", { name: "Yeni doğru / yanlış sorusu" });
    const save = () =>
      screen.getByRole("button", { name: "Kaydet" }) as HTMLButtonElement;

    expect(save().disabled).toBe(true);

    await user.selectOptions(screen.getByLabelText("Konu"), "1");
    await user.type(screen.getByLabelText("İfade"), STATEMENT);
    // A statement alone is not enough while the answer is still unselected.
    expect(save().disabled).toBe(true);

    await user.click(screen.getByLabelText("Yanlış"));
    await waitFor(() => expect(save().disabled).toBe(false));
  });

  it("sends a real JSON boolean false and routes to the returned draft", async () => {
    const user = userEvent.setup();
    renderEditor();
    await fillValidCreate(user, "Yanlış");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(createExercise).toHaveBeenCalledTimes(1));
    const body = createExercise.mock.calls[0]?.[0];
    expect(body).toEqual({
      type: "true_false",
      topic_id: 1,
      owner_unit_id: 11,
      difficulty: 3,
      content: { statement: STATEMENT },
      answer_key: { value: false },
      explanation: null,
      applicable_scopes: ["tyt"],
    });
    expect(typeof body.answer_key.value).toBe("boolean");
    expect(JSON.stringify(body)).toContain('"value":false');
    expect(replace).toHaveBeenCalledWith("/courses/1/units/11/exercises/321");
  });

  it("sends a real JSON boolean true when Doğru is chosen", async () => {
    const user = userEvent.setup();
    renderEditor();
    await fillValidCreate(user, "Doğru");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(createExercise).toHaveBeenCalledTimes(1));
    expect(createExercise.mock.calls[0]?.[0].answer_key).toEqual({
      value: true,
    });
  });

  it("routes Ctrl+S through the same true/false serializer", async () => {
    const user = userEvent.setup();
    renderEditor();
    await fillValidCreate(user, "Yanlış");

    const event = new KeyboardEvent("keydown", {
      key: "s",
      ctrlKey: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(createExercise).toHaveBeenCalledTimes(1));
    expect(createExercise.mock.calls[0]?.[0]).toMatchObject({
      type: "true_false",
      answer_key: { value: false },
    });
  });

  it("Save & New keeps the shared context and the type but clears the answer", async () => {
    const user = userEvent.setup();
    renderEditor();
    await fillValidCreate(user, "Doğru");
    await user.selectOptions(screen.getByLabelText("Zorluk"), "5");
    await user.type(screen.getByLabelText("Açıklama"), "Açıklama metni");
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
    expect(screen.getByText("Tip: Doğru / Yanlış")).toBeDefined();
    expect((screen.getByLabelText("İfade") as HTMLTextAreaElement).value).toBe(
      "",
    );
    expect(
      (screen.getByLabelText("Açıklama") as HTMLTextAreaElement).value,
    ).toBe("");
    expect((screen.getByLabelText("Doğru") as HTMLInputElement).checked).toBe(
      false,
    );
    expect((screen.getByLabelText("Yanlış") as HTMLInputElement).checked).toBe(
      false,
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("Ctrl+Shift+Enter saves and prepares the next true/false question", async () => {
    const user = userEvent.setup();
    renderEditor();
    await fillValidCreate(user, "Yanlış");
    fireEvent.keyDown(window, { key: "Enter", shiftKey: true, ctrlKey: true });

    expect(
      await screen.findByText("Kaydedildi. Yeni soru hazır."),
    ).toBeDefined();
    expect(createExercise).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText("Yanlış") as HTMLInputElement).checked).toBe(
      false,
    );
  });

  it("renders the page guard instead of a form when edit_content is false", async () => {
    renderEditor(undefined, false);
    expect(await screen.findByText("Düzenleme yetkiniz yok.")).toBeDefined();
    expect(screen.queryByLabelText("İfade")).toBeNull();
    expect(screen.queryByRole("button", { name: "Kaydet" })).toBeNull();
  });

  it("submits natively with POST from the one shared editor form", async () => {
    renderEditor();
    await screen.findByRole("heading", { name: "Yeni doğru / yanlış sorusu" });

    const statement = screen.getByLabelText("İfade") as HTMLTextAreaElement;
    const form = statement.closest("form");

    expect(form).not.toBeNull();
    expect(form!.getAttribute("method")).toBe("post");
    expect(document.querySelectorAll("form")).toHaveLength(1);
  });
});

describe("true/false edit editor", () => {
  it("selects Yanlış for a stored false answer instead of losing the falsy value", async () => {
    renderEditor(102);
    await screen.findByRole("heading", {
      name: "Doğru / yanlış sorusunu düzenle",
    });

    expect((screen.getByLabelText("İfade") as HTMLTextAreaElement).value).toBe(
      detail.content.statement,
    );
    expect((screen.getByLabelText("Yanlış") as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByLabelText("Doğru") as HTMLInputElement).checked).toBe(
      false,
    );
    expect(screen.getByText("v2")).toBeDefined();
  });

  it("selects Doğru for a stored true answer", async () => {
    getExerciseDetail.mockResolvedValue({
      ...detail,
      answer_key: { value: true },
    } as ExerciseDetail);
    renderEditor(102);
    await screen.findByRole("heading", {
      name: "Doğru / yanlış sorusunu düzenle",
    });

    expect((screen.getByLabelText("Doğru") as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByLabelText("Yanlış") as HTMLInputElement).checked).toBe(
      false,
    );
  });

  it("saves an unchanged false answer back as boolean false", async () => {
    const user = userEvent.setup();
    renderEditor(102);
    await screen.findByRole("heading", {
      name: "Doğru / yanlış sorusunu düzenle",
    });

    // Touch only the statement: the answer must survive the round trip.
    await user.type(screen.getByLabelText("İfade"), " Güncellendi.");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(updateExercise).toHaveBeenCalledTimes(1));
    const [id, body] = updateExercise.mock.calls[0]!;
    expect(id).toBe(102);
    expect(body.answer_key).toEqual({ value: false });
    expect(typeof body.answer_key.value).toBe("boolean");
    expect(body.content.statement).toBe(
      `${detail.content.statement as string} Güncellendi.`,
    );
    expect(body).not.toHaveProperty("owner_unit_id");
    expect(body).not.toHaveProperty("status");
    expect(body).not.toHaveProperty("version");
  });

  it("flips the answer, shows the new version and the backend warning", async () => {
    const user = userEvent.setup();
    renderEditor(102);
    await screen.findByRole("heading", {
      name: "Doğru / yanlış sorusunu düzenle",
    });

    await user.click(screen.getByLabelText("Doğru"));
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(updateExercise).toHaveBeenCalledTimes(1));
    expect(updateExercise.mock.calls[0]?.[1].answer_key).toEqual({
      value: true,
    });
    expect(await screen.findByText("v3")).toBeDefined();
    expect(await screen.findByText(/Cevap anahtarı değişti/)).toBeDefined();
    expect(screen.getByText("Kaydedildi")).toBeDefined();
  });

  it("offers no type conversion control on an existing question", async () => {
    renderEditor(102);
    await screen.findByRole("heading", {
      name: "Doğru / yanlış sorusunu düzenle",
    });

    expect(screen.queryByLabelText("Tip")).toBeNull();
    expect(screen.queryByLabelText("Soru tipi")).toBeNull();
    expect(screen.queryByLabelText("Soru kökü")).toBeNull();
    expect(screen.queryByRole("link", { name: /çoktan seçmeli/i })).toBeNull();
  });

  it("Save & New from edit mode returns to the true/false create route", async () => {
    const user = userEvent.setup();
    renderEditor(102);
    await screen.findByRole("heading", {
      name: "Doğru / yanlış sorusunu düzenle",
    });

    await user.type(screen.getByLabelText("İfade"), " Güncellendi.");
    await user.click(screen.getByRole("button", { name: "Kaydet ve Yeni" }));

    await waitFor(() => expect(updateExercise).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith(
      "/courses/1/units/11/exercises/new?type=true_false",
    );
  });
});
