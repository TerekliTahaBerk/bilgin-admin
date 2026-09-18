import type { NextRequest } from "next/server";

import { createExerciseRequestSchema } from "@/contracts/admin/exercise-editor";
import { adminContent } from "@/lib/backend/admin-content";
import { verifyOrigin } from "@/lib/security/verify-origin";
import {
  clearSessionForBackendAuthentication,
  readEditorBffSession,
} from "@/lib/session/bff-session";
import {
  createInvalidRequestResponse,
  createOriginRejectedResponse,
  createResourceSuccessResponse,
  createSessionErrorResponse,
} from "@/lib/session/http";

export async function POST(request: NextRequest) {
  if (!verifyOrigin(request.headers.get("origin"))) {
    return createOriginRejectedResponse();
  }

  const sessionResult = await readEditorBffSession(request);
  if (!sessionResult.ok) return sessionResult.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createInvalidRequestResponse();
  }

  const input = createExerciseRequestSchema.safeParse(body);
  if (!input.success) return createInvalidRequestResponse();

  const result = await adminContent.createExercise(
    input.data,
    sessionResult.session.backendToken,
  );

  if (!result.ok) {
    return result.error.kind === "authentication"
      ? clearSessionForBackendAuthentication()
      : createSessionErrorResponse(result.error);
  }

  return createResourceSuccessResponse(result.data.data, 201);
}
