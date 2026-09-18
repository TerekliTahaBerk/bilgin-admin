import { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import { unsealData } from "iron-session";

import type { AdminSession } from "@/lib/session/schema";

export const BACKEND_ORIGIN = "https://backend.test";
export const APP_ORIGIN = "https://admin.test";
export const BACKEND_LOGIN_URL = `${BACKEND_ORIGIN}/api/admin/v1/auth/login`;
export const BACKEND_ME_URL = `${BACKEND_ORIGIN}/api/admin/v1/me`;
export const SESSION_COOKIE_NAME = "bilgin_admin_session";
const SESSION_SECRET =
  "test-session-secret-that-is-at-least-32-characters-long";

export function loginRequest(
  body: unknown,
  headers: Record<string, string> = { origin: APP_ORIGIN },
): Request {
  return new Request(`${APP_ORIGIN}/api/session/login`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

export function logoutRequest(
  headers: Record<string, string> = { origin: APP_ORIGIN },
): Request {
  return new Request(`${APP_ORIGIN}/api/session/logout`, {
    method: "POST",
    headers,
  });
}

export function meRequest(
  seal: string | null,
  extraHeaders: Record<string, string> = {},
): NextRequest {
  const headers = new Headers(extraHeaders);

  if (seal !== null) {
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${seal}`);
  }

  return new NextRequest(`${APP_ORIGIN}/api/session/me`, { headers });
}

export function setCookieHeader(response: NextResponse): string | undefined {
  return response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`));
}

export function sealFromResponse(response: NextResponse): string {
  const seal = response.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (seal === undefined || seal.length === 0) {
    throw new Error("The response did not set a session cookie.");
  }

  return seal;
}

export function openSeal(seal: string): Promise<AdminSession> {
  return unsealData<AdminSession>(seal, {
    password: SESSION_SECRET,
    ttl: 28800,
  });
}

/**
 * Reseals a session with arbitrary overrides so tests can build payloads the
 * production schema would reject (an unsupported version, an expired window).
 */
export function resealWith(
  session: AdminSession,
  changes: Record<string, unknown>,
): Promise<string> {
  return import("iron-session").then(({ sealData }) =>
    sealData(
      { ...session, ...changes },
      { password: SESSION_SECRET, ttl: 28800 },
    ),
  );
}
