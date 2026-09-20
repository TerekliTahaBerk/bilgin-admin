import { z } from "zod";

import {
  hasUniqueIds,
  isExactIdPermutation,
  nextStructuredItemId,
} from "@/lib/content/structured-items";

/**
 * Ordering and word order are the same authoring concept — an instruction, a
 * collection of {id, text} rows and a correct order over their ids — so they
 * share this branch shape and its rules. What they must never share is the
 * backend key: each type's own module owns `items` vs `words` on the way in
 * and on the way out.
 *
 * Note the two separate concepts kept apart here: `items` is the authoring
 * collection, `order` is the correct answer. Reordering the answer never
 * touches the collection, and the backend contract separates them too.
 */
const itemShapeSchema = z.object({ id: z.string(), text: z.string() });

export const structuredOrderBranchSchema = z.object({
  instruction: z.string(),
  items: z.array(itemShapeSchema),
  order: z.array(z.string()),
});

export type StructuredOrderBranchValues = z.input<
  typeof structuredOrderBranchSchema
>;

export type StructuredOrderMessages = Readonly<{
  instruction: string;
  minItems: string;
  itemText: string;
  duplicateIds: string;
}>;

export function makeStrictStructuredOrderSchema(
  messages: StructuredOrderMessages,
) {
  return z
    .object({
      instruction: z.string().trim().min(1, messages.instruction),
      items: z
        .array(
          z.object({
            id: z.string().trim().min(1, "Öğe kimliği boş olamaz."),
            text: z.string().trim().min(1, messages.itemText),
          }),
        )
        .min(2, messages.minItems),
      order: z.array(z.string()),
    })
    .superRefine((value, context) => {
      const ids = value.items.map((item) => item.id);

      if (!hasUniqueIds(ids)) {
        context.addIssue({
          code: "custom",
          path: ["items"],
          message: messages.duplicateIds,
        });
      }

      if (!isExactIdPermutation(value.order, ids)) {
        context.addIssue({
          code: "custom",
          path: ["order"],
          message: "Doğru sıra, öğelerin hepsini tam olarak bir kez içermeli.",
        });
      }
    });
}

const INITIAL_IDS = ["1", "2"] as const;

export function createStructuredOrderBranch(): StructuredOrderBranchValues {
  return {
    instruction: "",
    items: INITIAL_IDS.map((id) => ({ id, text: "" })),
    // The order is structurally complete from the start — it is the item text
    // and the instruction that keep a fresh question invalid, never a
    // half-built answer key.
    order: [...INITIAL_IDS],
  };
}

export function nextStructuredOrderItemId(
  existingIds: readonly string[],
): string {
  return nextStructuredItemId(existingIds, "numeric");
}

/**
 * Hydrates a branch from already-parsed detail content. Ids arrive exactly as
 * the backend stored them (after scalar normalisation) and are never rewritten,
 * so a round-trip through the editor preserves them byte for byte.
 */
export function structuredOrderBranchFromParsed(
  instruction: string,
  items: readonly { id: string; text: string }[],
  order: readonly string[],
): StructuredOrderBranchValues {
  return {
    instruction,
    items: items.map((item) => ({ ...item })),
    order: [...order],
  };
}

export function serializeStructuredOrderBranch(
  branch: StructuredOrderBranchValues,
) {
  const items = branch.items.map((item) => ({
    id: item.id,
    text: item.text.trim(),
  }));

  if (
    !isExactIdPermutation(
      branch.order,
      items.map((item) => item.id),
    )
  ) {
    throw new TypeError(
      "The answer order must be an exact permutation before serialization.",
    );
  }

  return {
    instruction: branch.instruction.trim(),
    items,
    order: [...branch.order],
  };
}
