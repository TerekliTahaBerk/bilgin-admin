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
import { numericFieldValue } from "@/features/content/numeric-input-form";
import { validNumericInputDetailResponse } from "@/test/fixtures/exercise-editor-api";

const valid: EditorFormValues = {
  ...createEditorDefaults("numeric_input"),
  topicId: 1,
  difficulty: 3,
  scopes: ["tyt"],
  explanation: "Açıklama",
  numericInput: {
    stem: "Kavimler Göçü hangi yılda gerçekleşmiştir?",
    answerValue: 375,
    tolerance: 0,
    suffix: "yılı",
  },
};

function withBranch(change: Partial<EditorFormValues["numericInput"]>) {
  return { ...valid, numericInput: { ...valid.numericInput, ...change } };
}

function numericBody(body: CreateExerciseRequest | UpdateExerciseRequest) {
  expect(body.type).toBe("numeric_input");
  if (body.type !== "numeric_input") throw new Error("not a numeric body");
  return body;
}

function detailWith(answerKey: unknown, content?: unknown): ExerciseDetail {
  return {
    ...validNumericInputDetailResponse.data,
    answer_key: answerKey,
    ...(content === undefined ? {} : { content }),
  } as ExerciseDetail;
}

describe("numeric input defaults", () => {
  it("starts with no answer and a zero tolerance", () => {
    const defaults = createEditorDefaults("numeric_input");
    expect(defaults.type).toBe("numeric_input");
    expect(defaults.numericInput).toEqual({
      stem: "",
      answerValue: null,
      tolerance: 0,
      suffix: "",
    });
  });

  it("never defaults the answer to 0, which is a real correct answer", () => {
    expect(
      createEditorDefaults("numeric_input").numericInput.answerValue,
    ).not.toBe(0);
    expect(
      createEditorDefaults("numeric_input").numericInput.answerValue,
    ).toBeNull();
  });
});

describe("numeric field parsing", () => {
  it.each([
    ["an empty string", "", null],
    ["whitespace", "   ", null],
    ["text", "abc", null],
    ["NaN", Number.NaN, null],
    ["Infinity", Number.POSITIVE_INFINITY, null],
    ["undefined", undefined, null],
    ["zero", "0", 0],
    ["a negative decimal", "-2.5", -2.5],
    ["a number", 375, 375],
  ])("maps %s to a safe form value", (_label, input, expected) => {
    expect(numericFieldValue(input)).toBe(expected);
  });
});

describe("numeric input client validation", () => {
  it.each([
    ["a positive integer", 375],
    ["zero", 0],
    ["a negative number", -5],
    ["a negative decimal", -2.5],
    ["a small decimal", 0.33],
  ])("accepts the answer %s", (_label, answerValue) => {
    expect(
      editorFormSchema.safeParse(withBranch({ answerValue })).success,
    ).toBe(true);
  });

  it("accepts an empty suffix and a positive tolerance", () => {
    expect(
      editorFormSchema.safeParse(withBranch({ suffix: "", tolerance: 0.01 }))
        .success,
    ).toBe(true);
  });

  it.each([
    ["a blank stem", { stem: "   " }],
    ["no answer", { answerValue: null }],
    ["a NaN answer", { answerValue: Number.NaN }],
    ["an Infinity answer", { answerValue: Number.POSITIVE_INFINITY }],
    ["no tolerance", { tolerance: null }],
    ["a negative tolerance", { tolerance: -1 }],
    ["a NaN tolerance", { tolerance: Number.NaN }],
  ])("rejects %s", (_label, change) => {
    expect(editorFormSchema.safeParse(withBranch(change)).success).toBe(false);
  });

  it.each([
    ["long explanation", { explanation: "x".repeat(2001) }],
    ["no scopes", { scopes: [] }],
    ["no topic", { topicId: null }],
  ])("rejects %s through the shared common fields", (_label, change) => {
    expect(editorFormSchema.safeParse({ ...valid, ...change }).success).toBe(
      false,
    );
  });

  it("ignores the untouched branches of the other four types", () => {
    expect(
      editorFormSchema.safeParse({
        ...valid,
        multipleChoice: { stem: "", options: [], correctOptionId: "" },
        trueFalse: { statement: "", answerValue: null },
        fillBlank: { template: "", choices: [], blanks: [] },
        flashcard: { front: "", back: "" },
      }).success,
    ).toBe(true);
  });
});

describe("numeric input hydration", () => {
  it("keeps a stored zero answer instead of losing the falsy value", () => {
    const hydrated = formValuesFromDetail(
      validNumericInputDetailResponse.data as ExerciseDetail,
    );
    expect(hydrated?.type).toBe("numeric_input");
    expect(hydrated?.numericInput.answerValue).toBe(0);
    expect(hydrated?.numericInput.answerValue).not.toBeNull();
    expect(hydrated?.numericInput.tolerance).toBe(0);
    expect(hydrated?.numericInput.suffix).toBe("yılı");
  });

  it.each([
    ["a positive integer", 375, 375],
    ["zero", 0, 0],
    ["a negative decimal", -4.5, -4.5],
    ["a numeric string", "375", 375],
    ["a zero string", "0", 0],
  ])("hydrates the answer %s", (_label, stored, expected) => {
    const hydrated = formValuesFromDetail(
      detailWith({ value: stored, tolerance: 0 }),
    );
    expect(hydrated?.numericInput.answerValue).toBe(expected);
  });

  it("treats a missing tolerance as 0, matching the backend default", () => {
    const hydrated = formValuesFromDetail(detailWith({ value: 375 }));
    expect(hydrated?.numericInput.tolerance).toBe(0);
  });

  it("treats a missing suffix as empty", () => {
    const hydrated = formValuesFromDetail(
      detailWith({ value: 1, tolerance: 0 }, { stem: "Soru?" }),
    );
    expect(hydrated?.numericInput.suffix).toBe("");
  });

  it("refuses a shape it cannot render back", () => {
    expect(formValuesFromDetail(detailWith({ value: "abc" }))).toBeNull();
    expect(formValuesFromDetail(detailWith({}))).toBeNull();
  });
});

describe("numeric input serialization", () => {
  it("sends the exact backend shape", () => {
    expect(serializeCreateExercise(valid, 12)).toEqual({
      type: "numeric_input",
      topic_id: 1,
      owner_unit_id: 12,
      difficulty: 3,
      content: {
        stem: "Kavimler Göçü hangi yılda gerçekleşmiştir?",
        suffix: "yılı",
      },
      answer_key: { value: 375, tolerance: 0 },
      explanation: "Açıklama",
      applicable_scopes: ["tyt"],
    });
  });

  it("sends a zero answer as the JSON number 0", () => {
    const body = numericBody(
      serializeCreateExercise(withBranch({ answerValue: 0 }), 12),
    );
    expect(body.answer_key).toEqual({ value: 0, tolerance: 0 });
    expect(typeof body.answer_key.value).toBe("number");
    expect(JSON.stringify(body)).toContain('"value":0');
  });

  it.each([
    ["a negative answer", -5],
    ["a decimal answer", 0.33],
  ])("sends %s unchanged", (_label, answerValue) => {
    expect(
      numericBody(serializeCreateExercise(withBranch({ answerValue }), 12))
        .answer_key.value,
    ).toBe(answerValue);
  });

  it("omits an empty suffix rather than sending an empty string", () => {
    const body = numericBody(
      serializeCreateExercise(withBranch({ suffix: "   " }), 12),
    );
    expect(body.content).toEqual({
      stem: "Kavimler Göçü hangi yılda gerçekleşmiştir?",
    });
    expect(body.content).not.toHaveProperty("suffix");
    expect(JSON.stringify(body)).not.toContain("suffix");
  });

  it("trims the stem and the suffix", () => {
    const body = numericBody(
      serializeCreateExercise(
        withBranch({ stem: "  Soru?  ", suffix: "  yılı  " }),
        12,
      ),
    );
    expect(body.content).toEqual({ stem: "Soru?", suffix: "yılı" });
  });

  it("keeps ownership per mode and nulls a blank explanation", () => {
    const create = serializeCreateExercise({ ...valid, explanation: " " }, 12);
    const update = serializeUpdateExercise(valid);
    expect(create.explanation).toBeNull();
    expect(create).toMatchObject({ owner_unit_id: 12 });
    expect(update).not.toHaveProperty("owner_unit_id");
    expect(update).not.toHaveProperty("status");
    expect(update).not.toHaveProperty("version");
  });

  it.each([
    ["no answer", { answerValue: null }],
    ["a NaN answer", { answerValue: Number.NaN }],
    ["a negative tolerance", { tolerance: -1 }],
    ["no tolerance", { tolerance: null }],
  ])("refuses to serialize %s", (_label, change) => {
    expect(() => serializeUpdateExercise(withBranch(change))).toThrow(
      TypeError,
    );
  });
});
