import { describe, expect, it } from "vitest";

import type { ExerciseDetail } from "@/contracts/admin/exercise-editor";
import {
  correctAnswerAfterOptionRemoval,
  createMultipleChoiceDefaults,
  formValuesFromDetail,
  multipleChoiceFormSchema,
  nextOptionId,
  serializeCreateExercise,
  serializeUpdateExercise,
} from "@/features/content/multiple-choice-form";
import { validExerciseDetailResponse } from "@/test/fixtures/exercise-editor-api";

const valid = {
  topicId: 1,
  difficulty: 3,
  scopes: ["tyt" as const],
  explanation: "Açıklama",
  stem: "Soru kökü",
  options: [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
  ],
  correctOptionId: "a",
};

describe("multiple choice client validation", () => {
  it("accepts valid two- and four-option questions", () => {
    expect(multipleChoiceFormSchema.safeParse(valid).success).toBe(true);
    expect(
      multipleChoiceFormSchema.safeParse({
        ...valid,
        options: [
          ...valid.options,
          { id: "c", text: "C" },
          { id: "d", text: "D" },
        ],
      }).success,
    ).toBe(true);
  });

  it.each([
    ["blank stem", { stem: "   " }],
    ["one option", { options: [{ id: "a", text: "A" }] }],
    [
      "blank option",
      {
        options: [
          { id: "a", text: "" },
          { id: "b", text: "B" },
        ],
      },
    ],
    [
      "duplicate ids",
      {
        options: [
          { id: "a", text: "A" },
          { id: "a", text: "B" },
        ],
      },
    ],
    ["missing answer", { correctOptionId: "" }],
    ["absent answer", { correctOptionId: "z" }],
    ["long explanation", { explanation: "x".repeat(2001) }],
    ["no scopes", { scopes: [] }],
    ["difficulty 0", { difficulty: 0 }],
    ["difficulty 6", { difficulty: 6 }],
  ])("rejects %s", (_label, change) => {
    expect(
      multipleChoiceFormSchema.safeParse({ ...valid, ...change }).success,
    ).toBe(false);
  });
});

describe("multiple choice option and serialization helpers", () => {
  it("starts with a,b,c,d and allocates the first unused alphabetical id", () => {
    expect(
      createMultipleChoiceDefaults().options.map((option) => option.id),
    ).toEqual(["a", "b", "c", "d"]);
    expect(nextOptionId(["a", "c", "d"])).toBe("b");
  });

  it("does not renumber arbitrary ids and clears only a removed correct answer", () => {
    expect(nextOptionId(["choice-7", "a", "b"])).toBe("c");
    expect(correctAnswerAfterOptionRemoval("b", "b")).toBe("");
    expect(correctAnswerAfterOptionRemoval("c", "b")).toBe("c");
  });

  it("preserves backend option ids while hydrating edit state", () => {
    const detail = {
      ...validExerciseDetailResponse.data,
      content: {
        stem: "Soru",
        options: [
          { id: "x7", text: "X" },
          { id: "q2", text: "Q" },
        ],
      },
      answer_key: { correct_option_id: "q2" },
    } as ExerciseDetail;
    expect(
      formValuesFromDetail(detail)?.options.map((option) => option.id),
    ).toEqual(["x7", "q2"]);
  });

  it("serializes empty explanation as null and allowlists ownership by mode", () => {
    const create = serializeCreateExercise({ ...valid, explanation: "  " }, 12);
    const update = serializeUpdateExercise({ ...valid, explanation: "  " });
    expect(create).toMatchObject({ owner_unit_id: 12, explanation: null });
    expect(update).not.toHaveProperty("owner_unit_id");
    expect(update).not.toHaveProperty("status");
  });
});
