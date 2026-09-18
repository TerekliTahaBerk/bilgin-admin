import { z } from "zod";

import { countFillBlankPlaceholders } from "@/lib/content/fill-blank-placeholders";

import { successEnvelopeSchema } from "@/contracts/admin/common";
import {
  courseScopeSchema,
  exerciseStatsSchema,
  exerciseTypeSchema,
  publishStatusSchema,
} from "@/contracts/admin/content";

const nonEmptyStringSchema = z.string().trim().min(1);
const positiveIdSchema = z.number().int().positive();

export const courseTopicSchema = z.object({
  id: positiveIdSchema,
  code: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  parent_id: positiveIdSchema.optional(),
  grade_level: z.number().int().optional(),
  exercise_count: z.number().int().nonnegative(),
});

export const courseTopicsDataSchema = z.object({
  course: z.object({
    id: positiveIdSchema,
    name: nonEmptyStringSchema,
  }),
  subject_id: positiveIdSchema,
  topics: z.array(courseTopicSchema),
});

export const courseTopicsResponseSchema = successEnvelopeSchema(
  courseTopicsDataSchema,
);

export const multipleChoiceOptionSchema = z.object({
  id: z.union([z.string(), z.number(), z.boolean()]).transform(String),
  text: z.string(),
});

export const multipleChoiceContentSchema = z.object({
  stem: z.string(),
  options: z.array(multipleChoiceOptionSchema).min(2),
});

export const multipleChoiceAnswerKeySchema = z.object({
  correct_option_id: z
    .union([z.string(), z.number(), z.boolean()])
    .transform(String),
});

export const trueFalseContentSchema = z.object({
  statement: z.string(),
});

/**
 * The backend's TrueFalseValidator rejects anything that is not a real boolean
 * — "true", "false", 1 and 0 all fail there, because the grader compares
 * strictly. Mirroring that with z.boolean() (never z.coerce.boolean()) keeps a
 * tampered browser body from reaching the backend at all.
 */
export const trueFalseAnswerKeySchema = z.object({
  value: z.boolean(),
});

export const fillBlankContentSchema = z.object({
  template: z.string(),
  // The backend validator reads `$content['choices'] ?? []`, so a stored row
  // may legitimately omit choices. Normalising to [] keeps that data readable
  // instead of turning a backend-valid question into a protocol error.
  choices: z.array(z.string()).default([]),
});

export const fillBlankAnswerKeySchema = z.object({
  blanks: z.array(z.string()),
});

/**
 * The backend validates numbers with PHP's is_numeric(), which also accepts
 * numeric strings, so a stored row may legitimately carry "375" instead of
 * 375. Detail reads normalise either form to a finite JSON number rather than
 * rejecting backend-valid content; mutations are strict (see below).
 */
const backendNumberSchema = z
  .union([z.number(), z.string()])
  .transform((value, context) => {
    if (typeof value === "string" && value.trim().length === 0) {
      context.addIssue({
        code: "custom",
        message: "Sayısal bir değer bekleniyor.",
      });
      return z.NEVER;
    }

    const parsed = typeof value === "number" ? value : Number(value);

    if (!Number.isFinite(parsed)) {
      context.addIssue({
        code: "custom",
        message: "Sayısal bir değer bekleniyor.",
      });
      return z.NEVER;
    }

    return parsed;
  });

export const numericInputContentSchema = z.object({
  stem: z.string(),
  // Real seed rows exist without a suffix, so it can never be required.
  suffix: z.string().optional(),
});

export const numericInputAnswerKeyDetailSchema = z.object({
  value: backendNumberSchema,
  // The backend reads $answerKey['tolerance'] ?? 0, so a missing tolerance is
  // a stored zero.
  tolerance: backendNumberSchema.optional(),
});

export const flashcardContentSchema = z.object({
  front: z.string(),
  back: z.string(),
});

/**
 * FlashcardValidator ignores the answer key entirely — it validates only the
 * front and back text — so self_assessed is optional on read. The editor still
 * writes a canonical value (see flashcardEditableSchema).
 */
export const flashcardAnswerKeyDetailSchema = z.object({
  self_assessed: z.boolean().optional(),
});

/** The exercise types this editor is allowed to create and update. */
export const supportedEditorTypeSchema = z.enum([
  "multiple_choice",
  "true_false",
  "fill_blank",
  "numeric_input",
  "flashcard",
]);

export type SupportedEditorType = z.infer<typeof supportedEditorTypeSchema>;

export function isSupportedEditorType(
  type: string,
): type is SupportedEditorType {
  return supportedEditorTypeSchema.safeParse(type).success;
}

const exerciseDetailDataBaseSchema = z.object({
  id: positiveIdSchema,
  type: exerciseTypeSchema,
  topic_id: positiveIdSchema,
  difficulty: z.number().int().min(1).max(5),
  content: z.record(z.string(), z.unknown()),
  answer_key: z.record(z.string(), z.unknown()),
  explanation: z.string().nullable(),
  applicable_scopes: z.array(courseScopeSchema).min(1),
  status: publishStatusSchema,
  version: positiveIdSchema,
  stats: exerciseStatsSchema,
});

const detailShapeByType = {
  multiple_choice: {
    content: multipleChoiceContentSchema,
    answerKey: multipleChoiceAnswerKeySchema,
    label: "Çoktan seçmeli",
  },
  true_false: {
    content: trueFalseContentSchema,
    answerKey: trueFalseAnswerKeySchema,
    label: "Doğru / yanlış",
  },
  fill_blank: {
    content: fillBlankContentSchema,
    answerKey: fillBlankAnswerKeySchema,
    label: "Boşluk doldurma",
  },
  numeric_input: {
    content: numericInputContentSchema,
    answerKey: numericInputAnswerKeyDetailSchema,
    label: "Sayısal cevap",
  },
  flashcard: {
    content: flashcardContentSchema,
    answerKey: flashcardAnswerKeyDetailSchema,
    label: "Bilgi kartı",
  },
} as const;

/**
 * All ten exercise types stay readable — an unsupported type must not become
 * an unreadable one — but the two types this editor can mutate are fully
 * validated, so the form never hydrates from a shape it cannot serialize back.
 */
export const exerciseDetailDataSchema =
  exerciseDetailDataBaseSchema.superRefine((value, context) => {
    if (!isSupportedEditorType(value.type)) return;

    const shape = detailShapeByType[value.type];

    if (!shape.content.safeParse(value.content).success) {
      context.addIssue({
        code: "custom",
        path: ["content"],
        message: `${shape.label} soru içeriği geçersiz.`,
      });
    }

    if (!shape.answerKey.safeParse(value.answer_key).success) {
      context.addIssue({
        code: "custom",
        path: ["answer_key"],
        message: `${shape.label} cevap anahtarı geçersiz.`,
      });
    }
  });

export const exerciseDetailResponseSchema = successEnvelopeSchema(
  exerciseDetailDataSchema,
);

const commonEditableFields = {
  topic_id: positiveIdSchema,
  difficulty: z.number().int().min(1).max(5),
  explanation: z.string().max(2000).nullable(),
  applicable_scopes: z.array(courseScopeSchema).min(1),
} as const;

export const multipleChoiceEditableSchema = z.object({
  type: z.literal("multiple_choice"),
  ...commonEditableFields,
  content: multipleChoiceContentSchema,
  answer_key: multipleChoiceAnswerKeySchema,
});

export const trueFalseEditableSchema = z.object({
  type: z.literal("true_false"),
  ...commonEditableFields,
  content: trueFalseContentSchema,
  answer_key: trueFalseAnswerKeySchema,
});

/**
 * Fill blank is the one type whose validity is cross-field: the template, the
 * answer list and the choice list only make sense together. These are the
 * backend FillBlankValidator's own invariants, mirrored here so a tampered
 * browser body is rejected at the BFF boundary rather than travelling to the
 * backend. The backend still re-validates and remains the final authority.
 */
export const fillBlankEditableSchema = z
  .object({
    type: z.literal("fill_blank"),
    ...commonEditableFields,
    content: fillBlankContentSchema,
    answer_key: fillBlankAnswerKeySchema,
  })
  .superRefine((value, context) => {
    const placeholders = countFillBlankPlaceholders(value.content.template);

    if (value.content.template.trim().length === 0) {
      context.addIssue({
        code: "custom",
        path: ["content", "template"],
        message: "Cümle şablonu boş olamaz.",
      });
    } else if (placeholders === 0) {
      context.addIssue({
        code: "custom",
        path: ["content", "template"],
        message: "Şablon en az bir boşluk içermeli: {{0}}",
      });
    }

    const blanks = value.answer_key.blanks;

    if (blanks.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["answer_key", "blanks"],
        message: "Cevap listesi boş olamaz.",
      });
    } else if (placeholders > 0 && blanks.length !== placeholders) {
      context.addIssue({
        code: "custom",
        path: ["answer_key", "blanks"],
        message: `Şablonda ${placeholders} boşluk var ama ${blanks.length} cevap verilmiş.`,
      });
    }

    // Mirrors in_array($blank, $choices, true): strict string equality.
    if (value.content.choices.length > 0) {
      for (const [index, blank] of blanks.entries()) {
        if (!value.content.choices.includes(blank)) {
          context.addIssue({
            code: "custom",
            path: ["answer_key", "blanks", index],
            message: `Doğru cevap '${blank}' seçenekler arasında yok.`,
          });
        }
      }
    }
  });

/**
 * Mutations accept exactly the supported editor union. The other eight types
 * fall through the discriminator and are rejected before any backend call, and
 * the object schemas strip id/status/version/stats/owner_course_id — plus
 * owner_unit_id on update — so a crafted browser body cannot mass-assign them.
 */
/**
 * Mutations are strict where detail reads are lenient: the editor always sends
 * canonical finite JSON numbers, so a crafted body carrying "375" or "0" as a
 * string is rejected here instead of being coerced on its way to the backend.
 */
const finiteNumberSchema = z
  .number({ error: "Sayısal bir değer bekleniyor." })
  .refine(Number.isFinite, "Sayısal bir değer bekleniyor.");

export const numericInputEditableSchema = z.object({
  type: z.literal("numeric_input"),
  ...commonEditableFields,
  content: numericInputContentSchema,
  answer_key: z.object({
    value: finiteNumberSchema,
    tolerance: finiteNumberSchema.min(0, "Tolerans negatif olamaz."),
  }),
});

export const flashcardEditableSchema = z.object({
  type: z.literal("flashcard"),
  ...commonEditableFields,
  content: flashcardContentSchema,
  // Whatever the browser puts here is discarded and replaced by the canonical
  // value: the answer key is editor metadata, not a user-controlled field, so
  // it is not a mass-assignment surface.
  answer_key: z.object({}).transform(() => ({ self_assessed: true as const })),
});

export const editableExerciseSchema = z.discriminatedUnion("type", [
  multipleChoiceEditableSchema,
  trueFalseEditableSchema,
  fillBlankEditableSchema,
  numericInputEditableSchema,
  flashcardEditableSchema,
]);

export const createExerciseRequestSchema = z.discriminatedUnion("type", [
  multipleChoiceEditableSchema.extend({ owner_unit_id: positiveIdSchema }),
  trueFalseEditableSchema.extend({ owner_unit_id: positiveIdSchema }),
  fillBlankEditableSchema.extend({ owner_unit_id: positiveIdSchema }),
  numericInputEditableSchema.extend({ owner_unit_id: positiveIdSchema }),
  flashcardEditableSchema.extend({ owner_unit_id: positiveIdSchema }),
]);

export const updateExerciseRequestSchema = editableExerciseSchema;

export const createExerciseResponseSchema = successEnvelopeSchema(
  z.object({
    id: positiveIdSchema,
    status: z.literal("draft"),
  }),
);

export const updateExerciseResponseSchema = successEnvelopeSchema(
  z.object({
    id: positiveIdSchema,
    version: positiveIdSchema,
    answer_key_changed: z.boolean().optional(),
    warning: nonEmptyStringSchema.optional(),
  }),
);

export type CourseTopic = z.infer<typeof courseTopicSchema>;
export type CourseTopicsData = z.infer<typeof courseTopicsDataSchema>;
export type CourseTopicsResponse = z.infer<typeof courseTopicsResponseSchema>;
export type MultipleChoiceContent = z.infer<typeof multipleChoiceContentSchema>;
export type TrueFalseContent = z.infer<typeof trueFalseContentSchema>;
export type FillBlankContent = z.infer<typeof fillBlankContentSchema>;
export type NumericInputContent = z.infer<typeof numericInputContentSchema>;
export type FlashcardContent = z.infer<typeof flashcardContentSchema>;
export type EditableExercise = z.infer<typeof editableExerciseSchema>;
export type ExerciseDetail = z.infer<typeof exerciseDetailDataSchema>;
export type ExerciseDetailResponse = z.infer<
  typeof exerciseDetailResponseSchema
>;
export type CreateExerciseRequest = z.infer<typeof createExerciseRequestSchema>;
export type UpdateExerciseRequest = z.infer<typeof updateExerciseRequestSchema>;
export type CreateExerciseResponse = z.infer<
  typeof createExerciseResponseSchema
>;
export type UpdateExerciseResponse = z.infer<
  typeof updateExerciseResponseSchema
>;
