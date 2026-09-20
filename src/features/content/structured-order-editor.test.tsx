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
  SupportedEditorType,
} from "@/contracts/admin/exercise-editor";
import {
  validOrderingDetailResponse,
  validTopicsResponse,
  validWordOrderDetailResponse,
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
const orderingDetail = {
  ...validOrderingDetailResponse.data,
  id: 108,
} as ExerciseDetail;
const wordOrderDetail = {
  ...validWordOrderDetailResponse.data,
  id: 109,
} as ExerciseDetail;

const list: UnitExercisesData = {
  unit: { id: 11, title: unit.title },
  exercises: [
    {
      id: 108,
      type: "ordering",
      topic: { id: 1, name: "İlk Türk Devletleri" },
      difficulty: 3,
      status: "draft",
      version: 1,
      scopes: ["tyt"],
      preview: "Eskiden yeniye sırala.",
      stats: orderingDetail.stats,
    },
    {
      id: 109,
      type: "word_order",
      topic: { id: 1, name: "İlk Türk Devletleri" },
      difficulty: 2,
      status: "draft",
      version: 1,
      scopes: ["tyt"],
      preview: "Doğru cümleyi oluştur.",
      stats: wordOrderDetail.stats,
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

/** The rendered correct-order list, read as plain positional labels. */
function correctOrder(headingName: string): string[] {
  const section = screen.getByRole("region", { name: headingName });
  return within(section)
    .getAllByRole("listitem")
    .map((item) => item.textContent?.replace(/^\d+\./, "").trim() ?? "");
}

beforeEach(() => {
  getCourses.mockReset().mockResolvedValue([course]);
  getCourseUnits.mockReset().mockResolvedValue([unit]);
  getCourseTopics.mockReset().mockResolvedValue(topics);
  getUnitExercises.mockReset().mockResolvedValue(list);
  getExerciseDetail.mockReset().mockResolvedValue(orderingDetail);
  createExercise.mockReset().mockResolvedValue({ id: 555, status: "draft" });
  updateExercise.mockReset().mockResolvedValue({
    id: 108,
    version: 2,
    answer_key_changed: true,
    warning: "Cevap anahtarı değişti; geçmiş istatistikleri kontrol edin.",
  });
  replace.mockReset();
  refresh.mockReset();
});

describe("ordering create editor", () => {
  async function fillComplete(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole("heading", { name: "Yeni sıralama sorusu" });
    await user.selectOptions(screen.getByLabelText("Konu"), "1");
    await user.type(screen.getByLabelText("Yönerge"), "Eskiden yeniye sırala.");
    await user.type(screen.getByLabelText("Öğe 1 metni"), "Göktürkler");
    await user.type(screen.getByLabelText("Öğe 2 metni"), "Uygurlar");
  }

  it("starts with two blank rows and a structurally complete order", async () => {
    renderEditor("ordering");
    await screen.findByRole("heading", { name: "Yeni sıralama sorusu" });

    expect(screen.getByLabelText("Öğe 1 metni")).toBeDefined();
    expect(screen.getByLabelText("Öğe 2 metni")).toBeDefined();
    // Blank rows still get a safe positional label, never `undefined`.
    expect(correctOrder("Doğru sıra")).toEqual(["Öğe 1", "Öğe 2"]);
    expect(saveButton().disabled).toBe(true);
    // No partial-credit control: ordering's partial scoring is the backend's.
    expect(screen.queryByLabelText("Kısmi puan ver")).toBeNull();
  });

  it("cannot drop below two rows", async () => {
    renderEditor("ordering");
    await screen.findByRole("heading", { name: "Yeni sıralama sorusu" });

    expect(
      (
        screen.getByRole("button", {
          name: "Öğe 1 satırını kaldır",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("appends a new row to the correct order and removes it again with the row", async () => {
    const user = userEvent.setup();
    renderEditor("ordering");
    await fillComplete(user);

    await user.click(screen.getByRole("button", { name: "Öğe ekle" }));
    await user.type(screen.getByLabelText("Öğe 3 metni"), "Selçuklular");
    await waitFor(() =>
      expect(correctOrder("Doğru sıra")).toEqual([
        "Göktürkler",
        "Uygurlar",
        "Selçuklular",
      ]),
    );

    await user.click(
      screen.getByRole("button", { name: "Öğe 2 satırını kaldır" }),
    );
    await waitFor(() =>
      expect(correctOrder("Doğru sıra")).toEqual(["Göktürkler", "Selçuklular"]),
    );
  });

  it("reorders with the keyboard-reachable move buttons and keeps the row focused", async () => {
    const user = userEvent.setup();
    renderEditor("ordering");
    await fillComplete(user);

    await user.click(
      screen.getByRole("button", { name: "Uygurlar öğesini yukarı taşı" }),
    );
    await waitFor(() =>
      expect(correctOrder("Doğru sıra")).toEqual(["Uygurlar", "Göktürkler"]),
    );
    // "Uygurlar" is first now, so its "up" button is disabled — focus moves to
    // its own "down" button rather than disappearing.
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Uygurlar öğesini aşağı taşı" }),
    );

    await user.click(
      screen.getByRole("button", { name: "Uygurlar öğesini aşağı taşı" }),
    );
    await waitFor(() =>
      expect(correctOrder("Doğru sıra")).toEqual(["Göktürkler", "Uygurlar"]),
    );
  });

  it("reorders without any network request", async () => {
    const user = userEvent.setup();
    renderEditor("ordering");
    await fillComplete(user);
    await user.click(
      screen.getByRole("button", { name: "Uygurlar öğesini yukarı taşı" }),
    );

    expect(createExercise).not.toHaveBeenCalled();
    expect(updateExercise).not.toHaveBeenCalled();
  });

  it("keeps the correct-order label live as item text changes", async () => {
    const user = userEvent.setup();
    renderEditor("ordering");
    await fillComplete(user);

    await user.clear(screen.getByLabelText("Öğe 1 metni"));
    await user.type(screen.getByLabelText("Öğe 1 metni"), "Asya Hunları");
    await waitFor(() =>
      expect(correctOrder("Doğru sıra")).toEqual(["Asya Hunları", "Uygurlar"]),
    );
  });

  it("previews the instruction, the items and the correct sequence", async () => {
    const user = userEvent.setup();
    renderEditor("ordering");
    await fillComplete(user);
    await user.click(
      screen.getByRole("button", { name: "Uygurlar öğesini yukarı taşı" }),
    );

    const preview = within(screen.getByLabelText("Canlı önizleme"));
    expect(preview.getByText("Eskiden yeniye sırala.")).toBeDefined();
    expect(preview.getByText("1. Uygurlar")).toBeDefined();
    expect(preview.getByText("2. Göktürkler")).toBeDefined();
    expect(preview.getByText(/kısmi puan backend tarafından/i)).toBeDefined();
  });

  it("sends the canonical create body with content.items", async () => {
    const user = userEvent.setup();
    renderEditor("ordering");
    await fillComplete(user);
    await user.click(
      screen.getByRole("button", { name: "Uygurlar öğesini yukarı taşı" }),
    );
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    await user.click(saveButton());

    await waitFor(() => expect(createExercise).toHaveBeenCalledTimes(1));
    expect(createExercise.mock.calls[0]?.[0]).toEqual({
      type: "ordering",
      topic_id: 1,
      owner_unit_id: 11,
      difficulty: 3,
      content: {
        instruction: "Eskiden yeniye sırala.",
        // Reordering the answer never reorders or renumbers the content list.
        items: [
          { id: "1", text: "Göktürkler" },
          { id: "2", text: "Uygurlar" },
        ],
      },
      answer_key: { order: ["2", "1"] },
      explanation: null,
      applicable_scopes: ["tyt"],
    });
  });

  it("resets to fresh rows and a fresh order on Save & New", async () => {
    const user = userEvent.setup();
    renderEditor("ordering");
    await fillComplete(user);
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    await user.click(screen.getByRole("button", { name: "Kaydet ve Yeni" }));

    await waitFor(() =>
      expect(screen.getByText("Kaydedildi. Yeni soru hazır.")).toBeDefined(),
    );
    expect((screen.getByLabelText("Yönerge") as HTMLInputElement).value).toBe(
      "",
    );
    expect(
      (screen.getByLabelText("Öğe 1 metni") as HTMLInputElement).value,
    ).toBe("");
    expect(correctOrder("Doğru sıra")).toEqual(["Öğe 1", "Öğe 2"]);
    expect((screen.getByLabelText("Konu") as HTMLSelectElement).value).toBe(
      "1",
    );
  });
});

describe("ordering edit editor", () => {
  it("preserves arbitrary ids and an answer order that differs from the item list", async () => {
    renderEditor("ordering", 108);
    await screen.findByRole("heading", { name: "Sıralama sorusunu düzenle" });

    expect(
      (screen.getByLabelText("Öğe 1 metni") as HTMLInputElement).value,
    ).toBe("Uygurlar");
    expect(correctOrder("Doğru sıra")).toEqual([
      "Asya Hunları",
      "Göktürkler",
      "Uygurlar",
    ]);
    expect(saveButton().disabled).toBe(true);
  });

  it("changes only the answer order when the author reorders", async () => {
    const user = userEvent.setup();
    renderEditor("ordering", 108);
    await screen.findByRole("heading", { name: "Sıralama sorusunu düzenle" });

    await user.click(
      screen.getByRole("button", { name: "Uygurlar öğesini yukarı taşı" }),
    );
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    await user.click(saveButton());

    await waitFor(() => expect(updateExercise).toHaveBeenCalledTimes(1));
    const [id, body] = updateExercise.mock.calls[0] ?? [];
    expect(id).toBe(108);
    expect(body.content.items).toEqual([
      { id: "alpha", text: "Uygurlar" },
      { id: "beta", text: "Göktürkler" },
      { id: "gamma", text: "Asya Hunları" },
    ]);
    expect(body.answer_key.order).toEqual(["gamma", "alpha", "beta"]);
    expect(body).not.toHaveProperty("owner_unit_id");

    expect(
      await screen.findByText(
        "Cevap anahtarı değişti; geçmiş istatistikleri kontrol edin.",
      ),
    ).toBeDefined();
    expect(screen.getByText("v2")).toBeDefined();
  });
});

describe("word order editor", () => {
  async function fillComplete(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole("heading", {
      name: "Yeni kelime sıralama sorusu",
    });
    await user.selectOptions(screen.getByLabelText("Konu"), "1");
    await user.type(screen.getByLabelText("Yönerge"), "Doğru cümleyi oluştur.");
    await user.type(screen.getByLabelText("Kelime 1 metni"), "Ben");
    await user.type(screen.getByLabelText("Kelime 2 metni"), "okula");
    await user.click(screen.getByRole("button", { name: "Kelime ekle" }));
    await user.type(screen.getByLabelText("Kelime 3 metni"), "gittim");
  }

  it("uses word wording and offers no partial-credit control", async () => {
    renderEditor("word_order");
    await screen.findByRole("heading", {
      name: "Yeni kelime sıralama sorusu",
    });

    expect(screen.getByLabelText("Kelime 1 metni")).toBeDefined();
    expect(screen.queryByLabelText("Öğe 1 metni")).toBeNull();
    expect(screen.queryByLabelText("Kısmi puan ver")).toBeNull();
    expect(correctOrder("Doğru cümle sırası")).toEqual([
      "Kelime 1",
      "Kelime 2",
    ]);
  });

  it("previews the correct sentence resolved from the answer-key ids", async () => {
    const user = userEvent.setup();
    renderEditor("word_order");
    await fillComplete(user);

    const preview = within(screen.getByLabelText("Canlı önizleme"));
    expect(preview.getByText("Ben okula gittim")).toBeDefined();
    expect(preview.getByText(/kısmi puan yoktur/i)).toBeDefined();
  });

  it("sends the canonical create body with content.words", async () => {
    const user = userEvent.setup();
    renderEditor("word_order");
    await fillComplete(user);
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    await user.click(saveButton());

    await waitFor(() => expect(createExercise).toHaveBeenCalledTimes(1));
    const body = createExercise.mock.calls[0]?.[0];
    expect(body).toEqual({
      type: "word_order",
      topic_id: 1,
      owner_unit_id: 11,
      difficulty: 3,
      content: {
        instruction: "Doğru cümleyi oluştur.",
        words: [
          { id: "1", text: "Ben" },
          { id: "2", text: "okula" },
          { id: "3", text: "gittim" },
        ],
      },
      answer_key: { order: ["1", "2", "3"] },
      explanation: null,
      applicable_scopes: ["tyt"],
    });
    expect(body.content).not.toHaveProperty("items");
  });

  it("hydrates a stored word_order question and reorders its sentence", async () => {
    getExerciseDetail.mockResolvedValue(wordOrderDetail);
    updateExercise.mockResolvedValue({ id: 109, version: 2 });
    const user = userEvent.setup();
    renderEditor("word_order", 109);
    await screen.findByRole("heading", {
      name: "Kelime sıralama sorusunu düzenle",
    });

    expect(correctOrder("Doğru cümle sırası")).toEqual([
      "Ben",
      "okula",
      "gittim",
    ]);

    await user.click(
      screen.getByRole("button", { name: "gittim öğesini yukarı taşı" }),
    );
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    await user.click(saveButton());

    await waitFor(() => expect(updateExercise).toHaveBeenCalledTimes(1));
    expect(updateExercise.mock.calls[0]?.[1].answer_key.order).toEqual([
      "1",
      "3",
      "2",
    ]);
  });

  it("resets to two fresh words on Save & New", async () => {
    const user = userEvent.setup();
    renderEditor("word_order");
    await fillComplete(user);
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    await user.click(screen.getByRole("button", { name: "Kaydet ve Yeni" }));

    await waitFor(() =>
      expect(screen.getByText("Kaydedildi. Yeni soru hazır.")).toBeDefined(),
    );
    expect(
      (screen.getByLabelText("Kelime 1 metni") as HTMLInputElement).value,
    ).toBe("");
    expect(screen.queryByLabelText("Kelime 3 metni")).toBeNull();
    expect(correctOrder("Doğru cümle sırası")).toEqual([
      "Kelime 1",
      "Kelime 2",
    ]);
  });
});
