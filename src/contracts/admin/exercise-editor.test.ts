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
  validTrueFalseDetailResponse,
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

const trueFalseEditable = {
  type: "true_false",
  topic_id: 1,
  difficulty: 3,
  content: { statement: "Uygurlar yerleşik hayata geçmiştir." },
  answer_key: { value: true },
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

  it("keeps the eight unsupported detail types readable for a safe UI state", () => {
    for (const type of [
      "fill_blank",
      "matching",
      "ordering",
      "word_order",
      "numeric_input",
      "flashcard",
      "image_hotspot",
      "diagram_label",
    ]) {
      const parsed = exerciseDetailResponseSchema.parse({
        ...validExerciseDetailResponse,
        data: {
          ...validExerciseDetailResponse.data,
          type,
          // Shapes this editor knows nothing about must stay readable.
          content: { segments: [{ kind: "text", value: "x" }] },
          answer_key: { blanks: ["x"] },
        },
      });
      expect(parsed.data.type).toBe(type);
    }
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

  it("rejects a mutation body for an unsupported type before any backend call", () => {
    for (const type of ["fill_blank", "matching", "banana", ""]) {
      expect(
        createExerciseRequestSchema.safeParse({
          ...editable,
          type,
          owner_unit_id: 12,
        }).success,
      ).toBe(false);
      expect(
        updateExerciseRequestSchema.safeParse({ ...editable, type }).success,
      ).toBe(false);
    }
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

describe("true/false contracts", () => {
  it.each([[true], [false]])(
    "validates a detail whose answer key is the boolean %s",
    (value) => {
      const parsed = exerciseDetailResponseSchema.parse({
        ...validTrueFalseDetailResponse,
        data: { ...validTrueFalseDetailResponse.data, answer_key: { value } },
      });
      expect(parsed.data.answer_key).toEqual({ value });
    },
  );

  it("reads the stored false answer without coercing it away", () => {
    const parsed = exerciseDetailResponseSchema.parse(
      validTrueFalseDetailResponse,
    );
    expect(parsed.data.answer_key).toEqual({ value: false });
    expect(parsed.data.content).toEqual({
      statement: validTrueFalseDetailResponse.data.content.statement,
    });
  });

  it("accepts a blank statement in a detail read but rejects the shape it cannot render", () => {
    // Blank text is the backend validator's call to make on write; a stored
    // row must stay readable either way.
    expect(
      exerciseDetailResponseSchema.safeParse({
        ...validTrueFalseDetailResponse,
        data: {
          ...validTrueFalseDetailResponse.data,
          content: { statement: "" },
        },
      }).success,
    ).toBe(true);
    expect(
      exerciseDetailResponseSchema.safeParse({
        ...validTrueFalseDetailResponse,
        data: { ...validTrueFalseDetailResponse.data, content: {} },
      }).success,
    ).toBe(false);
  });

  it.each([["true"], ["false"], [1], [0], [null]])(
    "rejects the non-boolean answer key %p in a detail read",
    (value) => {
      expect(
        exerciseDetailResponseSchema.safeParse({
          ...validTrueFalseDetailResponse,
          data: { ...validTrueFalseDetailResponse.data, answer_key: { value } },
        }).success,
      ).toBe(false);
    },
  );

  it.each([[true], [false]])(
    "accepts a create and an update body whose answer is the boolean %s",
    (value) => {
      const create = createExerciseRequestSchema.parse({
        ...trueFalseEditable,
        answer_key: { value },
        owner_unit_id: 12,
      });
      const update = updateExerciseRequestSchema.parse({
        ...trueFalseEditable,
        answer_key: { value },
      });

      expect(create.answer_key).toEqual({ value });
      expect(create.type).toBe("true_false");
      if (create.type !== "true_false") throw new Error("wrong branch");
      expect(typeof create.answer_key.value).toBe("boolean");
      expect(update.answer_key).toEqual({ value });
    },
  );

  it.each([["true"], ["false"], [1], [0], [null], [undefined]])(
    "rejects the non-boolean mutation answer %p before any backend call",
    (value) => {
      expect(
        createExerciseRequestSchema.safeParse({
          ...trueFalseEditable,
          answer_key: { value },
          owner_unit_id: 12,
        }).success,
      ).toBe(false);
      expect(
        updateExerciseRequestSchema.safeParse({
          ...trueFalseEditable,
          answer_key: { value },
        }).success,
      ).toBe(false);
    },
  );

  it("strips ownership and lifecycle fields from true/false bodies too", () => {
    const create = createExerciseRequestSchema.parse({
      ...trueFalseEditable,
      owner_unit_id: 12,
      owner_course_id: 5,
      id: 77,
      status: "published",
      version: 99,
      stats: {},
    });
    const update = updateExerciseRequestSchema.parse({
      ...trueFalseEditable,
      owner_unit_id: 999,
      status: "archived",
      version: 3,
      id: 77,
    });

    expect(create).not.toHaveProperty("owner_course_id");
    expect(create).not.toHaveProperty("id");
    expect(create).not.toHaveProperty("status");
    expect(create).not.toHaveProperty("version");
    expect(create).not.toHaveProperty("stats");
    expect(update).not.toHaveProperty("owner_unit_id");
    expect(update).not.toHaveProperty("status");
    expect(update).not.toHaveProperty("version");
    expect(update).not.toHaveProperty("id");
  });

  it("rejects a true/false body carrying multiple choice content", () => {
    expect(
      updateExerciseRequestSchema.safeParse({
        ...trueFalseEditable,
        content: { stem: "Soru?", options: [{ id: "a", text: "A" }] },
      }).success,
    ).toBe(false);
  });
});
