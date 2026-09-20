import { z } from "zod";

import { successEnvelopeSchema } from "@/contracts/admin/common";
import {
  accessLevelSchema,
  publishStatusSchema,
} from "@/contracts/admin/content";

const text = z.string().trim().min(1);
const id = z.number().int().positive();

export const unitTemplateSchema = z.object({
  code: text,
  name: text,
  description: z.string().nullable(),
  is_default: z.boolean(),
  nodes: z.array(
    z.object({
      title: text,
      type: text,
      difficulty: z.union([z.string(), z.number()]),
      exercise_count: z.number().int().nonnegative(),
    }),
  ),
});
export const unitTemplatesResponseSchema = successEnvelopeSchema(
  z.array(unitTemplateSchema),
);

export const createUnitRequestSchema = z.object({
  course_code: text,
  template_code: text,
  title: z.string().trim().min(1).max(191),
  topic_ids: z.array(id).min(1),
  sort_order: z.number().int().min(1).optional(),
  grade_level: z.number().int().min(8).max(12).optional(),
  estimated_minutes: z.number().int().min(1).optional(),
});
export const createdUnitSchema = z.object({
  id,
  title: text,
  status: z.literal("draft"),
  nodes: z.array(
    z.object({
      id,
      title: text,
      type: text,
      exercise_count: z.number().int().nonnegative(),
      xp_reward: z.number().int().nonnegative(),
    }),
  ),
});
export const createUnitResponseSchema =
  successEnvelopeSchema(createdUnitSchema);

export const archiveExerciseResponseSchema = successEnvelopeSchema(
  z.object({
    id,
    status: z.literal("archived"),
  }),
);

export const contentPackageSchema = z
  .object({
    course: text,
    subject: text,
    unit: z.object({ title: text, template: text }).passthrough(),
    topics: z.array(z.unknown()).min(1),
    exercises: z.array(z.unknown()).min(1),
  })
  .passthrough();
export const importContentResponseSchema = successEnvelopeSchema(
  z.object({
    unit_id: id,
    unit_title: text,
    topics: z.number().int().nonnegative(),
    nodes: z.number().int().nonnegative(),
    exercises: z.number().int().nonnegative(),
  }),
);

export const curriculumOptionsSchema = z.object({
  variants: z.array(
    z.object({
      id,
      exam_id: id,
      code: text,
      name: text,
      field_code: text,
      sort_order: z.number().int().nonnegative(),
      is_active: z.boolean(),
    }),
  ),
  sections: z.array(
    z.object({
      id,
      exam_id: id,
      code: text,
      name: text,
      sort_order: z.number().int().nonnegative(),
    }),
  ),
});
export const curriculumOptionsResponseSchema = successEnvelopeSchema(
  curriculumOptionsSchema,
);

export const curriculumRowSchema = z.object({
  course_id: id,
  code: text,
  name: text,
  status: publishStatusSchema,
  section_code: text,
  exam_section_id: id,
  sort_order: z.number().int().min(1),
  access: accessLevelSchema,
  exam_weight: z.number().int().min(0).max(200).nullable(),
  is_required: z.boolean(),
});
export const curriculumMappingResponseSchema = successEnvelopeSchema(
  z.object({
    exam_variant: z.object({ code: text, name: text }),
    courses: z.array(curriculumRowSchema),
  }),
);
export const updateCurriculumRequestSchema = z.object({
  courses: z
    .array(
      curriculumRowSchema.pick({
        course_id: true,
        exam_section_id: true,
        sort_order: true,
        access: true,
        exam_weight: true,
        is_required: true,
      }),
    )
    .min(1)
    .superRefine((rows, ctx) => {
      const seen = new Set<number>();
      rows.forEach((row, index) => {
        if (seen.has(row.course_id))
          ctx.addIssue({
            code: "custom",
            path: [index, "course_id"],
            message: "Aynı ders iki kez eklenemez.",
          });
        seen.add(row.course_id);
      });
    }),
});
export const updateCurriculumResponseSchema = successEnvelopeSchema(
  z.object({
    exam_variant: text,
    course_count: z.number().int().nonnegative(),
  }),
);

export const roleOptionSchema = z.object({
  value: text,
  label: text,
  abilities: z.object({
    edit_content: z.boolean(),
    publish_content: z.boolean(),
    edit_curriculum: z.boolean(),
    view_users: z.boolean(),
  }),
});
export const adminAccountSchema = z.object({
  id: z.uuid(),
  name: text,
  email: z.email(),
  role: text,
  role_label: text,
  is_active: z.boolean(),
  last_login_at: z.string().nullable(),
});
export const adminAccountsResponseSchema = successEnvelopeSchema(
  z.object({
    roles: z.array(roleOptionSchema),
    admins: z.array(adminAccountSchema),
  }),
);
export const createAdminRequestSchema = z.object({
  name: z.string().trim().min(1).max(191),
  email: z.email(),
  password: z.string().min(12),
  role: text,
});
export const createAdminResponseSchema = successEnvelopeSchema(
  z.object({ id: z.uuid(), email: z.email(), role: text }),
);
export const updateAdminRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(191).optional(),
    role: text.optional(),
    is_active: z.boolean().optional(),
    password: z.string().min(12).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
export const updateAdminResponseSchema = successEnvelopeSchema(
  z.object({ id: z.uuid(), role: text, is_active: z.boolean() }),
);

export type UnitTemplate = z.infer<typeof unitTemplateSchema>;
export type CreateUnitRequest = z.infer<typeof createUnitRequestSchema>;
export type CreatedUnit = z.infer<typeof createdUnitSchema>;
export type ContentPackage = z.infer<typeof contentPackageSchema>;
export type ImportContentResult = z.infer<
  typeof importContentResponseSchema
>["data"];
export type CurriculumOptions = z.infer<typeof curriculumOptionsSchema>;
export type CurriculumRow = z.infer<typeof curriculumRowSchema>;
export type UpdateCurriculumRequest = z.infer<
  typeof updateCurriculumRequestSchema
>;
export type AdminAccountsData = z.infer<
  typeof adminAccountsResponseSchema
>["data"];
export type CreateAdminRequest = z.infer<typeof createAdminRequestSchema>;
export type UpdateAdminRequest = z.infer<typeof updateAdminRequestSchema>;
