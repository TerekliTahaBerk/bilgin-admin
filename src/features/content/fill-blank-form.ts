import { z } from "zod";

import {
  fillBlankAnswerKeySchema,
  fillBlankContentSchema,
  type ExerciseDetail,
} from "@/contracts/admin/exercise-editor";
import { countFillBlankPlaceholders } from "@/lib/content/fill-blank-placeholders";

/**
 * Shape-only schema for the fill blank branch — see the note on
 * multipleChoiceBranchSchema for why the rules live in the strict schema.
 *
 * choices and blanks are arrays of objects rather than plain strings so every
 * react-hook-form path stays registerable; the serializer flattens them back
 * to the backend's string arrays. Neither carries a synthetic id: a choice has
 * no identity of its own, only a value.
 */
export const fillBlankBranchSchema = z.object({
  template: z.string(),
  choices: z.array(z.object({ value: z.string() })),
  blanks: z.array(z.object({ value: z.string() })),
});

export type FillBlankBranchValues = z.input<typeof fillBlankBranchSchema>;

export const strictFillBlankBranchSchema = z
  .object({
    template: z.string().trim().min(1, "Cümle şablonu boş olamaz."),
    choices: z.array(
      z.object({ value: z.string().trim().min(1, "Seçenek boş olamaz.") }),
    ),
    blanks: z.array(
      z.object({
        value: z.string().trim().min(1, "Bu boşluğun cevabını seçin."),
      }),
    ),
  })
  .superRefine((value, context) => {
    const placeholders = countFillBlankPlaceholders(value.template);

    if (placeholders === 0) {
      context.addIssue({
        code: "custom",
        path: ["template"],
        message: "Şablon en az bir boşluk içermeli: {{0}}",
      });
      return;
    }

    if (value.blanks.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["blanks"],
        message: "Cevap listesi boş olamaz.",
      });
      return;
    }

    if (value.blanks.length !== placeholders) {
      context.addIssue({
        code: "custom",
        path: ["blanks"],
        message: `Şablonda ${placeholders} boşluk var ama ${value.blanks.length} cevap verilmiş.`,
      });
      return;
    }

    // Trimmed on both sides, because that is exactly what the serializer
    // sends: validation and the payload can never disagree about membership.
    const choices = value.choices.map((choice) => choice.value.trim());
    if (choices.length === 0) return;

    for (const [index, blank] of value.blanks.entries()) {
      if (!choices.includes(blank.value.trim())) {
        context.addIssue({
          code: "custom",
          path: ["blanks", index, "value"],
          message: "Bu cevap seçenekler arasında yok.",
        });
      }
    }
  });

/**
 * A new question starts with no choices at all, so the free-text answer mode
 * works immediately and "Seçenek ekle" opts into the choice-based mode. Empty
 * placeholder rows would instead make every answer unselectable until filled.
 */
export function createFillBlankBranch(): FillBlankBranchValues {
  return { template: "", choices: [], blanks: [] };
}

export function fillBlankBranchFromDetail(
  detail: ExerciseDetail,
): FillBlankBranchValues | null {
  const content = fillBlankContentSchema.safeParse(detail.content);
  const answerKey = fillBlankAnswerKeySchema.safeParse(detail.answer_key);
  if (!content.success || !answerKey.success) return null;

  // Order is preserved on both lists and the template is copied verbatim:
  // custom or non-sequential tokens are never renumbered on load.
  return {
    template: content.data.template,
    choices: content.data.choices.map((value) => ({ value })),
    blanks: answerKey.data.blanks.map((value) => ({ value })),
  };
}

export function serializeFillBlankBranch(branch: FillBlankBranchValues) {
  return {
    type: "fill_blank" as const,
    content: {
      template: branch.template.trim(),
      choices: branch.choices.map((choice) => choice.value.trim()),
    },
    answer_key: { blanks: branch.blanks.map((blank) => blank.value.trim()) },
  };
}

/** Duplicates are legal for the backend, but worth warning an editor about. */
export function duplicateChoiceValues(
  choices: readonly { value: string }[],
): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const choice of choices) {
    const value = choice.value.trim();
    if (value.length === 0) continue;
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }

  return [...duplicates];
}
