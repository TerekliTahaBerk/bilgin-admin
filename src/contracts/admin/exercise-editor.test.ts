import { describe, expect, it } from "vitest";

import {
  courseTopicsResponseSchema,
  createExerciseRequestSchema,
  createExerciseResponseSchema,
  exerciseDetailResponseSchema,
  fillBlankContentSchema,
  numericInputAnswerKeyDetailSchema,
  numericInputContentSchema,
  updateExerciseRequestSchema,
  updateExerciseResponseSchema,
} from "@/contracts/admin/exercise-editor";
import {
  validCreateExerciseResponse,
  validExerciseDetailResponse,
  validFillBlankDetailResponse,
  validFlashcardDetailResponse,
  validNumericInputDetailResponse,
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

  it("keeps the five unsupported detail types readable for a safe UI state", () => {
    for (const type of [
      "matching",
      "ordering",
      "word_order",
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
    for (const type of ["matching", "ordering", "banana", ""]) {
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

const fillBlankEditable = {
  type: "fill_blank",
  topic_id: 1,
  difficulty: 3,
  content: {
    template: "Türklerde yazısız hukuk kurallarına {{0}} denir.",
    choices: ["Töre", "Kurultay"],
  },
  answer_key: { blanks: ["Töre"] },
  explanation: null,
  applicable_scopes: ["tyt"],
} as const;

function fillBlankBody(change: Record<string, unknown>) {
  return { ...fillBlankEditable, ...change, owner_unit_id: 12 };
}

describe("fill blank contracts", () => {
  it("reads a stored question with its template, choices and answers intact", () => {
    const parsed = exerciseDetailResponseSchema.parse(
      validFillBlankDetailResponse,
    );
    expect(parsed.data.content).toEqual({
      template: "Türklerde yazısız hukuk kurallarına {{0}} denir.",
      choices: ["Töre", "Kurultay", "Toy", "Yuğ"],
    });
    expect(parsed.data.answer_key).toEqual({ blanks: ["Töre"] });
  });

  it("accepts a detail with no choices and normalises them to an empty list", () => {
    // The backend validator reads choices ?? [], so this shape is valid there
    // and must stay readable. The detail keeps the backend's raw record; the
    // content schema is what normalises it for the editor.
    const content = { template: "Başkent {{0}} şehridir." };
    expect(
      exerciseDetailResponseSchema.safeParse({
        ...validFillBlankDetailResponse,
        data: { ...validFillBlankDetailResponse.data, content },
      }).success,
    ).toBe(true);
    expect(fillBlankContentSchema.parse(content)).toEqual({
      template: "Başkent {{0}} şehridir.",
      choices: [],
    });
  });

  it("keeps a stored detail readable even when the editor would refuse to save it", () => {
    // A detail read must not become a protocol error over content the editor
    // can surface and let a human fix.
    for (const data of [
      { content: { template: "Boşluksuz metin.", choices: [] } },
      { answer_key: { blanks: [] } },
      { answer_key: { blanks: ["A", "B"] } },
      { answer_key: { blanks: [""] } },
    ]) {
      expect(
        exerciseDetailResponseSchema.safeParse({
          ...validFillBlankDetailResponse,
          data: { ...validFillBlankDetailResponse.data, ...data },
        }).success,
      ).toBe(true);
    }
  });

  it.each([
    ["a missing template", { content: { choices: [] } }],
    ["a non-string template", { content: { template: 7, choices: [] } }],
    ["non-string choices", { content: { template: "{{0}}", choices: [7] } }],
    ["missing blanks", { answer_key: {} }],
    ["non-string blanks", { answer_key: { blanks: [7] } }],
  ])("rejects the unreadable shape: %s", (_label, data) => {
    expect(
      exerciseDetailResponseSchema.safeParse({
        ...validFillBlankDetailResponse,
        data: { ...validFillBlankDetailResponse.data, ...data },
      }).success,
    ).toBe(false);
  });

  it("accepts a single-blank and a multi-blank mutation body", () => {
    expect(
      createExerciseRequestSchema.safeParse(fillBlankBody({})).success,
    ).toBe(true);
    expect(
      createExerciseRequestSchema.safeParse(
        fillBlankBody({
          content: {
            template: "{{0}} ve {{1}} birlikte kullanılır.",
            choices: ["Töre", "Kut"],
          },
          answer_key: { blanks: ["Töre", "Kut"] },
        }),
      ).success,
    ).toBe(true);
  });

  it("accepts a free-answer body whose choices are empty", () => {
    const parsed = createExerciseRequestSchema.parse(
      fillBlankBody({
        content: { template: "Başkent {{0}} şehridir.", choices: [] },
        answer_key: { blanks: ["Karabalgasun"] },
      }),
    );
    expect(parsed.content).toEqual({
      template: "Başkent {{0}} şehridir.",
      choices: [],
    });
  });

  it("mirrors the backend's occurrence counting for repeated and odd tokens", () => {
    expect(
      createExerciseRequestSchema.safeParse(
        fillBlankBody({
          content: { template: "{{0}} ve yine {{0}}", choices: [] },
          answer_key: { blanks: ["A", "B"] },
        }),
      ).success,
    ).toBe(true);
    expect(
      createExerciseRequestSchema.safeParse(
        fillBlankBody({
          content: { template: "{{4}} sonra {{1}}", choices: [] },
          answer_key: { blanks: ["A", "B"] },
        }),
      ).success,
    ).toBe(true);
  });

  it.each([
    [
      "a blank template",
      {
        content: { template: "   ", choices: [] },
        answer_key: { blanks: ["A"] },
      },
    ],
    [
      "zero placeholders",
      {
        content: { template: "Düz metin.", choices: [] },
        answer_key: { blanks: ["A"] },
      },
    ],
    [
      "a malformed token only",
      {
        content: { template: "Düz {0} metin.", choices: [] },
        answer_key: { blanks: ["A"] },
      },
    ],
    ["an empty answer list", { answer_key: { blanks: [] } }],
    [
      "too few answers",
      {
        content: { template: "{{0}} ve {{1}}", choices: [] },
        answer_key: { blanks: ["A"] },
      },
    ],
    [
      "too many answers",
      {
        content: { template: "{{0}}", choices: [] },
        answer_key: { blanks: ["A", "B"] },
      },
    ],
    [
      "an answer outside a non-empty choice list",
      {
        content: { template: "{{0}}", choices: ["A", "B"] },
        answer_key: { blanks: ["Z"] },
      },
    ],
    [
      "an answer that only differs by case",
      {
        content: { template: "{{0}}", choices: ["Töre"] },
        answer_key: { blanks: ["töre"] },
      },
    ],
  ])("rejects %s before any backend call", (_label, change) => {
    expect(
      createExerciseRequestSchema.safeParse(fillBlankBody(change)).success,
    ).toBe(false);
    const update = { ...fillBlankEditable, ...change };
    expect(updateExerciseRequestSchema.safeParse(update).success).toBe(false);
  });

  it("strips ownership and lifecycle fields from fill blank bodies too", () => {
    const create = createExerciseRequestSchema.parse({
      ...fillBlankEditable,
      owner_unit_id: 12,
      owner_course_id: 5,
      id: 77,
      status: "published",
      version: 99,
      stats: {},
    });
    const update = updateExerciseRequestSchema.parse({
      ...fillBlankEditable,
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
});

const numericEditable = {
  type: "numeric_input",
  topic_id: 1,
  difficulty: 3,
  content: {
    stem: "Kavimler Göçü hangi yılda gerçekleşmiştir?",
    suffix: "yılı",
  },
  answer_key: { value: 375, tolerance: 0 },
  explanation: null,
  applicable_scopes: ["tyt"],
} as const;

const flashcardEditable = {
  type: "flashcard",
  topic_id: 1,
  difficulty: 2,
  content: { front: "Kut", back: "Yönetme yetkisi inancı." },
  answer_key: { self_assessed: true },
  explanation: null,
  applicable_scopes: ["tyt"],
} as const;

function numericDetail(answerKey: unknown, content?: unknown) {
  return {
    ...validNumericInputDetailResponse,
    data: {
      ...validNumericInputDetailResponse.data,
      answer_key: answerKey,
      ...(content === undefined ? {} : { content }),
    },
  };
}

describe("numeric input contracts", () => {
  it.each([
    ["a positive integer", 375],
    ["zero", 0],
    ["a negative number", -4.5],
    ["a decimal", 0.33],
  ])("reads %s as the stored answer", (_label, value) => {
    const parsed = exerciseDetailResponseSchema.parse(
      numericDetail({ value, tolerance: 0 }),
    );
    expect(parsed.data.answer_key).toEqual({ value, tolerance: 0 });
  });

  it("normalises the numeric strings PHP is_numeric() accepts", () => {
    expect(
      numericInputAnswerKeyDetailSchema.parse({ value: "375", tolerance: "0" }),
    ).toEqual({ value: 375, tolerance: 0 });
    expect(numericInputAnswerKeyDetailSchema.parse({ value: "0" })).toEqual({
      value: 0,
      tolerance: undefined,
    });
    expect(numericInputAnswerKeyDetailSchema.parse({ value: "-2.5" })).toEqual({
      value: -2.5,
      tolerance: undefined,
    });
  });

  it("leaves a missing tolerance absent for the form to default to 0", () => {
    const parsed = numericInputAnswerKeyDetailSchema.parse({ value: 375 });
    expect(parsed.tolerance).toBeUndefined();
    expect(
      exerciseDetailResponseSchema.safeParse(numericDetail({ value: 375 }))
        .success,
    ).toBe(true);
  });

  it("reads content with and without a suffix", () => {
    expect(numericInputContentSchema.parse({ stem: "Soru?" })).toEqual({
      stem: "Soru?",
      suffix: undefined,
    });
    expect(
      numericInputContentSchema.parse({ stem: "Soru?", suffix: "yılı" }),
    ).toEqual({ stem: "Soru?", suffix: "yılı" });
  });

  it.each([
    ["a missing value", {}],
    ["a null value", { value: null }],
    ["a non-numeric string", { value: "abc" }],
    ["an empty string", { value: "  " }],
    ["a boolean", { value: true }],
  ])("refuses the unreadable answer key: %s", (_label, answerKey) => {
    expect(
      exerciseDetailResponseSchema.safeParse(numericDetail(answerKey)).success,
    ).toBe(false);
  });

  it.each([
    ["an integer", 375],
    ["zero", 0],
    ["a negative number", -4.5],
    ["a decimal", 0.33],
  ])("accepts the mutation answer %s", (_label, value) => {
    const parsed = createExerciseRequestSchema.parse({
      ...numericEditable,
      answer_key: { value, tolerance: 0 },
      owner_unit_id: 12,
    });
    expect(parsed.answer_key).toEqual({ value, tolerance: 0 });
  });

  it("accepts a positive tolerance and omits an absent suffix", () => {
    const parsed = createExerciseRequestSchema.parse({
      ...numericEditable,
      content: { stem: "Soru?" },
      answer_key: { value: 1, tolerance: 0.01 },
      owner_unit_id: 12,
    });
    expect(parsed.content).toEqual({ stem: "Soru?", suffix: undefined });
    expect(parsed.type).toBe("numeric_input");
    if (parsed.type !== "numeric_input") throw new Error("wrong branch");
    expect(parsed.answer_key.tolerance).toBe(0.01);
  });

  it.each([
    ['a string value "375"', { value: "375", tolerance: 0 }],
    ['a string value "0"', { value: "0", tolerance: 0 }],
    ['a string tolerance "0"', { value: 375, tolerance: "0" }],
    ["a null value", { value: null, tolerance: 0 }],
    ["a missing value", { tolerance: 0 }],
    ["a missing tolerance", { value: 375 }],
    ["a negative tolerance", { value: 375, tolerance: -1 }],
  ])("rejects the mutation answer key with %s", (_label, answerKey) => {
    expect(
      createExerciseRequestSchema.safeParse({
        ...numericEditable,
        answer_key: answerKey,
        owner_unit_id: 12,
      }).success,
    ).toBe(false);
    expect(
      updateExerciseRequestSchema.safeParse({
        ...numericEditable,
        answer_key: answerKey,
      }).success,
    ).toBe(false);
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
  ])("rejects the non-finite mutation answer %s", (_label, value) => {
    expect(
      createExerciseRequestSchema.safeParse({
        ...numericEditable,
        answer_key: { value, tolerance: 0 },
        owner_unit_id: 12,
      }).success,
    ).toBe(false);
  });

  it("strips ownership and lifecycle fields from numeric bodies", () => {
    const create = createExerciseRequestSchema.parse({
      ...numericEditable,
      owner_unit_id: 12,
      owner_course_id: 5,
      id: 77,
      status: "published",
      version: 99,
      stats: {},
    });
    const update = updateExerciseRequestSchema.parse({
      ...numericEditable,
      owner_unit_id: 999,
      status: "archived",
    });

    for (const stripped of [
      "owner_course_id",
      "id",
      "status",
      "version",
      "stats",
    ]) {
      expect(create).not.toHaveProperty(stripped);
    }
    expect(update).not.toHaveProperty("owner_unit_id");
    expect(update).not.toHaveProperty("status");
  });
});

describe("flashcard contracts", () => {
  it("reads a stored card with its answer key", () => {
    const parsed = exerciseDetailResponseSchema.parse(
      validFlashcardDetailResponse,
    );
    expect(parsed.data.content).toEqual({
      front: "Kut",
      back: "Yönetme yetkisinin Tanrı tarafından verildiği inancı.",
    });
  });

  it.each([
    ["a missing self_assessed", {}],
    ["self_assessed true", { self_assessed: true }],
    ["self_assessed false", { self_assessed: false }],
  ])("keeps a stored card readable with %s", (_label, answerKey) => {
    // FlashcardValidator never inspects the answer key, so every one of these
    // is a backend-valid row that must still open.
    expect(
      exerciseDetailResponseSchema.safeParse({
        ...validFlashcardDetailResponse,
        data: { ...validFlashcardDetailResponse.data, answer_key: answerKey },
      }).success,
    ).toBe(true);
  });

  it.each([
    ["a missing front", { back: "Arka" }],
    ["a missing back", { front: "Ön" }],
    ["a non-string face", { front: 7, back: "Arka" }],
  ])("refuses the unreadable content: %s", (_label, content) => {
    expect(
      exerciseDetailResponseSchema.safeParse({
        ...validFlashcardDetailResponse,
        data: { ...validFlashcardDetailResponse.data, content },
      }).success,
    ).toBe(false);
  });

  it.each([
    ["self_assessed false", { self_assessed: false }],
    ["extra keys", { self_assessed: false, other: "x", admin: true }],
    ["an empty object", {}],
  ])(
    "canonicalises the mutation answer key sent as %s",
    (_label, answerKey) => {
      const parsed = createExerciseRequestSchema.parse({
        ...flashcardEditable,
        answer_key: answerKey,
        owner_unit_id: 12,
      });
      expect(parsed.answer_key).toEqual({ self_assessed: true });
    },
  );

  it("strips ownership and lifecycle fields from flashcard bodies", () => {
    const create = createExerciseRequestSchema.parse({
      ...flashcardEditable,
      owner_unit_id: 12,
      id: 77,
      status: "published",
      version: 9,
      stats: {},
    });
    const update = updateExerciseRequestSchema.parse({
      ...flashcardEditable,
      owner_unit_id: 999,
      version: 3,
    });

    expect(create).toMatchObject({ owner_unit_id: 12 });
    for (const stripped of ["id", "status", "version", "stats"]) {
      expect(create).not.toHaveProperty(stripped);
    }
    expect(update).not.toHaveProperty("owner_unit_id");
    expect(update).not.toHaveProperty("version");
  });
});
