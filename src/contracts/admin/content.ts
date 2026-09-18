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

export type CourseScope = z.infer<typeof courseScopeSchema>;
export type PublishStatus = z.infer<typeof publishStatusSchema>;
export type AccessLevel = z.infer<typeof accessLevelSchema>;
export type Course = z.infer<typeof courseSchema>;
export type CoursesResponse = z.infer<typeof coursesResponseSchema>;
export type Unit = z.infer<typeof unitSchema>;
export type UnitsResponse = z.infer<typeof unitsResponseSchema>;
