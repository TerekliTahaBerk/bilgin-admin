import { describe, expect, it } from "vitest";

import { adminLoginResponseSchema } from "@/contracts/admin/auth";
import {
  createContractError,
  createNetworkError,
  createProtocolError,
} from "@/lib/api/error";
import {
  normalizeHttpError,
  parseRetryAfterSeconds,
} from "@/lib/api/normalize-error";
import { parseContract } from "@/lib/api/parse-contract";
import {
  customDomainValidationError,
  customForbiddenError,
  laravelCredentialValidationError,
  malformedAdminResponse,
  validEditorLoginResponse,
} from "@/test/fixtures/admin-api";

describe("normalizeHttpError", () => {
  it("maps 401 independently of the body shape", () => {
    expect(normalizeHttpError({ status: 401, body: null })).toMatchObject({
      kind: "authentication",
      status: 401,
    });
  });

  it("maps 403 and preserves the backend code", () => {
    expect(
      normalizeHttpError({ status: 403, body: customForbiddenError }),
    ).toEqual({
      kind: "authorization",
      status: 403,
      code: "FORBIDDEN",
      message: "Bu işlem için yetkin yok.",
    });
  });

  it("maps Laravel 422 fields", () => {
    expect(
      normalizeHttpError({
        status: 422,
        body: laravelCredentialValidationError,
      }),
    ).toEqual({
      kind: "validation",
      status: 422,
      message: laravelCredentialValidationError.message,
      fields: laravelCredentialValidationError.errors,
    });
  });

  it("maps custom domain 422 code and details", () => {
    expect(
      normalizeHttpError({
        status: 422,
        body: customDomainValidationError,
      }),
    ).toEqual({
      kind: "validation",
      status: 422,
      code: "TOPIC_MISMATCH",
      message: customDomainValidationError.error.message,
      details: customDomainValidationError.error.details,
    });
  });

  it("maps 404", () => {
    expect(normalizeHttpError({ status: 404, body: undefined })).toMatchObject({
      kind: "not_found",
      status: 404,
    });
  });

  it("maps 429 and parses integer Retry-After seconds", () => {
    expect(
      normalizeHttpError({ status: 429, body: null, retryAfter: "30" }),
    ).toMatchObject({
      kind: "rate_limit",
      status: 429,
      retryAfterSeconds: 30,
    });
  });

  it("ignores non-integer Retry-After values", () => {
    expect(parseRetryAfterSeconds("Wed, 21 Oct 2026 07:28:00 GMT")).toBe(
      undefined,
    );
  });

  it("uses a safe generic message for 5xx", () => {
    const rawBody = {
      error: {
        code: "DATABASE_FAILURE",
        message: "SQLSTATE private stack trace",
        details: { query: "select password from admin_users" },
      },
    };
    const result = normalizeHttpError({ status: 500, body: rawBody });

    expect(result).toEqual({
      kind: "server",
      status: 500,
      message: "Sunucu hatası oluştu. Lütfen daha sonra tekrar deneyin.",
    });
    expect(JSON.stringify(result)).not.toContain("SQLSTATE");
    expect(JSON.stringify(result)).not.toContain("password");
  });

  it("falls back safely for a malformed object body", () => {
    const result = normalizeHttpError({
      status: 400,
      body: malformedAdminResponse,
    });

    expect(result).toEqual({
      kind: "unknown",
      status: 400,
      message: "İstek tamamlanamadı.",
    });
    expect(JSON.stringify(result)).not.toContain("raw-token-must-not-leak");
    expect(JSON.stringify(result)).not.toContain("raw-password-must-not-leak");
  });

  it("does not expose an HTML response body", () => {
    const result = normalizeHttpError({
      status: 502,
      body: "<html>private upstream exception</html>",
    });

    expect(JSON.stringify(result)).not.toContain("private upstream exception");
  });
});

describe("transport-independent error primitives", () => {
  it("creates network, protocol and contract errors", () => {
    expect(createNetworkError()).toMatchObject({
      kind: "network",
      status: null,
    });
    expect(createProtocolError(502)).toMatchObject({
      kind: "protocol",
      status: 502,
    });
    expect(createContractError(200)).toMatchObject({
      kind: "contract",
      status: 200,
    });
  });

  it("returns parsed contract data without throwing", () => {
    expect(
      parseContract(adminLoginResponseSchema, validEditorLoginResponse),
    ).toEqual({ success: true, data: validEditorLoginResponse });
  });

  it("returns safe contract error and inspectable diagnostics", () => {
    const result = parseContract(
      adminLoginResponseSchema,
      malformedAdminResponse,
      200,
    );

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error).toEqual(createContractError(200));
    expect(
      result.diagnostics.some((issue) => issue.path === "data.admin"),
    ).toBe(true);
    expect(JSON.stringify(result.error)).not.toContain(
      "raw-token-must-not-leak",
    );
  });
});
