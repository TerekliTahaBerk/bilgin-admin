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

/**
 * All ten exercise types are readable, but Step 01 only edits multiple choice.
 * The conditional refinement keeps unsupported types inspectable while fully
 * validating the one type this editor is allowed to mutate.
 */
export const exerciseDetailDataSchema =
  exerciseDetailDataBaseSchema.superRefine((value, context) => {
    if (value.type !== "multiple_choice") return;

    const content = multipleChoiceContentSchema.safeParse(value.content);
    const answerKey = multipleChoiceAnswerKeySchema.safeParse(value.answer_key);

    if (!content.success) {
      context.addIssue({
        code: "custom",
        path: ["content"],
        message: "Çoktan seçmeli soru içeriği geçersiz.",
      });
    }

    if (!answerKey.success) {
      context.addIssue({
        code: "custom",
        path: ["answer_key"],
        message: "Çoktan seçmeli cevap anahtarı geçersiz.",
      });
    }
  });

export const exerciseDetailResponseSchema = successEnvelopeSchema(
  exerciseDetailDataSchema,
);

const editableExerciseFieldsSchema = z.object({
  type: z.literal("multiple_choice"),
  topic_id: positiveIdSchema,
  difficulty: z.number().int().min(1).max(5),
  content: multipleChoiceContentSchema,
  answer_key: multipleChoiceAnswerKeySchema,
  explanation: z.string().max(2000).nullable(),
  applicable_scopes: z.array(courseScopeSchema).min(1),
});

export const createExerciseRequestSchema = editableExerciseFieldsSchema.extend({
  owner_unit_id: positiveIdSchema,
});

export const updateExerciseRequestSchema = editableExerciseFieldsSchema;

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
