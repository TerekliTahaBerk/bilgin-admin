import type { NextRequest } from "next/server";
import { updateAdminRequestSchema } from "@/contracts/admin/workflows";
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

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ adminId: string }> },
) {
  if (!verifyOrigin(request.headers.get("origin")))
    return createOriginRejectedResponse();
  const adminId = (await params).adminId;
  if (!uuid.test(adminId)) return createInvalidRequestResponse();
  const session = await readCurriculumBffSession(request);
  if (!session.ok) return session.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createInvalidRequestResponse();
  }
  const input = updateAdminRequestSchema.safeParse(body);
  if (!input.success) return createInvalidRequestResponse();
  const result = await adminWorkflows.updateAdmin(
    adminId,
    input.data,
    session.session.backendToken,
  );
  if (!result.ok)
    return result.error.kind === "authentication"
      ? clearSessionForBackendAuthentication()
      : createSessionErrorResponse(result.error);
  return createResourceSuccessResponse(result.data.data);
}
