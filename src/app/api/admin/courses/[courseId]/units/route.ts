import type { NextRequest, NextResponse } from "next/server";

import { parseResourceId } from "@/lib/api/resource-id";
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
 * Explicit resource BFF for a course's units. Still no catch-all: the only
 * dynamic part is a course id, and it must prove itself a positive safe integer
 * before anything reaches the backend. The raw parameter is never echoed back.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const courseId = parseResourceId((await params).courseId);

  if (courseId === null) {
    return createSessionErrorResponse(
      {
        kind: "protocol",
        status: 400,
        message: "Geçersiz ders kimliği.",
      },
      400,
    );
  }

  const seal = readSessionSeal(request);

  if (seal === null) {
    return createInvalidSessionResponse();
  }

  const session = await unsealAdminSession(seal);

  if (session === null) {
    return invalidSessionWithClearedCookie();
  }

  const result = await adminContent.units(courseId, session.backendToken);

  if (!result.ok) {
    if (result.error.kind === "authentication") {
      return invalidSessionWithClearedCookie();
    }

    // 403, 404, 5xx, network and contract failures all leave the session alone.
    return createSessionErrorResponse(result.error);
  }

  return createResourceSuccessResponse(result.data.data);
}
