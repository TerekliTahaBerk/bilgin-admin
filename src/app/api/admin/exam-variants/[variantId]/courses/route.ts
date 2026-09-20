import type { NextRequest } from "next/server";
import { updateCurriculumRequestSchema } from "@/contracts/admin/workflows";
import { parseResourceId } from "@/lib/api/resource-id";
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

function invalid() {
  return createSessionErrorResponse(
    { kind: "protocol", status: 400, message: "Geçersiz varyant kimliği." },
    400,
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ variantId: string }> },
) {
  const variantId = parseResourceId((await params).variantId);
  if (variantId === null) return invalid();
  const session = await readCurriculumBffSession(request);
  if (!session.ok) return session.response;
  const result = await adminWorkflows.curriculumMapping(
    variantId,
    session.session.backendToken,
  );
  if (!result.ok)
    return result.error.kind === "authentication"
      ? clearSessionForBackendAuthentication()
      : createSessionErrorResponse(result.error);
  return createResourceSuccessResponse(result.data.data);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ variantId: string }> },
) {
  if (!verifyOrigin(request.headers.get("origin")))
    return createOriginRejectedResponse();
  const variantId = parseResourceId((await params).variantId);
  if (variantId === null) return invalid();
  const session = await readCurriculumBffSession(request);
  if (!session.ok) return session.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createInvalidRequestResponse();
  }
  const input = updateCurriculumRequestSchema.safeParse(body);
  if (!input.success) return createInvalidRequestResponse();
  const result = await adminWorkflows.updateCurriculum(
    variantId,
    input.data,
    session.session.backendToken,
  );
  if (!result.ok)
    return result.error.kind === "authentication"
      ? clearSessionForBackendAuthentication()
      : createSessionErrorResponse(result.error);
  return createResourceSuccessResponse(result.data.data);
}
