import { z } from "zod";

import { successEnvelopeSchema } from "@/contracts/admin/common";

const nonEmptyStringSchema = z.string().trim().min(1);

export const adminLoginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const adminAbilitiesSchema = z.object({
  edit_content: z.boolean(),
  publish_content: z.boolean(),
  edit_curriculum: z.boolean(),
  view_users: z.boolean(),
});

export const adminLoginIdentitySchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  email: z.email(),
  role: nonEmptyStringSchema,
  role_label: nonEmptyStringSchema,
  abilities: adminAbilitiesSchema,
});

export const adminLoginResponseSchema = successEnvelopeSchema(
  z.object({
    token: nonEmptyStringSchema,
    admin: adminLoginIdentitySchema,
  }),
);

export const adminMeIdentitySchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  email: z.email(),
  role: nonEmptyStringSchema,
  role_label: nonEmptyStringSchema,
});

export const adminMeResponseSchema = successEnvelopeSchema(
  adminMeIdentitySchema,
);

export type AdminLoginRequest = z.infer<typeof adminLoginRequestSchema>;
export type AdminAbilities = z.infer<typeof adminAbilitiesSchema>;
export type AdminLoginIdentity = z.infer<typeof adminLoginIdentitySchema>;
export type AdminLoginResponse = z.infer<typeof adminLoginResponseSchema>;
export type AdminMeIdentity = z.infer<typeof adminMeIdentitySchema>;
export type AdminMeResponse = z.infer<typeof adminMeResponseSchema>;
