import type { NextRequest } from "next/server";

import { adminWorkflows } from "@/lib/backend/admin-workflows";
import {
  clearSessionForBackendAuthentication,
  readBffSession,
} from "@/lib/session/bff-session";
import {
  createResourceSuccessResponse,
  createSessionErrorResponse,
} from "@/lib/session/http";

export async function GET(request: NextRequest) {
  const session = await readBffSession(request);
  if (!session.ok) return session.response;
  const result = await adminWorkflows.templates(session.session.backendToken);
  if (!result.ok)
    return result.error.kind === "authentication"
      ? clearSessionForBackendAuthentication()
      : createSessionErrorResponse(result.error);
  return createResourceSuccessResponse(result.data.data);
}
