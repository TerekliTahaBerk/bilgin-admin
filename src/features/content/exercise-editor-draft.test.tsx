/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  exerciseDraftKey,
  loadDraft,
  saveDraft,
} from "@/features/content/exercise-draft-storage";
import { createEditorDefaults } from "@/features/content/editor-form";
import { listRecentExercises } from "@/features/content/exercise-history";
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

function renderEditor(exerciseId?: number) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ExerciseEditor
        canEdit
        courseId={1}
        exerciseId={exerciseId}
        unitId={11}
      />
    </QueryClientProvider>,
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
    answer_key_changed: false,
    warning: null,
  });
  replace.mockReset();
  refresh.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("exercise editor draft recovery", () => {
  it("offers to restore a pre-existing local draft for a new question", async () => {
    const key = exerciseDraftKey(1, 11, undefined);
    const draft = createEditorDefaults("multiple_choice", undefined);
    saveDraft(key, {
      ...draft,
      multipleChoice: {
        ...draft.multipleChoice,
        stem: "Taslaktan gelen soru kökü",
      },
    });

    renderEditor();

    await screen.findByText(/kaydedilmemiş bir taslak bulundu/i);
    expect(screen.getByText("Taslağı Geri Yükle")).toBeDefined();
  });

  it("does not offer recovery when no draft exists", async () => {
    renderEditor();

    await screen.findByRole("heading", { name: "Yeni çoktan seçmeli soru" });
    expect(screen.queryByText(/kaydedilmemiş bir taslak bulundu/i)).toBeNull();
  });

  it("restoring the draft fills the form and dismisses the banner", async () => {
    const user = userEvent.setup();
    const key = exerciseDraftKey(1, 11, undefined);
    const draft = createEditorDefaults("multiple_choice", undefined);
    saveDraft(key, {
      ...draft,
      multipleChoice: {
        ...draft.multipleChoice,
        stem: "Taslaktan gelen soru kökü",
      },
    });

    renderEditor();
    await screen.findByText(/kaydedilmemiş bir taslak bulundu/i);
    await user.click(screen.getByText("Taslağı Geri Yükle"));

    expect(screen.queryByText(/kaydedilmemiş bir taslak bulundu/i)).toBeNull();
    expect(
      (screen.getByLabelText("Soru kökü") as HTMLTextAreaElement).value,
    ).toBe("Taslaktan gelen soru kökü");
  });

  it("clears the draft and records history after a successful create", async () => {
    const user = userEvent.setup();
    renderEditor();

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

    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(loadDraft(exerciseDraftKey(1, 11, undefined))).toBeNull();
    expect(listRecentExercises().some((entry) => entry.exerciseId === 123)).toBe(
      true,
    );
  });
});
