import type { NextRequest } from "next/server";

import { updateExerciseRequestSchema } from "@/contracts/admin/exercise-editor";
import { parseResourceId } from "@/lib/api/resource-id";
import { adminContent } from "@/lib/backend/admin-content";
import { verifyOrigin } from "@/lib/security/verify-origin";
import {
  clearSessionForBackendAuthentication,
  readBffSession,
  readEditorBffSession,
} from "@/lib/session/bff-session";
import {
  createInvalidRequestResponse,
  createOriginRejectedResponse,
  createResourceSuccessResponse,
  createSessionErrorResponse,
} from "@/lib/session/http";
import { adminWorkflows } from "@/lib/backend/admin-workflows";

function invalidExerciseId() {
  return createSessionErrorResponse(
    { kind: "protocol", status: 400, message: "Geçersiz soru kimliği." },
    400,
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ exerciseId: string }> },
) {
  const exerciseId = parseResourceId((await params).exerciseId);
  if (exerciseId === null) return invalidExerciseId();

  const sessionResult = await readBffSession(request);
  if (!sessionResult.ok) return sessionResult.response;

  const result = await adminContent.exerciseDetail(
    exerciseId,
    sessionResult.session.backendToken,
  );

  if (!result.ok) {
    return result.error.kind === "authentication"
      ? clearSessionForBackendAuthentication()
      : createSessionErrorResponse(result.error);
  }

  return createResourceSuccessResponse(result.data.data);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ exerciseId: string }> },
) {
  if (!verifyOrigin(request.headers.get("origin"))) {
    return createOriginRejectedResponse();
  }

  const exerciseId = parseResourceId((await params).exerciseId);
  if (exerciseId === null) return invalidExerciseId();

  const sessionResult = await readEditorBffSession(request);
  if (!sessionResult.ok) return sessionResult.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createInvalidRequestResponse();
  }

  const input = updateExerciseRequestSchema.safeParse(body);
  if (!input.success) return createInvalidRequestResponse();

  const result = await adminContent.updateExercise(
    exerciseId,
    input.data,
    sessionResult.session.backendToken,
  );

  if (!result.ok) {
    return result.error.kind === "authentication"
      ? clearSessionForBackendAuthentication()
      : createSessionErrorResponse(result.error);
  }

  return createResourceSuccessResponse(result.data.data);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ exerciseId: string }> },
) {
  if (!verifyOrigin(request.headers.get("origin")))
    return createOriginRejectedResponse();
  const exerciseId = parseResourceId((await params).exerciseId);
  if (exerciseId === null) return invalidExerciseId();
  const session = await readEditorBffSession(request);
  if (!session.ok) return session.response;
  const result = await adminWorkflows.archiveExercise(
    exerciseId,
    session.session.backendToken,
  );
  if (!result.ok)
    return result.error.kind === "authentication"
      ? clearSessionForBackendAuthentication()
      : createSessionErrorResponse(result.error);
  return createResourceSuccessResponse(result.data.data);
}
