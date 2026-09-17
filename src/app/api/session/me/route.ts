import type { NextRequest, NextResponse } from "next/server";

import { adminBackend } from "@/lib/backend/admin-auth";
import {
  clearSessionCookie,
  getRemainingSessionSeconds,
  readSessionSeal,
  setSessionCookie,
} from "@/lib/session/cookie";
import {
  createInvalidSessionResponse,
  createSessionErrorResponse,
  createSessionSuccessResponse,
} from "@/lib/session/http";
import { refreshSafeAdminIdentity } from "@/lib/session/map-admin";
import { unsealAdminSession } from "@/lib/session/read";
import {
  isSessionValidationFresh,
  markSessionValidated,
} from "@/lib/session/validate";
import { sealAdminSession } from "@/lib/session/write";

function invalidSessionWithClearedCookie(): NextResponse {
  const response = createInvalidSessionResponse();

  clearSessionCookie(response);

  return response;
}

export async function GET(request: NextRequest) {
  const seal = readSessionSeal(request);

  if (seal === null) {
    return createInvalidSessionResponse();
  }

  const now = Date.now();
  const session = await unsealAdminSession(seal, now);

  if (session === null) {
    return invalidSessionWithClearedCookie();
  }

  if (isSessionValidationFresh(session, now)) {
    return createSessionSuccessResponse(session.admin);
  }

  const backendResult = await adminBackend.me(session.backendToken);

  if (!backendResult.ok) {
    if (backendResult.error.kind === "authentication") {
      return invalidSessionWithClearedCookie();
    }

    return createSessionErrorResponse(backendResult.error);
  }

  const identity = backendResult.data.data;

  if (
    identity.id !== session.admin.id ||
    identity.role !== session.admin.role
  ) {
    return invalidSessionWithClearedCookie();
  }

  if (getRemainingSessionSeconds(session.expiresAt, now) <= 0) {
    return invalidSessionWithClearedCookie();
  }

  const refreshedSession = markSessionValidated(
    {
      ...session,
      admin: refreshSafeAdminIdentity(session.admin, identity),
    },
    now,
  );
  const refreshedSeal = await sealAdminSession(refreshedSession);
  const response = createSessionSuccessResponse(refreshedSession.admin);

  setSessionCookie(response, refreshedSeal, refreshedSession.expiresAt, now);

  return response;
}
