import "server-only";

import { unsealData } from "iron-session";

import {
  getSessionCryptoOptions,
  sessionMaxAgeSeconds,
} from "@/lib/session/config";
import {
  createAdminSessionSchema,
  type AdminSession,
} from "@/lib/session/schema";

const configuredAdminSessionSchema =
  createAdminSessionSchema(sessionMaxAgeSeconds);

export async function unsealAdminSession(
  seal: string,
  now: number = Date.now(),
): Promise<AdminSession | null> {
  if (seal.trim().length === 0) {
    return null;
  }

  const unsealed = await unsealData<unknown>(seal, getSessionCryptoOptions());
  const parsed = configuredAdminSessionSchema.safeParse(unsealed);

  if (!parsed.success || now >= parsed.data.expiresAt) {
    return null;
  }

  return parsed.data;
}
