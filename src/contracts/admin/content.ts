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

export const courseScopeSchema = z.enum(courseScopes);
export const publishStatusSchema = z.enum(publishStatuses);

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

export type CourseScope = z.infer<typeof courseScopeSchema>;
export type PublishStatus = z.infer<typeof publishStatusSchema>;
export type Course = z.infer<typeof courseSchema>;
export type CoursesResponse = z.infer<typeof coursesResponseSchema>;
