import {
  orderingAnswerKeySchema,
  orderingContentSchema,
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

export const orderingBranchSchema = structuredOrderBranchSchema;

export type OrderingBranchValues = StructuredOrderBranchValues;

export const strictOrderingBranchSchema = makeStrictStructuredOrderSchema({
  instruction: "Yönerge boş olamaz.",
  minItems: "En az iki öğe bulunmalıdır.",
  itemText: "Öğe metni boş olamaz.",
  duplicateIds: "Öğe kimlikleri benzersiz olmalıdır.",
});

export function createOrderingBranch(): OrderingBranchValues {
  return createStructuredOrderBranch();
}

export function orderingBranchFromDetail(
  detail: ExerciseDetail,
): OrderingBranchValues | null {
  const content = orderingContentSchema.safeParse(detail.content);
  const answerKey = orderingAnswerKeySchema.safeParse(detail.answer_key);
  if (!content.success || !answerKey.success) return null;

  return structuredOrderBranchFromParsed(
    content.data.instruction,
    content.data.items,
    answerKey.data.order,
  );
}

/** Ordering's content list is keyed `items` — never `words`. */
export function serializeOrderingBranch(branch: OrderingBranchValues) {
  const { instruction, items, order } = serializeStructuredOrderBranch(branch);

  return {
    type: "ordering" as const,
    content: { instruction, items },
    answer_key: { order },
  };
}
