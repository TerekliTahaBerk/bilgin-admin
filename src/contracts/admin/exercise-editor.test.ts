import { describe, expect, it } from "vitest";

import {
  courseTopicsResponseSchema,
  createExerciseRequestSchema,
  createExerciseResponseSchema,
  exerciseDetailResponseSchema,
  updateExerciseRequestSchema,
  updateExerciseResponseSchema,
} from "@/contracts/admin/exercise-editor";
import {
  validCreateExerciseResponse,
  validExerciseDetailResponse,
  validTopicsResponse,
  validUpdateExerciseResponse,
} from "@/test/fixtures/exercise-editor-api";

const editable = {
  type: "multiple_choice",
  topic_id: 1,
  difficulty: 3,
  content: {
    stem: "Soru?",
    options: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
  },
  answer_key: { correct_option_id: "a" },
  explanation: null,
  applicable_scopes: ["tyt"],
} as const;

describe("exercise editor backend contracts", () => {
  it("accepts optional topic fields and strips additive fields", () => {
    const parsed = courseTopicsResponseSchema.parse({
      ...validTopicsResponse,
      data: {
        ...validTopicsResponse.data,
        additive: true,
        topics: validTopicsResponse.data.topics.map((topic) => ({
          ...topic,
          additive: "ignored",
        })),
      },
    });

    expect(parsed.data.topics[0]?.parent_id).toBeUndefined();
    expect(parsed.data.topics[1]?.grade_level).toBe(9);
    expect(parsed.data).not.toHaveProperty("additive");
    expect(parsed.data.topics[0]).not.toHaveProperty("additive");
  });

  it("validates multiple choice detail content and answer key", () => {
    expect(
      exerciseDetailResponseSchema.parse(validExerciseDetailResponse).data
        .answer_key,
    ).toEqual({ correct_option_id: "b" });

    expect(
      exerciseDetailResponseSchema.safeParse({
        ...validExerciseDetailResponse,
        data: {
          ...validExerciseDetailResponse.data,
          content: { stem: "x", options: [{ id: "a", text: "A" }] },
        },
      }).success,
    ).toBe(false);
  });

  it("keeps unsupported detail types readable for a safe UI state", () => {
    const parsed = exerciseDetailResponseSchema.parse({
      ...validExerciseDetailResponse,
      data: {
        ...validExerciseDetailResponse.data,
        type: "true_false",
        content: { statement: "Doğru mu?" },
        answer_key: { value: true },
      },
    });
    expect(parsed.data.type).toBe("true_false");
  });

  it("allowlists create and update fields", () => {
    const create = createExerciseRequestSchema.parse({
      ...editable,
      owner_unit_id: 12,
      status: "published",
      version: 99,
      stats: {},
    });
    const update = updateExerciseRequestSchema.parse({
      ...editable,
      owner_unit_id: 999,
      status: "archived",
      id: 77,
    });

    expect(create).not.toHaveProperty("status");
    expect(create).not.toHaveProperty("version");
    expect(update).not.toHaveProperty("owner_unit_id");
    expect(update).not.toHaveProperty("id");
  });

  it("validates create and conditional update responses", () => {
    expect(
      createExerciseResponseSchema.parse(validCreateExerciseResponse).data,
    ).toEqual({ id: 123, status: "draft" });
    expect(
      updateExerciseResponseSchema.parse(validUpdateExerciseResponse).data,
    ).toMatchObject({ version: 4, answer_key_changed: true });
    expect(
      updateExerciseResponseSchema.safeParse({
        ...validUpdateExerciseResponse,
        data: { id: 1, version: 4 },
      }).success,
    ).toBe(true);
  });
});
