import { describe, expect, it } from "vitest";

import {
  createExerciseRequestSchema,
  exerciseDetailResponseSchema,
  matchingAnswerKeyDetailSchema,
  matchingContentSchema,
  orderingAnswerKeySchema,
  orderingContentSchema,
  updateExerciseRequestSchema,
  wordOrderContentSchema,
} from "@/contracts/admin/exercise-editor";
import { validExerciseDetailResponse } from "@/test/fixtures/exercise-editor-api";

const common = {
  topic_id: 1,
  difficulty: 3,
  explanation: null,
  applicable_scopes: ["tyt"],
} as const;

const matching = {
  type: "matching",
  ...common,
  content: {
    left: [
      { id: "1", text: "Kurultay" },
      { id: "2", text: "Kut" },
    ],
    right: [
      { id: "a", text: "Meclis" },
      { id: "b", text: "Yönetme yetkisi" },
    ],
  },
  answer_key: { pairs: { "1": "a", "2": "b" }, partial_credit: false },
} as const;

const ordering = {
  type: "ordering",
  ...common,
  content: {
    instruction: "Eskiden yeniye sırala.",
    items: [
      { id: "1", text: "Göktürkler" },
      { id: "2", text: "Uygurlar" },
    ],
  },
  answer_key: { order: ["1", "2"] },
} as const;

const wordOrder = {
  type: "word_order",
  ...common,
  content: {
    instruction: "Doğru cümleyi oluştur.",
    words: [
      { id: "1", text: "Ben" },
      { id: "2", text: "okula" },
      { id: "3", text: "gittim" },
    ],
  },
  answer_key: { order: ["1", "2", "3"] },
} as const;

/** Both mutation entry points must agree; create adds owner_unit_id. */
function mutationsAccept(body: unknown): boolean {
  const create = createExerciseRequestSchema.safeParse({
    ...(body as object),
    owner_unit_id: 12,
  });
  const update = updateExerciseRequestSchema.safeParse(body);
  expect(create.success).toBe(update.success);
  return create.success;
}

function detailOf(type: string, content: unknown, answerKey: unknown): unknown {
  return {
    ...validExerciseDetailResponse,
    data: {
      ...validExerciseDetailResponse.data,
      type,
      content,
      answer_key: answerKey,
    },
  };
}

describe("matching detail contract", () => {
  it("normalises scalar ids and pair targets to strings", () => {
    const parsed = matchingContentSchema.parse({
      left: [
        { id: 1, text: "A" },
        { id: 2, text: "B" },
      ],
      right: [
        { id: 10, text: "X" },
        { id: 20, text: "Y" },
      ],
    });
    expect(parsed.left.map((item) => item.id)).toEqual(["1", "2"]);

    const key = matchingAnswerKeyDetailSchema.parse({
      pairs: { 1: 10, 2: 20 },
    });
    expect(key.pairs).toEqual({ "1": "10", "2": "20" });
  });

  it("defaults a missing partial_credit to false, mirroring the grader", () => {
    expect(
      matchingAnswerKeyDetailSchema.parse({ pairs: { "1": "a" } })
        .partial_credit,
    ).toBe(false);
  });

  it.each([
    [true, true],
    [false, false],
    [1, true],
    [0, false],
    ["1", true],
    ["0", false],
  ])(
    "reads a stored partial_credit of %p as %p, like PHP's (bool)",
    (stored, expected) => {
      expect(
        matchingAnswerKeyDetailSchema.parse({
          pairs: { "1": "a" },
          partial_credit: stored,
        }).partial_credit,
      ).toBe(expected);
    },
  );

  it("keeps a real seed row readable, instruction and all", () => {
    const parsed = exerciseDetailResponseSchema.parse(
      detailOf("matching", matching.content, {
        pairs: { "1": "a", "2": "b" },
        partial_credit: true,
      }),
    );
    expect(parsed.data.type).toBe("matching");

    expect(
      matchingContentSchema.parse({
        instruction: "Sayıyı kümesiyle eşleştir.",
        ...matching.content,
      }).instruction,
    ).toBe("Sayıyı kümesiyle eşleştir.");
  });

  it("stays readable for a degenerate stored row so it can be repaired", () => {
    // One left item is backend-invalid, but locking the row out of the editor
    // would make it unrepairable. Mutation validation is where it is refused.
    expect(
      exerciseDetailResponseSchema.safeParse(
        detailOf(
          "matching",
          { left: [{ id: "1", text: "" }], right: matching.content.right },
          { pairs: { "1": "a" } },
        ),
      ).success,
    ).toBe(true);
  });

  it("refuses a detail with no pairs map at all", () => {
    expect(
      exerciseDetailResponseSchema.safeParse(
        detailOf("matching", matching.content, { pairs: "nope" }),
      ).success,
    ).toBe(false);
  });
});

describe("matching mutation contract", () => {
  it("accepts a canonical 2x2 body", () => {
    expect(mutationsAccept(matching)).toBe(true);
  });

  it("accepts a 3x4 body", () => {
    expect(
      mutationsAccept({
        ...matching,
        content: {
          left: [
            { id: "1", text: "A" },
            { id: "2", text: "B" },
            { id: "3", text: "C" },
          ],
          right: [
            { id: "a", text: "W" },
            { id: "b", text: "X" },
            { id: "c", text: "Y" },
            { id: "d", text: "Z" },
          ],
        },
        answer_key: {
          pairs: { "1": "a", "2": "c", "3": "d" },
          partial_credit: true,
        },
      }),
    ).toBe(true);
  });

  it.each([[true], [false]])(
    "accepts the explicit boolean partial_credit %p",
    (partial_credit) => {
      expect(
        mutationsAccept({
          ...matching,
          answer_key: { ...matching.answer_key, partial_credit },
        }),
      ).toBe(true);
    },
  );

  it("accepts the same right target used by two left items", () => {
    // The backend deliberately allows this; inventing a one-to-one rule here
    // would reject content the backend considers valid.
    expect(
      mutationsAccept({
        ...matching,
        answer_key: {
          pairs: { "1": "a", "2": "a" },
          partial_credit: false,
        },
      }),
    ).toBe(true);
  });

  it.each([
    [
      "fewer than two left items",
      { content: { ...matching.content, left: [matching.content.left[0]] } },
    ],
    [
      "fewer than two right items",
      { content: { ...matching.content, right: [matching.content.right[0]] } },
    ],
    [
      "blank item text",
      {
        content: {
          ...matching.content,
          left: [{ id: "1", text: " " }, matching.content.left[1]],
        },
      },
    ],
    [
      "duplicate left ids",
      {
        content: {
          ...matching.content,
          left: [
            { id: "1", text: "A" },
            { id: "1", text: "B" },
          ],
        },
      },
    ],
    [
      "duplicate right ids",
      {
        content: {
          ...matching.content,
          right: [
            { id: "a", text: "A" },
            { id: "a", text: "B" },
          ],
        },
      },
    ],
    ["empty pairs", { answer_key: { pairs: {}, partial_credit: false } }],
    [
      "a left item with no pair",
      { answer_key: { pairs: { "1": "a" }, partial_credit: false } },
    ],
    [
      "an unknown left key",
      {
        answer_key: {
          pairs: { "1": "a", "2": "b", "9": "a" },
          partial_credit: false,
        },
      },
    ],
    [
      "an unknown right target",
      {
        answer_key: {
          pairs: { "1": "a", "2": "zzz" },
          partial_credit: false,
        },
      },
    ],
    [
      "a non-boolean partial_credit",
      { answer_key: { pairs: { "1": "a", "2": "b" }, partial_credit: "true" } },
    ],
    [
      "a missing partial_credit",
      { answer_key: { pairs: { "1": "a", "2": "b" } } },
    ],
  ])("rejects %s before any backend call", (_label, override) => {
    expect(mutationsAccept({ ...matching, ...override })).toBe(false);
  });
});

describe("ordering contract", () => {
  it("parses detail content and the answer order", () => {
    expect(orderingContentSchema.parse(ordering.content).items).toHaveLength(2);
    expect(orderingAnswerKeySchema.parse({ order: [1, 2] }).order).toEqual([
      "1",
      "2",
    ]);
  });

  it("accepts two and more than two items", () => {
    expect(mutationsAccept(ordering)).toBe(true);
    expect(
      mutationsAccept({
        ...ordering,
        content: {
          instruction: "Sırala.",
          items: [
            { id: "1", text: "A" },
            { id: "2", text: "B" },
            { id: "3", text: "C" },
          ],
        },
        answer_key: { order: ["3", "1", "2"] },
      }),
    ).toBe(true);
  });

  it.each([
    [
      "a blank instruction",
      { content: { ...ordering.content, instruction: " " } },
    ],
    [
      "blank item text",
      {
        content: {
          ...ordering.content,
          items: [{ id: "1", text: "" }, ordering.content.items[1]],
        },
      },
    ],
    [
      "duplicate item ids",
      {
        content: {
          ...ordering.content,
          items: [
            { id: "1", text: "A" },
            { id: "1", text: "B" },
          ],
        },
      },
    ],
    [
      "fewer than two items",
      { content: { ...ordering.content, items: [ordering.content.items[0]] } },
    ],
    ["a missing id in the order", { answer_key: { order: ["1"] } }],
    ["a duplicated id in the order", { answer_key: { order: ["1", "1"] } }],
    ["an unknown id in the order", { answer_key: { order: ["1", "x"] } }],
    ["an extra id in the order", { answer_key: { order: ["1", "2", "3"] } }],
    [
      "a word_order-shaped content body",
      { content: { instruction: "Sırala.", words: ordering.content.items } },
    ],
  ])("rejects %s", (_label, override) => {
    expect(mutationsAccept({ ...ordering, ...override })).toBe(false);
  });
});

describe("word order contract", () => {
  it("parses detail content keyed on words", () => {
    expect(wordOrderContentSchema.parse(wordOrder.content).words).toHaveLength(
      3,
    );
    expect(
      wordOrderContentSchema.safeParse({
        instruction: "x",
        items: wordOrder.content.words,
      }).success,
    ).toBe(false);
  });

  it("accepts a canonical body", () => {
    expect(mutationsAccept(wordOrder)).toBe(true);
  });

  it.each([
    [
      "a blank instruction",
      { content: { ...wordOrder.content, instruction: "" } },
    ],
    [
      "fewer than two words",
      {
        content: { ...wordOrder.content, words: [wordOrder.content.words[0]] },
        answer_key: { order: ["1"] },
      },
    ],
    [
      "blank word text",
      {
        content: {
          ...wordOrder.content,
          words: [{ id: "1", text: " " }, ...wordOrder.content.words.slice(1)],
        },
      },
    ],
    [
      "duplicate word ids",
      {
        content: {
          ...wordOrder.content,
          words: [
            { id: "1", text: "A" },
            { id: "1", text: "B" },
          ],
        },
        answer_key: { order: ["1", "1"] },
      },
    ],
    ["a missing id in the order", { answer_key: { order: ["1", "2"] } }],
    [
      "a duplicated id in the order",
      { answer_key: { order: ["1", "2", "2"] } },
    ],
    ["an unknown id in the order", { answer_key: { order: ["1", "2", "x"] } }],
    [
      "an extra id in the order",
      { answer_key: { order: ["1", "2", "3", "4"] } },
    ],
    [
      "an ordering-shaped content body",
      {
        content: { instruction: "Cümle kur.", items: wordOrder.content.words },
      },
    ],
  ])("rejects %s", (_label, override) => {
    expect(mutationsAccept({ ...wordOrder, ...override })).toBe(false);
  });
});

describe("mutation union stays at eight types", () => {
  it("still refuses the two media types with a well-formed structured body", () => {
    for (const type of ["image_hotspot", "diagram_label"]) {
      expect(mutationsAccept({ ...ordering, type })).toBe(false);
    }
  });

  it("strips owner_unit_id from an update and id/status from a create", () => {
    const create = createExerciseRequestSchema.parse({
      ...matching,
      owner_unit_id: 12,
      id: 5,
      status: "published",
      version: 9,
      owner_course_id: 3,
    });
    const update = updateExerciseRequestSchema.parse({
      ...wordOrder,
      owner_unit_id: 99,
      id: 7,
      status: "archived",
    });

    expect(create).toMatchObject({ owner_unit_id: 12 });
    expect(create).not.toHaveProperty("id");
    expect(create).not.toHaveProperty("status");
    expect(create).not.toHaveProperty("version");
    expect(create).not.toHaveProperty("owner_course_id");
    expect(update).not.toHaveProperty("owner_unit_id");
    expect(update).not.toHaveProperty("id");
    expect(update).not.toHaveProperty("status");
  });
});
