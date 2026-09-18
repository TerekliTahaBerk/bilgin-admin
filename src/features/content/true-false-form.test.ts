import { describe, expect, it } from "vitest";

import type {
  CreateExerciseRequest,
  ExerciseDetail,
  UpdateExerciseRequest,
} from "@/contracts/admin/exercise-editor";
import {
  createEditorDefaults,
  editorFormSchema,
  formValuesFromDetail,
  serializeCreateExercise,
  serializeUpdateExercise,
  type EditorFormValues,
} from "@/features/content/editor-form";
import { trueFalseAnswerLabel } from "@/features/content/true-false-section";
import { validExerciseDetailResponse } from "@/test/fixtures/exercise-editor-api";

const valid: EditorFormValues = {
  ...createEditorDefaults("true_false"),
  topicId: 1,
  difficulty: 3,
  scopes: ["tyt"],
  explanation: "Açıklama",
  trueFalse: {
    statement: "Uygurlar yerleşik hayata geçmiştir.",
    answerValue: true,
  },
};

/**
 * Narrows the serializer's discriminated union without a cast, so a body that
 * came back as multiple choice fails the test instead of being papered over.
 */
function trueFalseAnswer(body: CreateExerciseRequest | UpdateExerciseRequest): {
  value: boolean;
} {
  expect(body.type).toBe("true_false");
  if (body.type !== "true_false") throw new Error("not a true/false body");
  return body.answer_key;
}

function withBranch(change: Partial<EditorFormValues["trueFalse"]>) {
  return { ...valid, trueFalse: { ...valid.trueFalse, ...change } };
}

function trueFalseDetail(value: unknown, statement = "İfade"): ExerciseDetail {
  return {
    ...validExerciseDetailResponse.data,
    type: "true_false",
    content: { statement },
    answer_key: { value },
  } as ExerciseDetail;
}

describe("true/false defaults", () => {
  it("starts with no statement and no answer selected", () => {
    const defaults = createEditorDefaults("true_false");
    expect(defaults.type).toBe("true_false");
    expect(defaults.trueFalse).toEqual({ statement: "", answerValue: null });
    expect(defaults.difficulty).toBe(3);
    expect(defaults.explanation).toBe("");
    expect(defaults.topicId).toBeNull();
  });

  it("never defaults the answer to false, which would be a silent wrong key", () => {
    expect(createEditorDefaults("true_false").trueFalse.answerValue).not.toBe(
      false,
    );
  });
});

describe("true/false client validation", () => {
  it("accepts a true answer", () => {
    expect(editorFormSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a false answer — false is a complete answer, not a missing one", () => {
    const parsed = editorFormSchema.safeParse(
      withBranch({ answerValue: false }),
    );
    expect(parsed.success).toBe(true);
  });

  it.each([
    ["blank statement", { statement: "   " }],
    ["unanswered", { answerValue: null }],
  ])("rejects %s", (_label, change) => {
    expect(editorFormSchema.safeParse(withBranch(change)).success).toBe(false);
  });

  it.each([
    ['string "true"', "true"],
    ['string "false"', "false"],
    ["number 1", 1],
    ["number 0", 0],
    ["undefined", undefined],
  ])("rejects a non-boolean answer: %s", (_label, answerValue) => {
    expect(
      editorFormSchema.safeParse({
        ...valid,
        trueFalse: { statement: valid.trueFalse.statement, answerValue },
      }).success,
    ).toBe(false);
  });

  it.each([
    ["long explanation", { explanation: "x".repeat(2001) }],
    ["no scopes", { scopes: [] }],
    ["difficulty 6", { difficulty: 6 }],
    ["no topic", { topicId: null }],
  ])("rejects %s through the shared common fields", (_label, change) => {
    expect(editorFormSchema.safeParse({ ...valid, ...change }).success).toBe(
      false,
    );
  });

  it("ignores the untouched multiple choice branch", () => {
    expect(
      editorFormSchema.safeParse({
        ...valid,
        multipleChoice: { stem: "", options: [], correctOptionId: "" },
      }).success,
    ).toBe(true);
  });
});

describe("true/false hydration", () => {
  it("selects Doğru for a true answer key", () => {
    const hydrated = formValuesFromDetail(trueFalseDetail(true));
    expect(hydrated?.type).toBe("true_false");
    expect(hydrated?.trueFalse.answerValue).toBe(true);
  });

  it("selects Yanlış for a false answer key instead of losing the falsy value", () => {
    const hydrated = formValuesFromDetail(
      trueFalseDetail(false, "Yanlış ifade"),
    );
    expect(hydrated?.trueFalse).toEqual({
      statement: "Yanlış ifade",
      answerValue: false,
    });
    expect(hydrated?.trueFalse.answerValue).not.toBeNull();
  });

  it.each([["true"], ["false"]])(
    "refuses to hydrate from a string answer key: %s",
    (value) => {
      expect(formValuesFromDetail(trueFalseDetail(value))).toBeNull();
    },
  );

  it("labels the preview answer for both booleans and for no answer", () => {
    expect(trueFalseAnswerLabel(true)).toBe("Doğru");
    expect(trueFalseAnswerLabel(false)).toBe("Yanlış");
    expect(trueFalseAnswerLabel(null)).toBe("Seçilmedi");
  });
});

describe("true/false serialization", () => {
  it("sends a real JSON boolean true", () => {
    const body = serializeCreateExercise(valid, 12);
    expect(body).toEqual({
      type: "true_false",
      topic_id: 1,
      owner_unit_id: 12,
      difficulty: 3,
      content: { statement: "Uygurlar yerleşik hayata geçmiştir." },
      answer_key: { value: true },
      explanation: "Açıklama",
      applicable_scopes: ["tyt"],
    });
    expect(typeof trueFalseAnswer(body).value).toBe("boolean");
  });

  it('sends a real JSON boolean false, never the string "false"', () => {
    const values = withBranch({ answerValue: false });
    const create = serializeCreateExercise(values, 12);
    const update = serializeUpdateExercise(values);

    expect(create.answer_key).toEqual({ value: false });
    expect(typeof trueFalseAnswer(create).value).toBe("boolean");
    expect(update.answer_key).toEqual({ value: false });
    expect(typeof trueFalseAnswer(update).value).toBe("boolean");
    expect(JSON.parse(JSON.stringify(create)).answer_key.value).toBe(false);
    expect(JSON.stringify(create)).toContain('"value":false');
    expect(JSON.stringify(create)).not.toContain('"false"');
  });

  it("trims the statement, nulls a blank explanation and keeps ownership per mode", () => {
    const create = serializeCreateExercise(
      { ...withBranch({ statement: "  Boşluklu ifade  " }), explanation: "  " },
      12,
    );
    const update = serializeUpdateExercise(valid);

    expect(create.content).toEqual({ statement: "Boşluklu ifade" });
    expect(create.explanation).toBeNull();
    expect(create).toMatchObject({ owner_unit_id: 12 });
    expect(update).not.toHaveProperty("owner_unit_id");
    expect(update).not.toHaveProperty("status");
    expect(update).not.toHaveProperty("version");
  });

  it("refuses to serialize an unanswered question", () => {
    expect(() =>
      serializeUpdateExercise(withBranch({ answerValue: null })),
    ).toThrow(TypeError);
  });
});
