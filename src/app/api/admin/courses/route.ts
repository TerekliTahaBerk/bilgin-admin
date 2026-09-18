import type { NextRequest, NextResponse } from "next/server";

import { adminContent } from "@/lib/backend/admin-content";
import { clearSessionCookie, readSessionSeal } from "@/lib/session/cookie";
import {
  createInvalidSessionResponse,
  createResourceSuccessResponse,
  createSessionErrorResponse,
} from "@/lib/session/http";
import { unsealAdminSession } from "@/lib/session/read";

function invalidSessionWithClearedCookie(): NextResponse {
  const response = createInvalidSessionResponse();

  clearSessionCookie(response);

  return response;
}

/**
 * Explicit resource BFF. There is no catch-all: every backend endpoint the
 * browser can reach has its own route file and its own registry entry.
 *
 * The browser never sees the backend token or origin. Incoming Authorization,
 * Cookie, Host and forwarding headers are not read here and never reach the
 * backend — the outgoing Authorization is built solely from the encrypted
 * session.
 */
export async function GET(request: NextRequest) {
  const seal = readSessionSeal(request);

  if (seal === null) {
    return createInvalidSessionResponse();
  }

  const session = await unsealAdminSession(seal);

  if (session === null) {
    return invalidSessionWithClearedCookie();
  }

  const result = await adminContent.courses(session.backendToken);

  if (!result.ok) {
    // The backend rejecting our token means this session is dead; every other
    // failure (403, 5xx, network, contract) leaves the session intact.
    if (result.error.kind === "authentication") {
      return invalidSessionWithClearedCookie();
    }

    return createSessionErrorResponse(result.error);
  }

  return createResourceSuccessResponse(result.data.data);
}
