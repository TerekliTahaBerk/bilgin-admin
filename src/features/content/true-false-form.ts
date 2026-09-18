import { z } from "zod";

import {
  trueFalseAnswerKeySchema,
  trueFalseContentSchema,
  type ExerciseDetail,
} from "@/contracts/admin/exercise-editor";

/**
 * Shape-only schema for the true/false branch — see the note on
 * multipleChoiceBranchSchema for why the rules live in the strict schema.
 *
 * answerValue is nullable on purpose: an unanswered question must be
 * representable. Defaulting it to false would silently produce a valid, wrong
 * answer key for a question nobody answered.
 */
export const trueFalseBranchSchema = z.object({
  statement: z.string(),
  answerValue: z.boolean().nullable(),
});

export type TrueFalseBranchValues = z.input<typeof trueFalseBranchSchema>;

export const strictTrueFalseBranchSchema = z.object({
  statement: z.string().trim().min(1, "İfade boş olamaz."),
  // Strict boolean, never coerced: "true"/"false"/1/0 must not become an
  // answer key, because the backend grader compares with ===.
  answerValue: z
    .boolean({ error: "Doğru veya Yanlış seçin." })
    .nullable()
    .refine(
      (value): value is boolean => value !== null,
      "Doğru veya Yanlış seçin.",
    ),
});

export function createTrueFalseBranch(): TrueFalseBranchValues {
  return { statement: "", answerValue: null };
}

export function trueFalseBranchFromDetail(
  detail: ExerciseDetail,
): TrueFalseBranchValues | null {
  const content = trueFalseContentSchema.safeParse(detail.content);
  const answerKey = trueFalseAnswerKeySchema.safeParse(detail.answer_key);
  if (!content.success || !answerKey.success) return null;

  // answerKey.data.value is already a real boolean, so `false` survives: no
  // `value || default` anywhere on this path.
  return {
    statement: content.data.statement,
    answerValue: answerKey.data.value,
  };
}

export function serializeTrueFalseBranch(branch: TrueFalseBranchValues) {
  if (typeof branch.answerValue !== "boolean") {
    throw new TypeError(
      "A true/false answer is required before serialization.",
    );
  }

  return {
    type: "true_false" as const,
    content: { statement: branch.statement.trim() },
    answer_key: { value: branch.answerValue },
  };
}
