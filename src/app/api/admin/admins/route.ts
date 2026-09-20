import type { NextRequest } from "next/server";
import { createAdminRequestSchema } from "@/contracts/admin/workflows";
import { adminWorkflows } from "@/lib/backend/admin-workflows";
import { verifyOrigin } from "@/lib/security/verify-origin";
import {
  clearSessionForBackendAuthentication,
  readCurriculumBffSession,
} from "@/lib/session/bff-session";
import {
  createInvalidRequestResponse,
  createOriginRejectedResponse,
  createResourceSuccessResponse,
  createSessionErrorResponse,
} from "@/lib/session/http";

export async function GET(request: NextRequest) {
  const session = await readCurriculumBffSession(request);
  if (!session.ok) return session.response;
  const result = await adminWorkflows.admins(session.session.backendToken);
  if (!result.ok)
    return result.error.kind === "authentication"
      ? clearSessionForBackendAuthentication()
      : createSessionErrorResponse(result.error);
  return createResourceSuccessResponse(result.data.data);
}

export async function POST(request: NextRequest) {
  if (!verifyOrigin(request.headers.get("origin")))
    return createOriginRejectedResponse();
  const session = await readCurriculumBffSession(request);
  if (!session.ok) return session.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createInvalidRequestResponse();
  }
  const input = createAdminRequestSchema.safeParse(body);
  if (!input.success) return createInvalidRequestResponse();
  const result = await adminWorkflows.createAdmin(
    input.data,
    session.session.backendToken,
  );
  if (!result.ok)
    return result.error.kind === "authentication"
      ? clearSessionForBackendAuthentication()
      : createSessionErrorResponse(result.error);
  return createResourceSuccessResponse(result.data.data, 201);
}
