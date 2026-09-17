import type { ZodIssue } from "zod";

import { adminLoginRequestSchema } from "@/contracts/admin/auth";
import type { ApiError } from "@/lib/api/error";
import { adminBackend } from "@/lib/backend/admin-auth";
import { verifyOrigin } from "@/lib/security/verify-origin";
import { setSessionCookie } from "@/lib/session/cookie";
import {
  createInvalidRequestResponse,
  createOriginRejectedResponse,
  createSessionErrorResponse,
  createSessionSuccessResponse,
} from "@/lib/session/http";
import { mapLoginAdminToSafeAdmin } from "@/lib/session/map-admin";
import {
  createAdminSessionPayload,
  sealAdminSession,
} from "@/lib/session/write";

function loginValidationError(issues: ZodIssue[]): ApiError {
  const fields: Record<string, string[]> = {};

  for (const issue of issues) {
    const field = issue.path[0];

    if (field === "email") {
      fields.email = ["Geçerli bir e-posta adresi girin."];
    }

    if (field === "password") {
      fields.password = ["Şifre zorunludur."];
    }
  }

  return {
    kind: "validation",
    status: 422,
    message: "Gönderilen bilgiler geçersiz.",
    ...(Object.keys(fields).length === 0 ? {} : { fields }),
  };
}

export async function POST(request: Request) {
  if (!verifyOrigin(request.headers.get("origin"))) {
    return createOriginRejectedResponse();
  }

  let input: unknown;

  try {
    input = await request.json();
  } catch {
    return createInvalidRequestResponse();
  }

  const parsedInput = adminLoginRequestSchema.safeParse(input);

  if (!parsedInput.success) {
    return createSessionErrorResponse(
      loginValidationError(parsedInput.error.issues),
    );
  }

  const backendResult = await adminBackend.login(parsedInput.data);

  if (!backendResult.ok) {
    return createSessionErrorResponse(backendResult.error);
  }

  const admin = mapLoginAdminToSafeAdmin(backendResult.data.data.admin);
  const session = createAdminSessionPayload({
    backendToken: backendResult.data.data.token,
    admin,
  });
  const seal = await sealAdminSession(session);
  const response = createSessionSuccessResponse(admin);

  setSessionCookie(response, seal, session.expiresAt, session.issuedAt);

  return response;
}
