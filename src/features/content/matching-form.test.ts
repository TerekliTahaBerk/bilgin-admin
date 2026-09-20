import { describe, expect, it } from "vitest";

import type { ExerciseDetail } from "@/contracts/admin/exercise-editor";
import {
  createMatchingBranch,
  matchingBranchFromDetail,
  nextLeftId,
  nextRightId,
  pairsAfterLeftAdded,
  pairsAfterLeftRemoval,
  pairsAfterRightRemoval,
  serializeMatchingBranch,
  strictMatchingBranchSchema,
  type MatchingBranchValues,
} from "@/features/content/matching-form";

const complete: MatchingBranchValues = {
  instruction: "",
  left: [
    { id: "1", text: "Kurultay" },
    { id: "2", text: "Kut" },
  ],
  right: [
    { id: "a", text: "Meclis" },
    { id: "b", text: "Yönetme yetkisi" },
  ],
  pairs: [
    { leftId: "1", rightId: "a" },
    { leftId: "2", rightId: "b" },
  ],
  partialCredit: false,
};

function detailOf(content: unknown, answerKey: unknown): ExerciseDetail {
  return {
    id: 1,
    type: "matching",
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

describe("createMatchingBranch", () => {
  it("starts with two unique left rows, two unique right rows and no selection", () => {
    const branch = createMatchingBranch();

    expect(branch.left).toEqual([
      { id: "1", text: "" },
      { id: "2", text: "" },
    ]);
    expect(branch.right).toEqual([
      { id: "a", text: "" },
      { id: "b", text: "" },
    ]);
    expect(branch.pairs).toEqual([
      { leftId: "1", rightId: "" },
      { leftId: "2", rightId: "" },
    ]);
    expect(branch.partialCredit).toBe(false);
  });

  it("is invalid until the author fills it in", () => {
    expect(
      strictMatchingBranchSchema.safeParse(createMatchingBranch()).success,
    ).toBe(false);
  });
});

describe("matching pair helpers", () => {
  it("gives a newly added left row an empty selection", () => {
    const pairs = pairsAfterLeftAdded(complete.pairs, "3");
    expect(pairs).toContainEqual({ leftId: "3", rightId: "" });
    expect(pairs).toHaveLength(3);
  });

  it("never adds a second row for a left id it already has", () => {
    expect(pairsAfterLeftAdded(complete.pairs, "1")).toEqual(complete.pairs);
  });

  it("removes exactly the deleted left row's pair", () => {
    expect(pairsAfterLeftRemoval(complete.pairs, "1")).toEqual([
      { leftId: "2", rightId: "b" },
    ]);
  });

  it("leaves pairs untouched when an unused right item is removed", () => {
    const withSpare = [...complete.right, { id: "c", text: "Boş" }];
    const branch = { ...complete, right: withSpare };
    expect(pairsAfterRightRemoval(branch.pairs, "c")).toEqual(complete.pairs);
  });

  it("clears — never re-points — a selection whose right item is removed", () => {
    expect(pairsAfterRightRemoval(complete.pairs, "a")).toEqual([
      { leftId: "1", rightId: "" },
      { leftId: "2", rightId: "b" },
    ]);
  });

  it("clears every selection pointing at the removed right item", () => {
    const shared = [
      { leftId: "1", rightId: "a" },
      { leftId: "2", rightId: "a" },
    ];
    expect(pairsAfterRightRemoval(shared, "a")).toEqual([
      { leftId: "1", rightId: "" },
      { leftId: "2", rightId: "" },
    ]);
  });

  it("never mutates the pairs it is given", () => {
    const pairs = complete.pairs.map((pair) => ({ ...pair }));
    pairsAfterRightRemoval(pairs, "a");
    pairsAfterLeftRemoval(pairs, "1");
    pairsAfterLeftAdded(pairs, "3");
    expect(pairs).toEqual(complete.pairs);
  });

  it("issues fresh ids in each column's own style", () => {
    expect(nextLeftId(["1", "2"])).toBe("3");
    expect(nextRightId(["a", "b"])).toBe("c");
  });
});

describe("strictMatchingBranchSchema", () => {
  it("accepts a complete 2x2 question", () => {
    expect(strictMatchingBranchSchema.safeParse(complete).success).toBe(true);
  });

  it("accepts the same right item selected by two left rows", () => {
    // MatchingValidator has no one-to-one restriction, so neither may this.
    expect(
      strictMatchingBranchSchema.safeParse({
        ...complete,
        pairs: [
          { leftId: "1", rightId: "a" },
          { leftId: "2", rightId: "a" },
        ],
      }).success,
    ).toBe(true);
  });

  it.each([
    ["a single left row", { left: [complete.left[0]] }],
    ["a single right row", { right: [complete.right[0]] }],
    ["blank left text", { left: [{ id: "1", text: " " }, complete.left[1]] }],
    ["blank right text", { right: [{ id: "a", text: "" }, complete.right[1]] }],
    [
      "duplicate left ids",
      {
        left: [
          { id: "1", text: "A" },
          { id: "1", text: "B" },
        ],
      },
    ],
    [
      "duplicate right ids",
      {
        right: [
          { id: "a", text: "A" },
          { id: "a", text: "B" },
        ],
      },
    ],
    ["no pairs at all", { pairs: [] }],
    [
      "an unselected pair",
      { pairs: [{ leftId: "1", rightId: "" }, complete.pairs[1]] },
    ],
    [
      "a pair pointing at an unknown right item",
      { pairs: [{ leftId: "1", rightId: "zzz" }, complete.pairs[1]] },
    ],
    [
      "a pair keyed on an unknown left item",
      { pairs: [...complete.pairs, { leftId: "zzz", rightId: "a" }] },
    ],
  ])("rejects %s", (_label, override) => {
    expect(
      strictMatchingBranchSchema.safeParse({ ...complete, ...override })
        .success,
    ).toBe(false);
  });
});

describe("matchingBranchFromDetail", () => {
  it("preserves backend ids, texts, pairs and partial credit", () => {
    const branch = matchingBranchFromDetail(
      detailOf(
        {
          instruction: "Eşleştir.",
          left: [
            { id: "x", text: "Kurultay" },
            { id: "y", text: "Kut" },
          ],
          right: [
            { id: "p", text: "Meclis" },
            { id: "q", text: "Yetki" },
          ],
        },
        { pairs: { x: "p", y: "q" }, partial_credit: true },
      ),
    );

    expect(branch).toEqual({
      instruction: "Eşleştir.",
      left: [
        { id: "x", text: "Kurultay" },
        { id: "y", text: "Kut" },
      ],
      right: [
        { id: "p", text: "Meclis" },
        { id: "q", text: "Yetki" },
      ],
      pairs: [
        { leftId: "x", rightId: "p" },
        { leftId: "y", rightId: "q" },
      ],
      partialCredit: true,
    });
  });

  it("normalises a scalar backend id to a string", () => {
    const branch = matchingBranchFromDetail(
      detailOf(
        {
          left: [
            { id: 1, text: "A" },
            { id: 2, text: "B" },
          ],
          right: [
            { id: 10, text: "X" },
            { id: 20, text: "Y" },
          ],
        },
        { pairs: { 1: 10, 2: 20 } },
      ),
    );

    expect(branch?.left.map((item) => item.id)).toEqual(["1", "2"]);
    expect(branch?.pairs).toEqual([
      { leftId: "1", rightId: "10" },
      { leftId: "2", rightId: "20" },
    ]);
  });

  it("reads a missing partial_credit as the backend grader does: false", () => {
    const branch = matchingBranchFromDetail(
      detailOf(
        {
          left: [
            { id: "1", text: "A" },
            { id: "2", text: "B" },
          ],
          right: [
            { id: "a", text: "X" },
            { id: "b", text: "Y" },
          ],
        },
        { pairs: { 1: "a", 2: "b" } },
      ),
    );

    expect(branch?.partialCredit).toBe(false);
  });

  it("opens a left item with no stored pair as an unselected row", () => {
    const branch = matchingBranchFromDetail(
      detailOf(
        {
          left: [
            { id: "1", text: "A" },
            { id: "2", text: "B" },
          ],
          right: [
            { id: "a", text: "X" },
            { id: "b", text: "Y" },
          ],
        },
        { pairs: { 1: "a" } },
      ),
    );

    expect(branch?.pairs).toEqual([
      { leftId: "1", rightId: "a" },
      { leftId: "2", rightId: "" },
    ]);
  });

  it("returns null for a shape it cannot serialize back", () => {
    expect(matchingBranchFromDetail(detailOf({ left: [] }, {}))).toBeNull();
  });
});

describe("serializeMatchingBranch", () => {
  it("emits the canonical backend shape with an explicit boolean", () => {
    expect(serializeMatchingBranch(complete)).toEqual({
      type: "matching",
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
      answer_key: {
        pairs: { "1": "a", "2": "b" },
        partial_credit: false,
      },
    });
  });

  it("emits partial_credit true when the author turned it on", () => {
    const payload = serializeMatchingBranch({
      ...complete,
      partialCredit: true,
    });
    expect(payload.answer_key.partial_credit).toBe(true);
  });

  it("round-trips an instruction and omits an empty one", () => {
    expect(
      serializeMatchingBranch({ ...complete, instruction: " Eşleştir. " })
        .content,
    ).toMatchObject({ instruction: "Eşleştir." });
    expect(serializeMatchingBranch(complete).content).not.toHaveProperty(
      "instruction",
    );
  });

  it("trims item text without touching ids", () => {
    const payload = serializeMatchingBranch({
      ...complete,
      left: [
        { id: "1", text: "  Kurultay  " },
        { id: "2", text: "Kut" },
      ],
    });
    expect(payload.content.left[0]).toEqual({ id: "1", text: "Kurultay" });
  });

  it("refuses to serialize an unselected pair rather than inventing one", () => {
    expect(() =>
      serializeMatchingBranch({
        ...complete,
        pairs: [{ leftId: "1", rightId: "" }, complete.pairs[1]],
      }),
    ).toThrow(TypeError);
  });
});
