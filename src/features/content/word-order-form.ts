import {
  wordOrderAnswerKeySchema,
  wordOrderContentSchema,
  type ExerciseDetail,
} from "@/contracts/admin/exercise-editor";
import {
  createStructuredOrderBranch,
  makeStrictStructuredOrderSchema,
  serializeStructuredOrderBranch,
  structuredOrderBranchFromParsed,
  structuredOrderBranchSchema,
  type StructuredOrderBranchValues,
} from "@/features/content/structured-order-form";

export const wordOrderBranchSchema = structuredOrderBranchSchema;

export type WordOrderBranchValues = StructuredOrderBranchValues;

export const strictWordOrderBranchSchema = makeStrictStructuredOrderSchema({
  instruction: "Yönerge boş olamaz.",
  minItems: "En az iki kelime bulunmalıdır.",
  itemText: "Kelime boş olamaz.",
  duplicateIds: "Kelime kimlikleri benzersiz olmalıdır.",
});

export function createWordOrderBranch(): WordOrderBranchValues {
  return createStructuredOrderBranch();
}

export function wordOrderBranchFromDetail(
  detail: ExerciseDetail,
): WordOrderBranchValues | null {
  const content = wordOrderContentSchema.safeParse(detail.content);
  const answerKey = wordOrderAnswerKeySchema.safeParse(detail.answer_key);
  if (!content.success || !answerKey.success) return null;

  return structuredOrderBranchFromParsed(
    content.data.instruction,
    content.data.words,
    answerKey.data.order,
  );
}

/**
 * Word order's content list is keyed `words` — never `items`. The branch field
 * is called `items` because the authoring lifecycle is shared; this function is
 * the single place the backend key is decided, and the contract schema rejects
 * an `items` body for this type outright.
 */
export function serializeWordOrderBranch(branch: WordOrderBranchValues) {
  const { instruction, items, order } = serializeStructuredOrderBranch(branch);

  return {
    type: "word_order" as const,
    content: { instruction, words: items },
    answer_key: { order },
  };
}
