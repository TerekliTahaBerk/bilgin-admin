/** @vitest-environment jsdom */
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
import type {
  CourseTopicsData,
  ExerciseDetail,
} from "@/contracts/admin/exercise-editor";
import {
  validMatchingDetailResponse,
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
  ...validMatchingDetailResponse.data,
  id: 106,
} as ExerciseDetail;

const list: UnitExercisesData = {
  unit: { id: 11, title: unit.title },
  exercises: [
    {
      id: 106,
      type: "matching",
      topic: { id: 1, name: "İlk Türk Devletleri" },
      difficulty: 4,
      status: "draft",
      version: 2,
      scopes: ["ayt"],
      preview: "Kavramı karşılığıyla eşleştir.",
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
        createType="matching"
        exerciseId={exerciseId}
        unitId={11}
      />
    </QueryClientProvider>,
  );
}

function saveButton() {
  return screen.getByRole("button", { name: "Kaydet" }) as HTMLButtonElement;
}

function pairSelect(label: string) {
  return screen.getByLabelText(
    `${label} için eşleşen sağ öğe`,
  ) as HTMLSelectElement;
}

beforeEach(() => {
  getCourses.mockReset().mockResolvedValue([course]);
  getCourseUnits.mockReset().mockResolvedValue([unit]);
  getCourseTopics.mockReset().mockResolvedValue(topics);
  getUnitExercises.mockReset().mockResolvedValue(list);
  getExerciseDetail.mockReset().mockResolvedValue(detail);
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

describe("matching create editor", () => {
  async function fillComplete(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole("heading", { name: "Yeni eşleştirme sorusu" });
    await user.selectOptions(screen.getByLabelText("Konu"), "1");
    await user.type(screen.getByLabelText("Sol öğe 1 metni"), "Kurultay");
    await user.type(screen.getByLabelText("Sol öğe 2 metni"), "Kut");
    await user.type(screen.getByLabelText("Sağ öğe 1 metni"), "Meclis");
    await user.type(screen.getByLabelText("Sağ öğe 2 metni"), "Yetki");
    await user.selectOptions(pairSelect("Kurultay"), "a");
    await user.selectOptions(pairSelect("Kut"), "b");
  }

  it("starts with two left rows, two right rows and no selection", async () => {
    renderEditor();
    await screen.findByRole("heading", { name: "Yeni eşleştirme sorusu" });

    expect(screen.getByLabelText("Sol öğe 1 metni")).toBeDefined();
    expect(screen.getByLabelText("Sol öğe 2 metni")).toBeDefined();
    expect(screen.getByLabelText("Sağ öğe 1 metni")).toBeDefined();
    expect(screen.getByLabelText("Sağ öğe 2 metni")).toBeDefined();
    expect(pairSelect("Sol öğe 1").value).toBe("");
    expect(pairSelect("Sol öğe 2").value).toBe("");
    expect(
      (screen.getByLabelText("Kısmi puan ver") as HTMLInputElement).checked,
    ).toBe(false);
    expect(saveButton().disabled).toBe(true);
  });

  it("cannot drop below two rows in either column", async () => {
    renderEditor();
    await screen.findByRole("heading", { name: "Yeni eşleştirme sorusu" });

    expect(
      (
        screen.getByRole("button", {
          name: "Sol öğe 1 sol öğesini kaldır",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Sağ öğe 1 sağ öğesini kaldır",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("adds a left row with a fresh id and no selection", async () => {
    const user = userEvent.setup();
    renderEditor();
    await fillComplete(user);
    await waitFor(() => expect(saveButton().disabled).toBe(false));

    await user.click(screen.getByRole("button", { name: "Sol öğe ekle" }));

    expect(screen.getByLabelText("Sol öğe 3 metni")).toBeDefined();
    expect(pairSelect("Sol öğe 3").value).toBe("");
    // An unfinished row blocks the save rather than inventing an answer.
    await waitFor(() => expect(saveButton().disabled).toBe(true));
  });

  it("removes only the deleted left row's pair and keeps the other ids", async () => {
    const user = userEvent.setup();
    renderEditor();
    await fillComplete(user);
    await user.click(screen.getByRole("button", { name: "Sol öğe ekle" }));
    await user.type(screen.getByLabelText("Sol öğe 3 metni"), "Töre");
    await user.selectOptions(pairSelect("Töre"), "a");
    await waitFor(() => expect(saveButton().disabled).toBe(false));

    await user.click(
      screen.getByRole("button", { name: "Kut sol öğesini kaldır" }),
    );
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    await user.click(saveButton());

    await waitFor(() => expect(createExercise).toHaveBeenCalledTimes(1));
    const body = createExercise.mock.calls[0]?.[0];
    // "2" is gone; "1" and "3" keep the ids they were issued.
    expect(body.content.left).toEqual([
      { id: "1", text: "Kurultay" },
      { id: "3", text: "Töre" },
    ]);
    expect(body.answer_key.pairs).toEqual({ "1": "a", "3": "a" });
  });

  it("clears a pair whose right item is removed instead of re-pointing it", async () => {
    const user = userEvent.setup();
    renderEditor();
    await fillComplete(user);
    // Removal is blocked at two rows, so the column needs a third first.
    await user.click(screen.getByRole("button", { name: "Sağ öğe ekle" }));
    await user.type(screen.getByLabelText("Sağ öğe 3 metni"), "Töre");
    await waitFor(() => expect(saveButton().disabled).toBe(false));

    await user.click(
      screen.getByRole("button", { name: "Meclis sağ öğesini kaldır" }),
    );

    await waitFor(() => expect(pairSelect("Kurultay").value).toBe(""));
    expect(pairSelect("Kut").value).toBe("b");
    expect(saveButton().disabled).toBe(true);
  });

  it("keeps ids and pairs when item text changes", async () => {
    const user = userEvent.setup();
    renderEditor();
    await fillComplete(user);
    await waitFor(() => expect(saveButton().disabled).toBe(false));

    await user.clear(screen.getByLabelText("Sol öğe 1 metni"));
    await user.type(screen.getByLabelText("Sol öğe 1 metni"), "Toy");
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    await user.click(saveButton());

    await waitFor(() => expect(createExercise).toHaveBeenCalledTimes(1));
    const body = createExercise.mock.calls[0]?.[0];
    expect(body.content.left[0]).toEqual({ id: "1", text: "Toy" });
    expect(body.answer_key.pairs).toEqual({ "1": "a", "2": "b" });
  });

  it("allows the same right item for two left rows", async () => {
    const user = userEvent.setup();
    renderEditor();
    await fillComplete(user);
    await user.selectOptions(pairSelect("Kut"), "a");

    await waitFor(() => expect(saveButton().disabled).toBe(false));
    await user.click(saveButton());

    await waitFor(() => expect(createExercise).toHaveBeenCalledTimes(1));
    expect(createExercise.mock.calls[0]?.[0].answer_key.pairs).toEqual({
      "1": "a",
      "2": "a",
    });
  });

  it("previews both columns, the correct mapping and the partial-credit setting", async () => {
    const user = userEvent.setup();
    renderEditor();
    await fillComplete(user);

    const preview = within(screen.getByLabelText("Canlı önizleme"));
    expect(preview.getByText("Kurultay → Meclis")).toBeDefined();
    expect(preview.getByText("Kut → Yetki")).toBeDefined();
    expect(preview.getByText("Kısmi puan: Kapalı")).toBeDefined();

    await user.click(screen.getByLabelText("Kısmi puan ver"));
    await waitFor(() =>
      expect(preview.getByText("Kısmi puan: Açık")).toBeDefined(),
    );
  });

  it("sends the canonical create body with an explicit partial_credit", async () => {
    const user = userEvent.setup();
    renderEditor();
    await fillComplete(user);
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    await user.click(saveButton());

    await waitFor(() => expect(createExercise).toHaveBeenCalledTimes(1));
    const body = createExercise.mock.calls[0]?.[0];
    expect(body).toEqual({
      type: "matching",
      topic_id: 1,
      owner_unit_id: 11,
      difficulty: 3,
      content: {
        left: [
          { id: "1", text: "Kurultay" },
          { id: "2", text: "Kut" },
        ],
        right: [
          { id: "a", text: "Meclis" },
          { id: "b", text: "Yetki" },
        ],
      },
      answer_key: { pairs: { "1": "a", "2": "b" }, partial_credit: false },
      explanation: null,
      applicable_scopes: ["tyt"],
    });
    expect(typeof body.answer_key.partial_credit).toBe("boolean");
    expect(replace).toHaveBeenCalledWith("/courses/1/units/11/exercises/555");
  });

  it("resets to fresh rows on Save & New while keeping the shared context", async () => {
    const user = userEvent.setup();
    renderEditor();
    await fillComplete(user);
    await user.click(screen.getByLabelText("Kısmi puan ver"));
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    await user.click(screen.getByRole("button", { name: "Kaydet ve Yeni" }));

    await waitFor(() =>
      expect(screen.getByText("Kaydedildi. Yeni soru hazır.")).toBeDefined(),
    );
    expect(
      (screen.getByLabelText("Sol öğe 1 metni") as HTMLInputElement).value,
    ).toBe("");
    expect(
      (screen.getByLabelText("Sağ öğe 1 metni") as HTMLInputElement).value,
    ).toBe("");
    expect(pairSelect("Sol öğe 1").value).toBe("");
    expect(
      (screen.getByLabelText("Kısmi puan ver") as HTMLInputElement).checked,
    ).toBe(false);
    // Shared context survives.
    expect((screen.getByLabelText("Konu") as HTMLSelectElement).value).toBe(
      "1",
    );
    expect(screen.getByText("Tip: Eşleştirme")).toBeDefined();
  });
});

describe("matching edit editor", () => {
  it("hydrates backend ids, pairs and partial credit exactly", async () => {
    renderEditor(106);
    await screen.findByRole("heading", {
      name: "Eşleştirme sorusunu düzenle",
    });

    expect(
      (screen.getByLabelText("Sol öğe 1 metni") as HTMLInputElement).value,
    ).toBe("Kurultay");
    expect(pairSelect("Kurultay").value).toBe("r1");
    expect(pairSelect("Kut").value).toBe("r2");
    expect(
      (screen.getByLabelText("Kısmi puan ver") as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Yönerge (opsiyonel)") as HTMLInputElement).value,
    ).toBe("Kavramı karşılığıyla eşleştir.");
    expect(saveButton().disabled).toBe(true);
  });

  it("keeps pairs when item text is edited", async () => {
    const user = userEvent.setup();
    renderEditor(106);
    await screen.findByRole("heading", {
      name: "Eşleştirme sorusunu düzenle",
    });

    await user.clear(screen.getByLabelText("Sol öğe 2 metni"));
    await user.type(screen.getByLabelText("Sol öğe 2 metni"), "Kut inancı");
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    await user.click(saveButton());

    await waitFor(() => expect(updateExercise).toHaveBeenCalledTimes(1));
    const [id, body] = updateExercise.mock.calls[0] ?? [];
    expect(id).toBe(106);
    expect(body.content.left).toEqual([
      { id: "l1", text: "Kurultay" },
      { id: "l2", text: "Kut inancı" },
    ]);
    expect(body.answer_key).toEqual({
      pairs: { l1: "r1", l2: "r2" },
      partial_credit: true,
    });
    expect(body).not.toHaveProperty("owner_unit_id");
  });

  it("clears the answer when the right item it used is removed", async () => {
    const user = userEvent.setup();
    renderEditor(106);
    await screen.findByRole("heading", {
      name: "Eşleştirme sorusunu düzenle",
    });

    await user.click(
      screen.getByRole("button", { name: "Devlet meclisi sağ öğesini kaldır" }),
    );

    await waitFor(() => expect(pairSelect("Kurultay").value).toBe(""));
    expect(pairSelect("Kut").value).toBe("r2");
    expect(saveButton().disabled).toBe(true);
  });

  it("surfaces the version bump and the answer-key warning after a mapping change", async () => {
    const user = userEvent.setup();
    renderEditor(106);
    await screen.findByRole("heading", {
      name: "Eşleştirme sorusunu düzenle",
    });

    await user.selectOptions(pairSelect("Kut"), "r3");
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    await user.click(saveButton());

    await waitFor(() => expect(updateExercise).toHaveBeenCalledTimes(1));
    expect(updateExercise.mock.calls[0]?.[1].answer_key.pairs).toEqual({
      l1: "r1",
      l2: "r3",
    });
    expect(
      await screen.findByText(
        "Cevap anahtarı değişti; geçmiş istatistikleri kontrol edin.",
      ),
    ).toBeDefined();
    expect(screen.getByText("v3")).toBeDefined();
  });

  it("makes no network request while the author edits", async () => {
    const user = userEvent.setup();
    renderEditor(106);
    await screen.findByRole("heading", {
      name: "Eşleştirme sorusunu düzenle",
    });

    await user.type(screen.getByLabelText("Sol öğe 1 metni"), "!");
    await user.selectOptions(pairSelect("Kut"), "r3");
    await user.click(screen.getByLabelText("Kısmi puan ver"));

    expect(createExercise).not.toHaveBeenCalled();
    expect(updateExercise).not.toHaveBeenCalled();
  });
});
