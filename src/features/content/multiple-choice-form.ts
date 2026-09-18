import { z } from "zod";

import {
  multipleChoiceAnswerKeySchema,
  multipleChoiceContentSchema,
  type ExerciseDetail,
} from "@/contracts/admin/exercise-editor";

/**
 * Shape-only schema for the multiple choice branch of the editor form. It
 * deliberately carries no content rules: both branches live in form state at
 * once, and an untouched branch must never block a save of the active one.
 * The rules live in strictMultipleChoiceBranchSchema, which the editor form
 * schema runs against the active branch alone.
 */
export const multipleChoiceBranchSchema = z.object({
  stem: z.string(),
  options: z.array(z.object({ id: z.string(), text: z.string() })),
  correctOptionId: z.string(),
});

export type MultipleChoiceBranchValues = z.input<
  typeof multipleChoiceBranchSchema
>;

const optionFormSchema = z.object({
  id: z.string().trim().min(1, "Şık kimliği boş olamaz."),
  text: z.string().trim().min(1, "Şık metni boş olamaz."),
});

export const strictMultipleChoiceBranchSchema = z
  .object({
    stem: z.string().trim().min(1, "Soru kökü boş olamaz."),
    options: z.array(optionFormSchema).min(2, "En az iki şık bulunmalıdır."),
    correctOptionId: z.string().trim().min(1, "Doğru şıkkı seçin."),
  })
  .superRefine((value, context) => {
    const ids = value.options.map((option) => option.id);

    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Şık kimlikleri benzersiz olmalıdır.",
      });
    }

    if (
      value.correctOptionId.length > 0 &&
      !ids.includes(value.correctOptionId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["correctOptionId"],
        message: "Doğru cevap mevcut şıklardan biri olmalıdır.",
      });
    }
  });

const INITIAL_OPTIONS = ["a", "b", "c", "d"] as const;

export function createMultipleChoiceBranch(): MultipleChoiceBranchValues {
  return {
    stem: "",
    options: INITIAL_OPTIONS.map((id) => ({ id, text: "" })),
    correctOptionId: "",
  };
}

export function nextOptionId(existingIds: readonly string[]): string {
  const existing = new Set(existingIds);

  for (let code = 97; code <= 122; code += 1) {
    const candidate = String.fromCharCode(code);
    if (!existing.has(candidate)) return candidate;
  }

  let suffix = 1;
  while (existing.has(`option-${suffix}`)) suffix += 1;
  return `option-${suffix}`;
}

export function correctAnswerAfterOptionRemoval(
  correctOptionId: string,
  removedOptionId: string,
): string {
  return correctOptionId === removedOptionId ? "" : correctOptionId;
}

export function multipleChoiceBranchFromDetail(
  detail: ExerciseDetail,
): MultipleChoiceBranchValues | null {
  const content = multipleChoiceContentSchema.safeParse(detail.content);
  const answerKey = multipleChoiceAnswerKeySchema.safeParse(detail.answer_key);
  if (!content.success || !answerKey.success) return null;

  return {
    stem: content.data.stem,
    options: content.data.options.map((option) => ({ ...option })),
    correctOptionId: answerKey.data.correct_option_id,
  };
}

export function serializeMultipleChoiceBranch(
  branch: MultipleChoiceBranchValues,
) {
  return {
    type: "multiple_choice" as const,
    content: {
      stem: branch.stem.trim(),
      options: branch.options.map((option) => ({
        id: option.id,
        text: option.text.trim(),
      })),
    },
    answer_key: { correct_option_id: branch.correctOptionId },
  };
}
