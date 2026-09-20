import type { NextRequest } from "next/server";

import { parseResourceId } from "@/lib/api/resource-id";
import { adminContent } from "@/lib/backend/admin-content";
import { verifyOrigin } from "@/lib/security/verify-origin";
import {
  clearSessionForBackendAuthentication,
  readPublisherBffSession,
} from "@/lib/session/bff-session";
import {
  createOriginRejectedResponse,
  createResourceSuccessResponse,
  createSessionErrorResponse,
} from "@/lib/session/http";

/**
 * Publishing a unit. The request carries no body — the unit id in the path is
 * the entire intent, and there is deliberately no "force" flag: the readiness
 * block in the UI is a preview, the backend gate is the decision.
 *
 * A `CONTENT_NOT_PUBLISHABLE` 422 is passed through with its `details.blocking`
 * rows intact, so the UI can name every failing step instead of showing one
 * generic error.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ unitId: string }> },
) {
  if (!verifyOrigin(request.headers.get("origin"))) {
    return createOriginRejectedResponse();
  }

  const unitId = parseResourceId((await params).unitId);

  if (unitId === null) {
    return createSessionErrorResponse(
      { kind: "protocol", status: 400, message: "Geçersiz ünite kimliği." },
      400,
    );
  }

  const sessionResult = await readPublisherBffSession(request);
  if (!sessionResult.ok) return sessionResult.response;

  const result = await adminContent.publishUnit(
    unitId,
    sessionResult.session.backendToken,
  );

  if (!result.ok) {
    return result.error.kind === "authentication"
      ? clearSessionForBackendAuthentication()
      : createSessionErrorResponse(result.error);
  }

  return createResourceSuccessResponse(result.data.data);
}
