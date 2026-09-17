import "server-only";

import { z } from "zod";

import { safeAdminSchema } from "@/contracts/admin/session";
import {
  SESSION_DEFAULT_MAX_AGE_SECONDS,
  SESSION_MIN_AGE_SECONDS,
} from "@/lib/env/schema";
import {
  ADMIN_SESSION_VERSION,
  sessionMaxAgeSeconds,
} from "@/lib/session/config";

const epochMillisecondsSchema = z.number().int().nonnegative();

const adminSessionFieldsSchema = z.object({
  version: z.literal(ADMIN_SESSION_VERSION),
  backendToken: z
    .string()
    .min(1)
    .refine((value) => value.trim().length > 0, "backendToken is required."),
  admin: safeAdminSchema,
  issuedAt: epochMillisecondsSchema,
  expiresAt: epochMillisecondsSchema,
  validatedAt: epochMillisecondsSchema,
});

export function createAdminSessionSchema(maxAgeSeconds: number) {
  if (
    !Number.isInteger(maxAgeSeconds) ||
    maxAgeSeconds < SESSION_MIN_AGE_SECONDS ||
    maxAgeSeconds > SESSION_DEFAULT_MAX_AGE_SECONDS
  ) {
    throw new RangeError(
      "Session schema max age is outside the allowed range.",
    );
  }

  const maximumLifetimeMs = maxAgeSeconds * 1000;

  return adminSessionFieldsSchema.superRefine((session, context) => {
    if (session.issuedAt > session.validatedAt) {
      context.addIssue({
        code: "custom",
        path: ["validatedAt"],
        message: "validatedAt must not be earlier than issuedAt.",
      });
    }

    if (session.validatedAt > session.expiresAt) {
      context.addIssue({
        code: "custom",
        path: ["validatedAt"],
        message: "validatedAt must not be later than expiresAt.",
      });
    }

    if (session.expiresAt - session.issuedAt > maximumLifetimeMs) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Session lifetime exceeds the configured maximum.",
      });
    }
  });
}

export const adminSessionSchema =
  createAdminSessionSchema(sessionMaxAgeSeconds);

export type AdminSession = z.infer<typeof adminSessionSchema>;
