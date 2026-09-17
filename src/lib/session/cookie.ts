import "server-only";

import type { NextRequest, NextResponse } from "next/server";

import { sessionCookiePolicy } from "@/lib/session/config";

export function readSessionSeal(request: NextRequest): string | null {
  return request.cookies.get(sessionCookiePolicy.name)?.value ?? null;
}

export function getRemainingSessionSeconds(
  expiresAt: number,
  now: number = Date.now(),
): number {
  return Math.max(0, Math.floor((expiresAt - now) / 1000));
}

export function setSessionCookie(
  response: NextResponse,
  seal: string,
  expiresAt: number,
  now: number = Date.now(),
): void {
  const remainingSeconds = getRemainingSessionSeconds(expiresAt, now);

  if (remainingSeconds <= 0) {
    clearSessionCookie(response);
    return;
  }

  response.cookies.set(sessionCookiePolicy.name, seal, {
    ...sessionCookiePolicy.options,
    maxAge: remainingSeconds,
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(sessionCookiePolicy.name, "", {
    ...sessionCookiePolicy.options,
    maxAge: 0,
    expires: new Date(0),
  });
}
