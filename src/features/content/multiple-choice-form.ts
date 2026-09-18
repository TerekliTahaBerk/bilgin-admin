import { z } from "zod";

import type { CourseScope } from "@/contracts/admin/content";
import {
  multipleChoiceAnswerKeySchema,
  multipleChoiceContentSchema,
  type CreateExerciseRequest,
  type ExerciseDetail,
  type UpdateExerciseRequest,
} from "@/contracts/admin/exercise-editor";
import { courseScopeSchema } from "@/contracts/admin/content";

const optionFormSchema = z.object({
  id: z.string().trim().min(1, "Şık kimliği boş olamaz."),
  text: z.string().trim().min(1, "Şık metni boş olamaz."),
});

export const multipleChoiceFormSchema = z
  .object({
    topicId: z
      .number({ error: "Konu seçin." })
      .int()
      .positive()
      .nullable()
      .refine((value): value is number => value !== null, "Konu seçin."),
    difficulty: z.number().int().min(1).max(5),
    scopes: z.array(courseScopeSchema).min(1, "En az bir kapsam seçin."),
    explanation: z
      .string()
      .max(2000, "Açıklama en fazla 2000 karakter olabilir."),
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

export type MultipleChoiceFormValues = z.input<typeof multipleChoiceFormSchema>;

export type PreservedEditorDefaults = Readonly<{
  topicId: number | null;
  difficulty: number;
  scopes: CourseScope[];
}>;

const INITIAL_OPTIONS = ["a", "b", "c", "d"] as const;
let pendingDefaults: PreservedEditorDefaults | null = null;

export function createMultipleChoiceDefaults(
  preserved?: PreservedEditorDefaults,
): MultipleChoiceFormValues {
  return {
    topicId: preserved?.topicId ?? null,
    difficulty: preserved?.difficulty ?? 3,
    scopes: preserved?.scopes ?? [],
    explanation: "",
    stem: "",
    options: INITIAL_OPTIONS.map((id) => ({ id, text: "" })),
    correctOptionId: "",
  };
}

export function preserveEditorDefaults(values: MultipleChoiceFormValues): void {
  pendingDefaults = {
    topicId: values.topicId,
    difficulty: values.difficulty,
    scopes: [...values.scopes],
  };
}

export function consumeEditorDefaults(): PreservedEditorDefaults | undefined {
  const value = pendingDefaults ?? undefined;
  pendingDefaults = null;
  return value;
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

export function formValuesFromDetail(
  detail: ExerciseDetail,
): MultipleChoiceFormValues | null {
  if (detail.type !== "multiple_choice") return null;

  const content = multipleChoiceContentSchema.safeParse(detail.content);
  const answerKey = multipleChoiceAnswerKeySchema.safeParse(detail.answer_key);
  if (!content.success || !answerKey.success) return null;

  return {
    topicId: detail.topic_id,
    difficulty: detail.difficulty,
    scopes: [...detail.applicable_scopes],
    explanation: detail.explanation ?? "",
    stem: content.data.stem,
    options: content.data.options.map((option) => ({ ...option })),
    correctOptionId: answerKey.data.correct_option_id,
  };
}

function editablePayload(values: MultipleChoiceFormValues) {
  if (values.topicId === null) {
    throw new TypeError("A topic is required before serialization.");
  }

  return {
    type: "multiple_choice" as const,
    topic_id: values.topicId,
    difficulty: values.difficulty,
    content: {
      stem: values.stem.trim(),
      options: values.options.map((option) => ({
        id: option.id,
        text: option.text.trim(),
      })),
    },
    answer_key: { correct_option_id: values.correctOptionId },
    explanation:
      values.explanation.trim().length === 0 ? null : values.explanation.trim(),
    applicable_scopes: values.scopes,
  };
}

export function serializeCreateExercise(
  values: MultipleChoiceFormValues,
  unitId: number,
): CreateExerciseRequest {
  return { ...editablePayload(values), owner_unit_id: unitId };
}

export function serializeUpdateExercise(
  values: MultipleChoiceFormValues,
): UpdateExerciseRequest {
  return editablePayload(values);
}
