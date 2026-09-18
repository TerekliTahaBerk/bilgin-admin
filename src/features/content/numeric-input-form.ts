import { z } from "zod";

import {
  numericInputAnswerKeyDetailSchema,
  numericInputContentSchema,
  type ExerciseDetail,
} from "@/contracts/admin/exercise-editor";

/**
 * Shape-only schema for the numeric input branch — see the note on
 * multipleChoiceBranchSchema for why the rules live in the strict schema.
 *
 * answerValue and tolerance are nullable on purpose: an empty number input has
 * no value, and representing that as null keeps NaN out of form state entirely.
 * answerValue is never defaulted to 0, because 0 is a real correct answer that
 * the author has to enter deliberately.
 */
export const numericInputBranchSchema = z.object({
  stem: z.string(),
  answerValue: z.number().nullable(),
  tolerance: z.number().nullable(),
  suffix: z.string(),
});

export type NumericInputBranchValues = z.input<typeof numericInputBranchSchema>;

const requiredFiniteNumber = (message: string) =>
  z
    .number({ error: message })
    .nullable()
    .refine(
      (value): value is number => value !== null && Number.isFinite(value),
      message,
    );

export const strictNumericInputBranchSchema = z.object({
  stem: z.string().trim().min(1, "Soru kökü boş olamaz."),
  answerValue: requiredFiniteNumber("Doğru cevabı sayı olarak girin."),
  tolerance: requiredFiniteNumber("Toleransı sayı olarak girin").refine(
    (value) => value >= 0,
    "Tolerans negatif olamaz.",
  ),
  suffix: z.string(),
});

export function createNumericInputBranch(): NumericInputBranchValues {
  return { stem: "", answerValue: null, tolerance: 0, suffix: "" };
}

/**
 * Maps what a number input reports onto form state. An empty or unparseable
 * field becomes null so validation can ask for a value, instead of a silent
 * NaN that would serialize into a broken payload.
 */
export function numericFieldValue(input: unknown): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) ? input : null;
  }

  if (typeof input !== "string") return null;

  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function numericInputBranchFromDetail(
  detail: ExerciseDetail,
): NumericInputBranchValues | null {
  const content = numericInputContentSchema.safeParse(detail.content);
  const answerKey = numericInputAnswerKeyDetailSchema.safeParse(
    detail.answer_key,
  );
  if (!content.success || !answerKey.success) return null;

  // `?? 0` only ever fires for an absent tolerance: a stored 0 is a number and
  // survives, and the answer value is never touched by a falsy fallback.
  return {
    stem: content.data.stem,
    answerValue: answerKey.data.value,
    tolerance: answerKey.data.tolerance ?? 0,
    suffix: content.data.suffix ?? "",
  };
}

export function serializeNumericInputBranch(branch: NumericInputBranchValues) {
  if (branch.answerValue === null || !Number.isFinite(branch.answerValue)) {
    throw new TypeError(
      "A finite numeric answer is required before serialization.",
    );
  }

  if (
    branch.tolerance === null ||
    !Number.isFinite(branch.tolerance) ||
    branch.tolerance < 0
  ) {
    throw new TypeError(
      "A finite non-negative tolerance is required before serialization.",
    );
  }

  const suffix = branch.suffix.trim();

  return {
    type: "numeric_input" as const,
    content: {
      stem: branch.stem.trim(),
      // An empty suffix is omitted rather than sent as "".
      ...(suffix.length === 0 ? {} : { suffix }),
    },
    answer_key: { value: branch.answerValue, tolerance: branch.tolerance },
  };
}
