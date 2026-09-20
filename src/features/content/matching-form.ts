import { z } from "zod";

import {
  matchingAnswerKeyDetailSchema,
  matchingContentSchema,
  type ExerciseDetail,
} from "@/contracts/admin/exercise-editor";
import {
  hasUniqueIds,
  nextStructuredItemId,
} from "@/lib/content/structured-items";

const itemShapeSchema = z.object({ id: z.string(), text: z.string() });

/**
 * Shape-only schema for the matching branch — see the note on
 * multipleChoiceBranchSchema for why the rules live in the strict schema.
 *
 * `pairs` is a list rather than a map because react-hook-form arrays are
 * ordered and stable, and because an unselected pair has to be representable:
 * a left row with an empty rightId is a question the author has not finished,
 * not a question with a missing key.
 */
export const matchingBranchSchema = z.object({
  instruction: z.string(),
  left: z.array(itemShapeSchema),
  right: z.array(itemShapeSchema),
  pairs: z.array(z.object({ leftId: z.string(), rightId: z.string() })),
  partialCredit: z.boolean(),
});

export type MatchingBranchValues = z.input<typeof matchingBranchSchema>;
export type MatchingPair = MatchingBranchValues["pairs"][number];

const itemFormSchema = z.object({
  id: z.string().trim().min(1, "Öğe kimliği boş olamaz."),
  text: z.string().trim().min(1, "Öğe metni boş olamaz."),
});

export const strictMatchingBranchSchema = z
  .object({
    instruction: z.string(),
    left: z.array(itemFormSchema).min(2, "Sol sütunda en az iki öğe olmalı."),
    right: z.array(itemFormSchema).min(2, "Sağ sütunda en az iki öğe olmalı."),
    pairs: z.array(
      z.object({
        leftId: z.string().trim().min(1),
        rightId: z.string(),
      }),
    ),
    partialCredit: z.boolean(),
  })
  .superRefine((value, context) => {
    const leftIds = value.left.map((item) => item.id);
    const rightIds = value.right.map((item) => item.id);

    if (!hasUniqueIds(leftIds)) {
      context.addIssue({
        code: "custom",
        path: ["left"],
        message: "Sol sütun kimlikleri benzersiz olmalıdır.",
      });
    }

    if (!hasUniqueIds(rightIds)) {
      context.addIssue({
        code: "custom",
        path: ["right"],
        message: "Sağ sütun kimlikleri benzersiz olmalıdır.",
      });
    }

    for (const id of leftIds) {
      const pairIndex = value.pairs.findIndex((pair) => pair.leftId === id);

      if (pairIndex === -1) {
        context.addIssue({
          code: "custom",
          path: ["pairs"],
          message: "Her sol öğe için bir eşleşme seçilmelidir.",
        });
        continue;
      }

      const rightId = value.pairs[pairIndex].rightId;

      // An unselected pair and a pair pointing at a removed right item are the
      // same author-facing problem, and both are reported on the row itself.
      if (rightId.length === 0 || !rightIds.includes(rightId)) {
        context.addIssue({
          code: "custom",
          path: ["pairs", pairIndex, "rightId"],
          message: "Eşleşecek sağ öğeyi seçin.",
        });
      }
    }

    for (const [index, pair] of value.pairs.entries()) {
      if (!leftIds.includes(pair.leftId)) {
        context.addIssue({
          code: "custom",
          path: ["pairs", index, "rightId"],
          message: `Eşleşmede tanımsız sol öğe: '${pair.leftId}'.`,
        });
      }
    }
  });

const INITIAL_LEFT_IDS = ["1", "2"] as const;
const INITIAL_RIGHT_IDS = ["a", "b"] as const;

export function createMatchingBranch(): MatchingBranchValues {
  return {
    instruction: "",
    left: INITIAL_LEFT_IDS.map((id) => ({ id, text: "" })),
    right: INITIAL_RIGHT_IDS.map((id) => ({ id, text: "" })),
    // Selections start empty on purpose: a default mapping would look like an
    // authored answer the author never chose.
    pairs: INITIAL_LEFT_IDS.map((id) => ({ leftId: id, rightId: "" })),
    partialCredit: false,
  };
}

export function nextLeftId(existingIds: readonly string[]): string {
  return nextStructuredItemId(existingIds, "numeric");
}

export function nextRightId(existingIds: readonly string[]): string {
  return nextStructuredItemId(existingIds, "letter");
}

/** A new left row arrives with no selection; the form stays invalid until set. */
export function pairsAfterLeftAdded(
  pairs: readonly MatchingPair[],
  leftId: string,
): MatchingPair[] {
  return pairs.some((pair) => pair.leftId === leftId)
    ? pairs.map((pair) => ({ ...pair }))
    : [...pairs.map((pair) => ({ ...pair })), { leftId, rightId: "" }];
}

/** Removing a left row removes exactly its pair; no other row is touched. */
export function pairsAfterLeftRemoval(
  pairs: readonly MatchingPair[],
  leftId: string,
): MatchingPair[] {
  return pairs
    .filter((pair) => pair.leftId !== leftId)
    .map((pair) => ({ ...pair }));
}

/**
 * Removing a right item clears every selection that pointed at it rather than
 * silently re-mapping them to a neighbour — a silently changed answer key is
 * the one failure mode an editor must never have. The form becomes invalid and
 * the author re-picks.
 */
export function pairsAfterRightRemoval(
  pairs: readonly MatchingPair[],
  rightId: string,
): MatchingPair[] {
  return pairs.map((pair) => ({
    leftId: pair.leftId,
    rightId: pair.rightId === rightId ? "" : pair.rightId,
  }));
}

export function matchingBranchFromDetail(
  detail: ExerciseDetail,
): MatchingBranchValues | null {
  const content = matchingContentSchema.safeParse(detail.content);
  const answerKey = matchingAnswerKeyDetailSchema.safeParse(detail.answer_key);
  if (!content.success || !answerKey.success) return null;

  const pairs = answerKey.data.pairs;

  return {
    instruction: content.data.instruction ?? "",
    left: content.data.left.map((item) => ({ ...item })),
    right: content.data.right.map((item) => ({ ...item })),
    // One row per left item, in left order: a stored pair for an unknown left
    // id is not an editable row, and a left id with no stored pair opens as an
    // unselected row the author has to complete.
    pairs: content.data.left.map((item) => ({
      leftId: item.id,
      rightId: pairs[item.id] ?? "",
    })),
    partialCredit: answerKey.data.partial_credit,
  };
}

export function serializeMatchingBranch(branch: MatchingBranchValues) {
  const pairs: Record<string, string> = {};

  for (const item of branch.left) {
    const pair = branch.pairs.find((entry) => entry.leftId === item.id);

    if (pair === undefined || pair.rightId.length === 0) {
      throw new TypeError(
        "Every left item needs a selected pair before serialization.",
      );
    }

    pairs[item.id] = pair.rightId;
  }

  const instruction = branch.instruction.trim();

  return {
    type: "matching" as const,
    content: {
      // Omitted when empty, exactly like the numeric suffix: the backend never
      // requires it, so an absent instruction stays absent.
      ...(instruction.length === 0 ? {} : { instruction }),
      left: branch.left.map((item) => ({
        id: item.id,
        text: item.text.trim(),
      })),
      right: branch.right.map((item) => ({
        id: item.id,
        text: item.text.trim(),
      })),
    },
    answer_key: { pairs, partial_credit: branch.partialCredit },
  };
}
