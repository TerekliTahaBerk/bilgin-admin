import type { NextRequest } from "next/server";

import { parseResourceId } from "@/lib/api/resource-id";
import { adminContent } from "@/lib/backend/admin-content";
import {
  clearSessionForBackendAuthentication,
  readBffSession,
} from "@/lib/session/bff-session";
import {
  createResourceSuccessResponse,
  createSessionErrorResponse,
} from "@/lib/session/http";

/**
 * Explicit resource BFF for a unit's nodes. Reading content is open to every
 * authenticated admin on the backend, so this route carries no ability guard —
 * inventing one here would hide data the backend is willing to serve.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ unitId: string }> },
) {
  const unitId = parseResourceId((await params).unitId);

  if (unitId === null) {
    return createSessionErrorResponse(
      { kind: "protocol", status: 400, message: "Geçersiz ünite kimliği." },
      400,
    );
  }

  const sessionResult = await readBffSession(request);
  if (!sessionResult.ok) return sessionResult.response;

  const result = await adminContent.unitNodes(
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
