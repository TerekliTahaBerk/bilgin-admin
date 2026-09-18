import { z } from "zod";

import { successEnvelopeSchema } from "@/contracts/admin/common";

const nonEmptyStringSchema = z.string().trim().min(1);

/**
 * Mirrors the backend `CourseScope` enum. It is deliberately the full enum and
 * not just the scopes today's YKS seed data happens to use.
 */
export const courseScopes = [
  "tyt",
  "ayt",
  "ydt",
  "lgs",
  "kpss",
  "ales",
  "yds",
] as const;

/** Mirrors the backend `PublishStatus` enum — `review` included. */
export const publishStatuses = [
  "draft",
  "review",
  "published",
  "archived",
] as const;

/** Mirrors the backend `AccessLevel` enum. */
export const accessLevels = ["free", "premium"] as const;

export const courseScopeSchema = z.enum(courseScopes);
export const publishStatusSchema = z.enum(publishStatuses);
export const accessLevelSchema = z.enum(accessLevels);

export const courseSchema = z.object({
  // `courses.id` is a bigint auto-increment column, not a UUID.
  id: z.number().int().positive(),
  code: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  scope: courseScopeSchema,
  status: publishStatusSchema,
  unit_count: z.number().int().nonnegative(),
});

export const coursesResponseSchema = successEnvelopeSchema(
  z.array(courseSchema),
);

export const unitSchema = z.object({
  // `units.id` is a bigint auto-increment column.
  id: z.number().int().positive(),
  title: nonEmptyStringSchema,
  sort_order: z.number().int().nonnegative(),
  // `units.grade_level` is a nullable tiny integer. The read contract follows
  // the stored model, not the 8..12 range the creation endpoint validates.
  grade_level: z.number().int().nullable(),
  status: publishStatusSchema,
  access: accessLevelSchema,
  node_count: z.number().int().nonnegative(),
  exercise_count: z.number().int().nonnegative(),
});

export const unitsResponseSchema = successEnvelopeSchema(z.array(unitSchema));

/** Mirrors the backend `ExerciseType` enum — all ten types, list-readable. */
export const exerciseTypes = [
  "multiple_choice",
  "fill_blank",
  "matching",
  "ordering",
  "flashcard",
  "true_false",
  "word_order",
  "numeric_input",
  "image_hotspot",
  "diagram_label",
] as const;

export const exerciseTypeSchema = z.enum(exerciseTypes);

export const exerciseTopicSchema = z.object({
  id: z.number().int().positive(),
  name: nonEmptyStringSchema,
});

/**
 * `correct_rate` is null until the exercise has been attempted; the backend
 * only computes it when attempts > 0. Null is "not solved yet", never zero.
 */
export const exerciseStatsSchema = z.object({
  attempts: z.number().int().nonnegative(),
  correct_rate: z.number().int().min(0).max(100).nullable(),
  avg_seconds: z.number().int().nonnegative().nullable(),
  needs_review: z.boolean(),
});

export const exerciseListItemSchema = z.object({
  id: z.number().int().positive(),
  type: exerciseTypeSchema,
  topic: exerciseTopicSchema,
  difficulty: z.number().int().min(1).max(5),
  status: publishStatusSchema,
  version: z.number().int().positive(),
  scopes: z.array(courseScopeSchema),
  // Backend-produced short text (up to 90 chars, sometimes "(önizleme yok)").
  // Rendered as plain text; the frontend never rebuilds it from content.
  preview: z.string(),
});

export const unitExercisesDataSchema = z.object({
  unit: z.object({
    id: z.number().int().positive(),
    title: nonEmptyStringSchema,
  }),
  exercises: z.array(
    exerciseListItemSchema.extend({ stats: exerciseStatsSchema }),
  ),
});

export const unitExercisesResponseSchema = successEnvelopeSchema(
  unitExercisesDataSchema,
);

export type CourseScope = z.infer<typeof courseScopeSchema>;
export type PublishStatus = z.infer<typeof publishStatusSchema>;
export type AccessLevel = z.infer<typeof accessLevelSchema>;
export type Course = z.infer<typeof courseSchema>;
export type CoursesResponse = z.infer<typeof coursesResponseSchema>;
export type Unit = z.infer<typeof unitSchema>;
export type UnitsResponse = z.infer<typeof unitsResponseSchema>;
export type ExerciseType = z.infer<typeof exerciseTypeSchema>;
export type ExerciseTopic = z.infer<typeof exerciseTopicSchema>;
export type ExerciseStats = z.infer<typeof exerciseStatsSchema>;
export type ExerciseListItem = z.infer<
  typeof unitExercisesDataSchema
>["exercises"][number];
export type UnitExercisesData = z.infer<typeof unitExercisesDataSchema>;
export type UnitExercisesResponse = z.infer<typeof unitExercisesResponseSchema>;
