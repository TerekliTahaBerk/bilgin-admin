import "server-only";

import type { z } from "zod";

import type { AdminLoginRequest } from "@/contracts/admin/auth";
import {
  createNetworkError,
  createProtocolError,
  type ApiError,
} from "@/lib/api/error";
import { normalizeHttpError } from "@/lib/api/normalize-error";
import { parseContract } from "@/lib/api/parse-contract";
import { requireResourceId } from "@/lib/api/resource-id";
import { serverEnv } from "@/lib/env/server";

export const ADMIN_LOGIN_TIMEOUT_MS = 15_000;
export const ADMIN_ME_TIMEOUT_MS = 10_000;
export const ADMIN_COURSES_TIMEOUT_MS = 10_000;
export const ADMIN_UNITS_TIMEOUT_MS = 10_000;

const ADMIN_BACKEND_ENDPOINTS = {
  login: {
    method: "POST",
    path: "/api/admin/v1/auth/login",
    timeoutMs: ADMIN_LOGIN_TIMEOUT_MS,
  },
  me: {
    method: "GET",
    path: "/api/admin/v1/me",
    timeoutMs: ADMIN_ME_TIMEOUT_MS,
  },
  courses: {
    method: "GET",
    path: "/api/admin/v1/courses",
    timeoutMs: ADMIN_COURSES_TIMEOUT_MS,
  },
  units: {
    method: "GET",
    // The only dynamic segment in the registry. It is produced here, from a
    // number the caller has already had validated — callers cannot supply a
    // path of their own.
    path: (courseId: number) => `/api/admin/v1/courses/${courseId}/units`,
    timeoutMs: ADMIN_UNITS_TIMEOUT_MS,
  },
} as const;

export type BackendResult<Value> =
  { ok: true; data: Value } | { ok: false; error: ApiError };

export type BackendRequestOptions = Readonly<{
  signal?: AbortSignal;
}>;

type AdminBackendRequest =
  | Readonly<{
      operation: "login";
      body: AdminLoginRequest;
      signal?: AbortSignal;
    }>
  | Readonly<{
      operation: "me" | "courses";
      backendToken: string;
      signal?: AbortSignal;
    }>
  | Readonly<{
      operation: "units";
      courseId: number;
      backendToken: string;
      signal?: AbortSignal;
    }>;

type JsonReadResult = { parsed: true; value: unknown } | { parsed: false };

function isJsonContentType(contentType: string | null): boolean {
  if (contentType === null) {
    return false;
  }

  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();

  return (
    mediaType === "application/json" ||
    (mediaType?.startsWith("application/") === true &&
      mediaType.endsWith("+json"))
  );
}

function parseJson(text: string): JsonReadResult {
  if (text.trim().length === 0) {
    return { parsed: false };
  }

  try {
    return { parsed: true, value: JSON.parse(text) as unknown };
  } catch {
    return { parsed: false };
  }
}

function createRequestSignal(
  timeoutMs: number,
  callerSignal: AbortSignal | undefined,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);

  return callerSignal
    ? AbortSignal.any([callerSignal, timeoutSignal])
    : timeoutSignal;
}

function endpointPath(request: AdminBackendRequest): string {
  if (request.operation === "units") {
    // Validated again here: the path is built from a number, never a string.
    return ADMIN_BACKEND_ENDPOINTS.units.path(
      requireResourceId(request.courseId),
    );
  }

  return ADMIN_BACKEND_ENDPOINTS[request.operation].path;
}

function createBackendRequest(request: AdminBackendRequest): {
  url: URL;
  init: RequestInit;
} {
  const endpoint = ADMIN_BACKEND_ENDPOINTS[request.operation];
  const headers = new Headers({ Accept: "application/json" });
  const init: RequestInit = {
    method: endpoint.method,
    headers,
    cache: "no-store",
    signal: createRequestSignal(endpoint.timeoutMs, request.signal),
  };

  if (request.operation === "login") {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(request.body);
  } else {
    headers.set("Authorization", `Bearer ${request.backendToken}`);
  }

  return {
    url: new URL(endpointPath(request), serverEnv.BILGIN_API_URL),
    init,
  };
}

export async function requestAdminBackend<Value>(
  request: AdminBackendRequest,
  responseSchema: z.ZodType<Value>,
): Promise<BackendResult<Value>> {
  const { url, init } = createBackendRequest(request);

  try {
    const response = await fetch(url, init);
    const responseText = await response.text();
    const contentTypeIsJson = isJsonContentType(
      response.headers.get("content-type"),
    );
    const json = contentTypeIsJson
      ? parseJson(responseText)
      : ({ parsed: false } as const);

    if (!response.ok) {
      return {
        ok: false,
        error: normalizeHttpError({
          status: response.status,
          body: json.parsed ? json.value : null,
          retryAfter: response.headers.get("retry-after"),
        }),
      };
    }

    if (!contentTypeIsJson || !json.parsed) {
      return {
        ok: false,
        error: createProtocolError(response.status),
      };
    }

    const contract = parseContract(responseSchema, json.value, response.status);

    return contract.success
      ? { ok: true, data: contract.data }
      : { ok: false, error: contract.error };
  } catch {
    return { ok: false, error: createNetworkError() };
  }
}
