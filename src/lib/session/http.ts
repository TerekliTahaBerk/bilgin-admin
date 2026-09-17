import "server-only";

import { NextResponse } from "next/server";

import type { SafeAdmin } from "@/contracts/admin/session";
import type { ApiError, ApiErrorKind } from "@/lib/api/error";

const SESSION_NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

const browserStatusByErrorKind: Record<ApiErrorKind, number> = {
  authentication: 401,
  authorization: 403,
  validation: 422,
  not_found: 404,
  rate_limit: 429,
  server: 502,
  network: 502,
  protocol: 502,
  contract: 502,
  unknown: 502,
};

export function createSessionSuccessResponse(admin: SafeAdmin): NextResponse {
  return NextResponse.json(
    { data: { admin } },
    { status: 200, headers: SESSION_NO_STORE_HEADERS },
  );
}

export function createSessionErrorResponse(
  error: ApiError,
  status: number = browserStatusByErrorKind[error.kind],
): NextResponse {
  return NextResponse.json(
    { error },
    { status, headers: SESSION_NO_STORE_HEADERS },
  );
}

export function createNoContentSessionResponse(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: SESSION_NO_STORE_HEADERS,
  });
}

export function createOriginRejectedResponse(): NextResponse {
  return createSessionErrorResponse({
    kind: "authorization",
    status: 403,
    code: "ORIGIN_REJECTED",
    message: "İstek kaynağı doğrulanamadı.",
  });
}

export function createInvalidRequestResponse(): NextResponse {
  return createSessionErrorResponse(
    {
      kind: "protocol",
      status: 400,
      message: "Geçersiz istek gövdesi.",
    },
    400,
  );
}

export function createInvalidSessionResponse(): NextResponse {
  return createSessionErrorResponse({
    kind: "authentication",
    status: 401,
    message: "Oturum doğrulanamadı.",
  });
}
