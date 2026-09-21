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
} from "@/contracts/admin/exercise-editor";
import { validTopicsResponse } from "@/test/fixtures/exercise-editor-api";
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
const hotspotDetail: ExerciseDetail = {
  id: 201,
  type: "image_hotspot",
  topic_id: 1,
  difficulty: 3,
  content: {
    instruction: "Başkenti seç.",
    image: "https://example.test/map.png",
    hotspots: [
      { id: "a", text: "Ankara" },
      { id: "b", text: "İstanbul" },
    ],
  },
  answer_key: { hotspot_id: "a" },
  explanation: null,
  applicable_scopes: ["tyt"],
  status: "draft",
  version: 1,
  stats: { attempts: 0, correct_rate: null, avg_seconds: null, needs_review: false },
};
const labelDetail: ExerciseDetail = {
  ...hotspotDetail,
  id: 202,
  type: "diagram_label",
  content: {
    instruction: "Diyagramı etiketle.",
    image: "https://example.test/diagram.png",
    slots: [
      { id: "a", text: "Üst" },
      { id: "b", text: "Alt" },
    ],
  },
  answer_key: { labels: { a: "Zirve", b: "Taban" } },
};

function listFor(detail: ExerciseDetail): UnitExercisesData {
  return {
    unit: { id: 11, title: unit.title },
    exercises: [
      {
        id: detail.id,
        type: detail.type,
        topic: { id: 1, name: "İlk Türk Devletleri" },
        difficulty: detail.difficulty,
        status: detail.status,
        version: detail.version,
        scopes: detail.applicable_scopes,
        preview: detail.content.instruction as string,
        stats: detail.stats,
      },
    ],
  };
}

function renderEditor(
  type: "image_hotspot" | "diagram_label",
  exerciseId?: number,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ExerciseEditor
        canEdit
        courseId={1}
        createType={type}
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
  createExercise.mockReset().mockResolvedValue({ id: 321, status: "draft" });
  updateExercise.mockReset().mockResolvedValue({
    id: 201,
    version: 2,
    answer_key_changed: false,
    warning: null,
  });
  replace.mockReset();
  refresh.mockReset();
});

describe("image_hotspot create editor", () => {
  beforeEach(() => {
    getUnitExercises.mockReset().mockResolvedValue(listFor(hotspotDetail));
    getExerciseDetail.mockReset().mockResolvedValue(hotspotDetail);
  });

  it("renders an instruction, an image URL field and at least two hotspots", async () => {
    renderEditor("image_hotspot");
    await screen.findByRole("heading", { name: "Yeni görsel bölge sorusu" });

    expect(screen.getByLabelText("Yönerge")).toBeDefined();
    expect(screen.getByLabelText("Görsel adresi (URL)")).toBeDefined();
    expect(screen.getByLabelText("1. bölge açıklaması")).toBeDefined();
    expect(screen.getByLabelText("2. bölge açıklaması")).toBeDefined();
  });

  it("creates a question with an external image URL and a chosen correct hotspot", async () => {
    const user = userEvent.setup();
    renderEditor("image_hotspot");
    await screen.findByRole("heading", { name: "Yeni görsel bölge sorusu" });

    await user.selectOptions(screen.getByLabelText("Konu"), "1");
    await user.type(screen.getByLabelText("Yönerge"), "Başkenti seç.");
    await user.type(
      screen.getByLabelText("Görsel adresi (URL)"),
      "https://example.test/map.png",
    );
    await user.type(screen.getByLabelText("1. bölge açıklaması"), "Ankara");
    await user.type(screen.getByLabelText("2. bölge açıklaması"), "İstanbul");
    await user.click(screen.getByLabelText("1. bölgeyi doğru bölge seç"));

    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Kaydet" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(createExercise).toHaveBeenCalledTimes(1));
    const body = createExercise.mock.calls[0]?.[0];
    expect(body.type).toBe("image_hotspot");
    expect(body.content.image).toBe("https://example.test/map.png");
    expect(body.content.hotspots).toEqual([
      { id: "1", text: "Ankara" },
      { id: "2", text: "İstanbul" },
    ]);
    expect(body.answer_key).toEqual({ hotspot_id: "1" });
  });

  it("hydrates an existing hotspot question for editing", async () => {
    renderEditor("image_hotspot", 201);
    await screen.findByRole("heading", {
      name: "Görsel bölge sorusunu düzenle",
    });

    expect(
      (screen.getByLabelText("Görsel adresi (URL)") as HTMLInputElement).value,
    ).toBe("https://example.test/map.png");
    expect(
      (screen.getByLabelText("1. bölgeyi doğru bölge seç") as HTMLInputElement)
        .checked,
    ).toBe(true);
  });
});

describe("diagram_label create editor", () => {
  beforeEach(() => {
    getUnitExercises.mockReset().mockResolvedValue(listFor(labelDetail));
    getExerciseDetail.mockReset().mockResolvedValue(labelDetail);
  });

  it("creates a question with per-slot labels", async () => {
    const user = userEvent.setup();
    renderEditor("diagram_label");
    await screen.findByRole("heading", {
      name: "Yeni diyagram etiketleme sorusu",
    });

    await user.selectOptions(screen.getByLabelText("Konu"), "1");
    await user.type(screen.getByLabelText("Yönerge"), "Diyagramı etiketle.");
    await user.type(
      screen.getByLabelText("Görsel adresi (URL)"),
      "https://example.test/diagram.png",
    );
    await user.type(screen.getByLabelText("1. yer açıklaması"), "Üst");
    await user.type(screen.getByLabelText("1. yer için doğru etiket"), "Zirve");
    await user.type(screen.getByLabelText("2. yer açıklaması"), "Alt");
    await user.type(screen.getByLabelText("2. yer için doğru etiket"), "Taban");

    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Kaydet" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(createExercise).toHaveBeenCalledTimes(1));
    const body = createExercise.mock.calls[0]?.[0];
    expect(body.type).toBe("diagram_label");
    expect(body.content.slots).toEqual([
      { id: "1", text: "Üst" },
      { id: "2", text: "Alt" },
    ]);
    expect(body.answer_key).toEqual({ labels: { "1": "Zirve", "2": "Taban" } });
  });

  it("hydrates an existing diagram question, pairing each slot with its label", async () => {
    renderEditor("diagram_label", 202);
    await screen.findByRole("heading", {
      name: "Diyagram etiketleme sorusunu düzenle",
    });

    expect(
      (screen.getByLabelText("1. yer için doğru etiket") as HTMLInputElement)
        .value,
    ).toBe("Zirve");
    expect(
      (screen.getByLabelText("2. yer için doğru etiket") as HTMLInputElement)
        .value,
    ).toBe("Taban");
  });
});
