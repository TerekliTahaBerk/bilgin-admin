import "server-only";

import {
  SESSION_VALIDATION_WINDOW_MS,
  sessionMaxAgeSeconds,
} from "@/lib/session/config";
import {
  createAdminSessionSchema,
  type AdminSession,
} from "@/lib/session/schema";

const configuredAdminSessionSchema =
  createAdminSessionSchema(sessionMaxAgeSeconds);

export function isSessionValidationFresh(
  session: AdminSession,
  now: number = Date.now(),
): boolean {
  const age = now - session.validatedAt;

  return age >= 0 && age < SESSION_VALIDATION_WINDOW_MS;
}

export function markSessionValidated(
  session: AdminSession,
  now: number = Date.now(),
): AdminSession {
  return configuredAdminSessionSchema.parse({
    ...session,
    validatedAt: now,
  });
}
