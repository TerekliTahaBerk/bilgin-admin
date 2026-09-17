import "server-only";

import { sealData } from "iron-session";

import type { SafeAdmin } from "@/contracts/admin/session";
import {
  ADMIN_SESSION_VERSION,
  getSessionCryptoOptions,
  sessionMaxAgeSeconds,
} from "@/lib/session/config";
import {
  createAdminSessionSchema,
  type AdminSession,
} from "@/lib/session/schema";

const configuredAdminSessionSchema =
  createAdminSessionSchema(sessionMaxAgeSeconds);

export function createAdminSessionPayload(
  input: { backendToken: string; admin: SafeAdmin },
  now: number = Date.now(),
): AdminSession {
  return configuredAdminSessionSchema.parse({
    version: ADMIN_SESSION_VERSION,
    backendToken: input.backendToken,
    admin: input.admin,
    issuedAt: now,
    expiresAt: now + sessionMaxAgeSeconds * 1000,
    validatedAt: now,
  });
}

export async function sealAdminSession(session: AdminSession): Promise<string> {
  const validatedSession = configuredAdminSessionSchema.parse(session);

  return sealData(validatedSession, getSessionCryptoOptions());
}
