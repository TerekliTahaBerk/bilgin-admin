import "server-only";

import {
  SESSION_DEFAULT_MAX_AGE_SECONDS,
  SESSION_MIN_AGE_SECONDS,
} from "@/lib/env/schema";
import { serverEnv } from "@/lib/env/server";

export const ADMIN_SESSION_VERSION = 1 as const;
export const SESSION_VALIDATION_WINDOW_MS = 5 * 60 * 1000;
export const SESSION_COOKIE_SIZE_LIMIT_BYTES = 3500;

export const DEVELOPMENT_SESSION_COOKIE_NAME = "bilgin_admin_session";
export const PRODUCTION_SESSION_COOKIE_NAME = "__Host-bilgin_admin_session";

export type SessionCookiePolicy = Readonly<{
  name: string;
  options: Readonly<{
    httpOnly: true;
    secure: boolean;
    sameSite: "lax";
    path: "/";
    maxAge: number;
  }>;
}>;

export function createSessionCookiePolicy(
  nodeEnv: string | undefined,
  maxAge: number,
): SessionCookiePolicy {
  if (
    !Number.isInteger(maxAge) ||
    maxAge < SESSION_MIN_AGE_SECONDS ||
    maxAge > SESSION_DEFAULT_MAX_AGE_SECONDS
  ) {
    throw new RangeError("Session cookie maxAge is outside the allowed range.");
  }

  const isProduction = nodeEnv === "production";

  return Object.freeze({
    name: isProduction
      ? PRODUCTION_SESSION_COOKIE_NAME
      : DEVELOPMENT_SESSION_COOKIE_NAME,
    options: Object.freeze({
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge,
    }),
  });
}

export const sessionMaxAgeSeconds = serverEnv.SESSION_MAX_AGE_SECONDS;

export const sessionCookiePolicy = createSessionCookiePolicy(
  process.env.NODE_ENV,
  sessionMaxAgeSeconds,
);

export function getSessionCryptoOptions() {
  return {
    password: serverEnv.SESSION_SECRET,
    ttl: sessionMaxAgeSeconds,
  } as const;
}
