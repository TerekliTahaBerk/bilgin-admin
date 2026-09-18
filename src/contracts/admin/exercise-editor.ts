import { z } from "zod";

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

/** The exercise types this editor is allowed to create and update. */
export const supportedEditorTypeSchema = z.enum([
  "multiple_choice",
  "true_false",
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
 * Mutations accept exactly the supported editor union. The other eight types
 * fall through the discriminator and are rejected before any backend call, and
 * the object schemas strip id/status/version/stats/owner_course_id — plus
 * owner_unit_id on update — so a crafted browser body cannot mass-assign them.
 */
export const editableExerciseSchema = z.discriminatedUnion("type", [
  multipleChoiceEditableSchema,
  trueFalseEditableSchema,
]);

export const createExerciseRequestSchema = z.discriminatedUnion("type", [
  multipleChoiceEditableSchema.extend({ owner_unit_id: positiveIdSchema }),
  trueFalseEditableSchema.extend({ owner_unit_id: positiveIdSchema }),
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
