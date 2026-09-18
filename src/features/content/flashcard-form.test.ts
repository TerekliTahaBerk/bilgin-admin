import { describe, expect, it } from "vitest";

import type { ExerciseDetail } from "@/contracts/admin/exercise-editor";
import {
  createEditorDefaults,
  editorFormSchema,
  formValuesFromDetail,
  serializeCreateExercise,
  serializeUpdateExercise,
  type EditorFormValues,
} from "@/features/content/editor-form";
import { validFlashcardDetailResponse } from "@/test/fixtures/exercise-editor-api";

const valid: EditorFormValues = {
  ...createEditorDefaults("flashcard"),
  topicId: 1,
  difficulty: 2,
  scopes: ["tyt"],
  explanation: "",
  flashcard: { front: "Kut", back: "Yönetme yetkisi inancı." },
};

function withBranch(change: Partial<EditorFormValues["flashcard"]>) {
  return { ...valid, flashcard: { ...valid.flashcard, ...change } };
}

function detailWith(answerKey: unknown): ExerciseDetail {
  return {
    ...validFlashcardDetailResponse.data,
    answer_key: answerKey,
  } as ExerciseDetail;
}

describe("flashcard defaults", () => {
  it("starts with both faces empty", () => {
    const defaults = createEditorDefaults("flashcard");
    expect(defaults.type).toBe("flashcard");
    expect(defaults.flashcard).toEqual({ front: "", back: "" });
  });
});

describe("flashcard client validation", () => {
  it("accepts a card with both faces", () => {
    expect(editorFormSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["a blank front", { front: "   " }],
    ["a blank back", { back: "" }],
    ["both blank", { front: "", back: "" }],
  ])("rejects %s", (_label, change) => {
    expect(editorFormSchema.safeParse(withBranch(change)).success).toBe(false);
  });

  it.each([
    ["no scopes", { scopes: [] }],
    ["no topic", { topicId: null }],
    ["long explanation", { explanation: "x".repeat(2001) }],
  ])("rejects %s through the shared common fields", (_label, change) => {
    expect(editorFormSchema.safeParse({ ...valid, ...change }).success).toBe(
      false,
    );
  });
});

describe("flashcard hydration", () => {
  it("keeps both faces exactly", () => {
    const hydrated = formValuesFromDetail(
      validFlashcardDetailResponse.data as ExerciseDetail,
    );
    expect(hydrated?.type).toBe("flashcard");
    expect(hydrated?.flashcard).toEqual({
      front: "Kut",
      back: "Yönetme yetkisinin Tanrı tarafından verildiği inancı.",
    });
  });

  it.each([
    ["a missing self_assessed", {}],
    ["self_assessed false", { self_assessed: false }],
    ["an unrelated key", { note: "x" }],
  ])(
    "opens a stored card with %s, since the backend never enforces it",
    (_label, answerKey) => {
      const hydrated = formValuesFromDetail(detailWith(answerKey));
      expect(hydrated?.flashcard.front).toBe("Kut");
    },
  );

  it("refuses a shape it cannot render back", () => {
    expect(
      formValuesFromDetail({
        ...validFlashcardDetailResponse.data,
        content: { front: "Ön" },
      } as ExerciseDetail),
    ).toBeNull();
  });
});

describe("flashcard serialization", () => {
  it("sends the exact backend shape with a canonical answer key", () => {
    expect(serializeCreateExercise(valid, 12)).toEqual({
      type: "flashcard",
      topic_id: 1,
      owner_unit_id: 12,
      difficulty: 2,
      content: { front: "Kut", back: "Yönetme yetkisi inancı." },
      answer_key: { self_assessed: true },
      explanation: null,
      applicable_scopes: ["tyt"],
    });
  });

  it("always writes self_assessed true, whatever the stored card carried", () => {
    // The author has no control over this field, so serialization is constant.
    const create = serializeCreateExercise(valid, 12);
    const update = serializeUpdateExercise(valid);
    expect(create.answer_key).toEqual({ self_assessed: true });
    expect(update.answer_key).toEqual({ self_assessed: true });
  });

  it("trims both faces and keeps ownership per mode", () => {
    const create = serializeCreateExercise(
      withBranch({ front: "  Kut  ", back: "  Tanım  " }),
      12,
    );
    const update = serializeUpdateExercise(valid);
    expect(create.content).toEqual({ front: "Kut", back: "Tanım" });
    expect(create).toMatchObject({ owner_unit_id: 12 });
    expect(update).not.toHaveProperty("owner_unit_id");
    expect(update).not.toHaveProperty("status");
    expect(update).not.toHaveProperty("version");
  });
});
