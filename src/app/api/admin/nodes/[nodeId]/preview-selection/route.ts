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
 * Selection-rule dry run for one node. It is a GET because it changes nothing:
 * the backend resolves publication candidates in the read query rather than by
 * publishing and rolling back.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> },
) {
  const nodeId = parseResourceId((await params).nodeId);

  if (nodeId === null) {
    return createSessionErrorResponse(
      { kind: "protocol", status: 400, message: "Geçersiz adım kimliği." },
      400,
    );
  }

  const sessionResult = await readBffSession(request);
  if (!sessionResult.ok) return sessionResult.response;

  const result = await adminContent.nodePreview(
    nodeId,
    sessionResult.session.backendToken,
  );

  if (!result.ok) {
    return result.error.kind === "authentication"
      ? clearSessionForBackendAuthentication()
      : createSessionErrorResponse(result.error);
  }

  return createResourceSuccessResponse(result.data.data);
}
