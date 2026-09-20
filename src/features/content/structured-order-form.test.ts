import { describe, expect, it } from "vitest";

import type { ExerciseDetail } from "@/contracts/admin/exercise-editor";
import {
  createOrderingBranch,
  orderingBranchFromDetail,
  serializeOrderingBranch,
  strictOrderingBranchSchema,
} from "@/features/content/ordering-form";
import {
  createWordOrderBranch,
  serializeWordOrderBranch,
  strictWordOrderBranchSchema,
  wordOrderBranchFromDetail,
} from "@/features/content/word-order-form";
import type { StructuredOrderBranchValues } from "@/features/content/structured-order-form";
import { nextStructuredOrderItemId } from "@/features/content/structured-order-form";

const complete: StructuredOrderBranchValues = {
  instruction: "Eskiden yeniye sırala.",
  items: [
    { id: "1", text: "Göktürkler" },
    { id: "2", text: "Uygurlar" },
  ],
  order: ["1", "2"],
};

function detailOf(
  type: "ordering" | "word_order",
  content: unknown,
  answerKey: unknown,
): ExerciseDetail {
  return {
    id: 1,
    type,
    topic_id: 1,
    difficulty: 3,
    content: content as Record<string, unknown>,
    answer_key: answerKey as Record<string, unknown>,
    explanation: null,
    applicable_scopes: ["tyt"],
    status: "draft",
    version: 1,
    stats: {
      attempts: 0,
      correct_rate: null,
      avg_seconds: null,
      needs_review: false,
    },
  };
}

describe.each([
  ["ordering", createOrderingBranch, strictOrderingBranchSchema],
  ["word_order", createWordOrderBranch, strictWordOrderBranchSchema],
] as const)("%s branch lifecycle", (_type, create, strict) => {
  it("starts with two blank rows whose ids are already in the answer order", () => {
    const branch = create();

    expect(branch.items).toEqual([
      { id: "1", text: "" },
      { id: "2", text: "" },
    ]);
    // The answer key is structurally complete from the start; it is the blank
    // instruction and text that keep the form invalid.
    expect(branch.order).toEqual(["1", "2"]);
    expect(strict.safeParse(branch).success).toBe(false);
  });

  it("accepts a complete question and any permutation of its ids", () => {
    expect(strict.safeParse(complete).success).toBe(true);
    expect(strict.safeParse({ ...complete, order: ["2", "1"] }).success).toBe(
      true,
    );
  });

  it("accepts more than two rows", () => {
    expect(
      strict.safeParse({
        instruction: "Sırala.",
        items: [
          { id: "1", text: "A" },
          { id: "2", text: "B" },
          { id: "3", text: "C" },
        ],
        order: ["3", "1", "2"],
      }).success,
    ).toBe(true);
  });

  it.each([
    ["a blank instruction", { instruction: "  " }],
    ["a single row", { items: [complete.items[0]], order: ["1"] }],
    ["blank row text", { items: [{ id: "1", text: " " }, complete.items[1]] }],
    [
      "duplicate ids",
      {
        items: [
          { id: "1", text: "A" },
          { id: "1", text: "B" },
        ],
      },
    ],
    ["a missing id in the order", { order: ["1"] }],
    ["a duplicated id in the order", { order: ["1", "1"] }],
    ["an unknown id in the order", { order: ["1", "x"] }],
    ["an extra id in the order", { order: ["1", "2", "3"] }],
  ])("rejects %s", (_label, override) => {
    expect(strict.safeParse({ ...complete, ...override }).success).toBe(false);
  });
});

describe("nextStructuredOrderItemId", () => {
  it("issues a fresh numeric id and never reuses a live one", () => {
    expect(nextStructuredOrderItemId(["1", "2"])).toBe("3");
    expect(nextStructuredOrderItemId(["1", "3"])).toBe("2");
  });
});

describe("orderingBranchFromDetail", () => {
  it("preserves arbitrary backend ids and an answer order that differs from the content list", () => {
    const branch = orderingBranchFromDetail(
      detailOf(
        "ordering",
        {
          instruction: "Sırala.",
          items: [
            { id: "alpha", text: "A" },
            { id: "beta", text: "B" },
            { id: "gamma", text: "C" },
          ],
        },
        { order: ["gamma", "alpha", "beta"] },
      ),
    );

    expect(branch?.items.map((item) => item.id)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
    expect(branch?.order).toEqual(["gamma", "alpha", "beta"]);
  });

  it("normalises scalar backend ids to strings", () => {
    const branch = orderingBranchFromDetail(
      detailOf(
        "ordering",
        {
          instruction: "Sırala.",
          items: [
            { id: 1, text: "A" },
            { id: 2, text: "B" },
          ],
        },
        { order: [2, 1] },
      ),
    );

    expect(branch?.items.map((item) => item.id)).toEqual(["1", "2"]);
    expect(branch?.order).toEqual(["2", "1"]);
  });

  it("refuses a word_order body: ordering needs items, not words", () => {
    expect(
      orderingBranchFromDetail(
        detailOf(
          "ordering",
          {
            instruction: "Sırala.",
            words: [
              { id: "1", text: "A" },
              { id: "2", text: "B" },
            ],
          },
          { order: ["1", "2"] },
        ),
      ),
    ).toBeNull();
  });
});

describe("wordOrderBranchFromDetail", () => {
  it("hydrates from content.words", () => {
    const branch = wordOrderBranchFromDetail(
      detailOf(
        "word_order",
        {
          instruction: "Cümle kur.",
          words: [
            { id: "1", text: "Ben" },
            { id: "2", text: "okula" },
            { id: "3", text: "gittim" },
          ],
        },
        { order: ["1", "2", "3"] },
      ),
    );

    expect(branch?.items.map((item) => item.text)).toEqual([
      "Ben",
      "okula",
      "gittim",
    ]);
  });

  it("refuses an ordering body: word_order needs words, not items", () => {
    expect(
      wordOrderBranchFromDetail(
        detailOf(
          "word_order",
          {
            instruction: "Cümle kur.",
            items: [
              { id: "1", text: "A" },
              { id: "2", text: "B" },
            ],
          },
          { order: ["1", "2"] },
        ),
      ),
    ).toBeNull();
  });
});

describe("serialization keeps the two backend keys apart", () => {
  it("ordering writes content.items", () => {
    expect(serializeOrderingBranch(complete)).toEqual({
      type: "ordering",
      content: {
        instruction: "Eskiden yeniye sırala.",
        items: [
          { id: "1", text: "Göktürkler" },
          { id: "2", text: "Uygurlar" },
        ],
      },
      answer_key: { order: ["1", "2"] },
    });
  });

  it("word_order writes content.words", () => {
    const payload = serializeWordOrderBranch({
      instruction: "Doğru cümleyi oluştur.",
      items: [
        { id: "1", text: "Ben" },
        { id: "2", text: "okula" },
        { id: "3", text: "gittim" },
      ],
      order: ["1", "2", "3"],
    });

    expect(payload).toEqual({
      type: "word_order",
      content: {
        instruction: "Doğru cümleyi oluştur.",
        words: [
          { id: "1", text: "Ben" },
          { id: "2", text: "okula" },
          { id: "3", text: "gittim" },
        ],
      },
      answer_key: { order: ["1", "2", "3"] },
    });
    expect(payload.content).not.toHaveProperty("items");
  });

  it("keeps the answer order independent of the content list order", () => {
    const payload = serializeOrderingBranch({ ...complete, order: ["2", "1"] });
    expect(payload.content.items.map((item) => item.id)).toEqual(["1", "2"]);
    expect(payload.answer_key.order).toEqual(["2", "1"]);
  });

  it("trims text and the instruction without touching ids", () => {
    const payload = serializeOrderingBranch({
      instruction: "  Sırala.  ",
      items: [
        { id: "alpha", text: "  A  " },
        { id: "beta", text: "B" },
      ],
      order: ["alpha", "beta"],
    });

    expect(payload.content.instruction).toBe("Sırala.");
    expect(payload.content.items[0]).toEqual({ id: "alpha", text: "A" });
  });

  it("refuses to serialize an order that is not an exact permutation", () => {
    expect(() =>
      serializeOrderingBranch({ ...complete, order: ["1"] }),
    ).toThrow(TypeError);
    expect(() =>
      serializeWordOrderBranch({ ...complete, order: ["1", "1"] }),
    ).toThrow(TypeError);
  });
});
