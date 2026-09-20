import "server-only";

import type { z } from "zod";

import type { AdminLoginRequest } from "@/contracts/admin/auth";
import type {
  CreateExerciseRequest,
  UpdateExerciseRequest,
} from "@/contracts/admin/exercise-editor";
import type {
  ContentPackage,
  CreateAdminRequest,
  CreateUnitRequest,
  UpdateAdminRequest,
  UpdateCurriculumRequest,
} from "@/contracts/admin/workflows";
import {
  createNetworkError,
  createProtocolError,
  type ApiError,
} from "@/lib/api/error";
import { normalizeHttpError } from "@/lib/api/normalize-error";
import { parseContract } from "@/lib/api/parse-contract";
import {
  buildExerciseQuery,
  type ExerciseServerFilters,
} from "@/features/content/exercise-filters";
import { requireResourceId } from "@/lib/api/resource-id";
import { serverEnv } from "@/lib/env/server";

export const ADMIN_LOGIN_TIMEOUT_MS = 15_000;
export const ADMIN_ME_TIMEOUT_MS = 10_000;
export const ADMIN_COURSES_TIMEOUT_MS = 10_000;
export const ADMIN_UNITS_TIMEOUT_MS = 10_000;
export const ADMIN_EXERCISES_TIMEOUT_MS = 10_000;
export const ADMIN_TOPICS_TIMEOUT_MS = 10_000;
export const ADMIN_EXERCISE_DETAIL_TIMEOUT_MS = 10_000;
export const ADMIN_EXERCISE_MUTATION_TIMEOUT_MS = 15_000;
export const ADMIN_UNIT_NODES_TIMEOUT_MS = 10_000;
export const ADMIN_NODE_PREVIEW_TIMEOUT_MS = 15_000;
export const ADMIN_PUBLISH_TIMEOUT_MS = 20_000;
export const ADMIN_WORKFLOW_TIMEOUT_MS = 20_000;

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
  exercises: {
    method: "GET",
    path: (unitId: number, query: string) =>
      `/api/admin/v1/units/${unitId}/exercises${query}`,
    timeoutMs: ADMIN_EXERCISES_TIMEOUT_MS,
  },
  topics: {
    method: "GET",
    path: (courseId: number) => `/api/admin/v1/courses/${courseId}/topics`,
    timeoutMs: ADMIN_TOPICS_TIMEOUT_MS,
  },
  exerciseDetail: {
    method: "GET",
    path: (exerciseId: number) => `/api/admin/v1/exercises/${exerciseId}`,
    timeoutMs: ADMIN_EXERCISE_DETAIL_TIMEOUT_MS,
  },
  createExercise: {
    method: "POST",
    path: "/api/admin/v1/exercises",
    timeoutMs: ADMIN_EXERCISE_MUTATION_TIMEOUT_MS,
  },
  updateExercise: {
    method: "PATCH",
    path: (exerciseId: number) => `/api/admin/v1/exercises/${exerciseId}`,
    timeoutMs: ADMIN_EXERCISE_MUTATION_TIMEOUT_MS,
  },
  unitNodes: {
    method: "GET",
    path: (unitId: number) => `/api/admin/v1/units/${unitId}/nodes`,
    timeoutMs: ADMIN_UNIT_NODES_TIMEOUT_MS,
  },
  // A dry run of the selection rule: it counts a real pool query, so it is
  // given more room than an ordinary read.
  nodePreview: {
    method: "GET",
    path: (nodeId: number) => `/api/admin/v1/nodes/${nodeId}/preview-selection`,
    timeoutMs: ADMIN_NODE_PREVIEW_TIMEOUT_MS,
  },
  publishUnit: {
    method: "POST",
    path: (unitId: number) => `/api/admin/v1/units/${unitId}/publish`,
    timeoutMs: ADMIN_PUBLISH_TIMEOUT_MS,
  },
  unitTemplates: {
    method: "GET",
    path: "/api/admin/v1/unit-templates",
    timeoutMs: ADMIN_UNITS_TIMEOUT_MS,
  },
  createUnit: {
    method: "POST",
    path: "/api/admin/v1/units",
    timeoutMs: ADMIN_WORKFLOW_TIMEOUT_MS,
  },
  archiveExercise: {
    method: "DELETE",
    path: (exerciseId: number) => `/api/admin/v1/exercises/${exerciseId}`,
    timeoutMs: ADMIN_EXERCISE_MUTATION_TIMEOUT_MS,
  },
  importContent: {
    method: "POST",
    path: "/api/admin/v1/content/import",
    timeoutMs: ADMIN_WORKFLOW_TIMEOUT_MS,
  },
  curriculumOptions: {
    method: "GET",
    path: "/api/admin/v1/curriculum/options",
    timeoutMs: ADMIN_UNITS_TIMEOUT_MS,
  },
  curriculumMapping: {
    method: "GET",
    path: (variantId: number) =>
      `/api/admin/v1/exam-variants/${variantId}/courses`,
    timeoutMs: ADMIN_UNITS_TIMEOUT_MS,
  },
  updateCurriculum: {
    method: "PUT",
    path: (variantId: number) =>
      `/api/admin/v1/exam-variants/${variantId}/courses`,
    timeoutMs: ADMIN_WORKFLOW_TIMEOUT_MS,
  },
  admins: {
    method: "GET",
    path: "/api/admin/v1/admins",
    timeoutMs: ADMIN_UNITS_TIMEOUT_MS,
  },
  createAdmin: {
    method: "POST",
    path: "/api/admin/v1/admins",
    timeoutMs: ADMIN_WORKFLOW_TIMEOUT_MS,
  },
  updateAdmin: {
    method: "PATCH",
    path: (adminId: string) =>
      `/api/admin/v1/admins/${encodeURIComponent(adminId)}`,
    timeoutMs: ADMIN_WORKFLOW_TIMEOUT_MS,
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
      operation:
        "me" | "courses" | "unitTemplates" | "curriculumOptions" | "admins";
      backendToken: string;
      signal?: AbortSignal;
    }>
  | Readonly<{
      operation: "units";
      courseId: number;
      backendToken: string;
      signal?: AbortSignal;
    }>
  | Readonly<{
      operation: "exercises";
      unitId: number;
      filters: ExerciseServerFilters;
      backendToken: string;
      signal?: AbortSignal;
    }>
  | Readonly<{
      operation: "topics";
      courseId: number;
      backendToken: string;
      signal?: AbortSignal;
    }>
  | Readonly<{
      operation: "exerciseDetail";
      exerciseId: number;
      backendToken: string;
      signal?: AbortSignal;
    }>
  | Readonly<{
      operation: "createExercise";
      body: CreateExerciseRequest;
      backendToken: string;
      signal?: AbortSignal;
    }>
  | Readonly<{
      operation: "updateExercise";
      exerciseId: number;
      body: UpdateExerciseRequest;
      backendToken: string;
      signal?: AbortSignal;
    }>
  | Readonly<{
      operation: "unitNodes" | "publishUnit";
      unitId: number;
      backendToken: string;
      signal?: AbortSignal;
    }>
  | Readonly<{
      operation: "nodePreview";
      nodeId: number;
      backendToken: string;
      signal?: AbortSignal;
    }>
  | Readonly<{
      operation: "createUnit";
      body: CreateUnitRequest;
      backendToken: string;
      signal?: AbortSignal;
    }>
  | Readonly<{
      operation: "archiveExercise";
      exerciseId: number;
      backendToken: string;
      signal?: AbortSignal;
    }>
  | Readonly<{
      operation: "importContent";
      body: ContentPackage;
      backendToken: string;
      signal?: AbortSignal;
    }>
  | Readonly<{
      operation: "curriculumMapping";
      variantId: number;
      backendToken: string;
      signal?: AbortSignal;
    }>
  | Readonly<{
      operation: "updateCurriculum";
      variantId: number;
      body: UpdateCurriculumRequest;
      backendToken: string;
      signal?: AbortSignal;
    }>
  | Readonly<{
      operation: "createAdmin";
      body: CreateAdminRequest;
      backendToken: string;
      signal?: AbortSignal;
    }>
  | Readonly<{
      operation: "updateAdmin";
      adminId: string;
      body: UpdateAdminRequest;
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

  if (request.operation === "exercises") {
    // Path from a validated number, query from validated enum members only.
    return ADMIN_BACKEND_ENDPOINTS.exercises.path(
      requireResourceId(request.unitId),
      buildExerciseQuery(request.filters),
    );
  }

  if (request.operation === "topics") {
    return ADMIN_BACKEND_ENDPOINTS.topics.path(
      requireResourceId(request.courseId),
    );
  }

  if (
    request.operation === "unitNodes" ||
    request.operation === "publishUnit"
  ) {
    return ADMIN_BACKEND_ENDPOINTS[request.operation].path(
      requireResourceId(request.unitId),
    );
  }

  if (request.operation === "nodePreview") {
    return ADMIN_BACKEND_ENDPOINTS.nodePreview.path(
      requireResourceId(request.nodeId),
    );
  }

  if (
    request.operation === "curriculumMapping" ||
    request.operation === "updateCurriculum"
  ) {
    return ADMIN_BACKEND_ENDPOINTS[request.operation].path(
      requireResourceId(request.variantId),
    );
  }

  if (request.operation === "updateAdmin") {
    return ADMIN_BACKEND_ENDPOINTS.updateAdmin.path(request.adminId);
  }

  if (
    request.operation === "exerciseDetail" ||
    request.operation === "updateExercise" ||
    request.operation === "archiveExercise"
  ) {
    return ADMIN_BACKEND_ENDPOINTS[request.operation].path(
      requireResourceId(request.exerciseId),
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

    if (
      request.operation === "createExercise" ||
      request.operation === "updateExercise" ||
      request.operation === "createUnit" ||
      request.operation === "importContent" ||
      request.operation === "updateCurriculum" ||
      request.operation === "createAdmin" ||
      request.operation === "updateAdmin"
    ) {
      headers.set("Content-Type", "application/json");
      init.body = JSON.stringify(request.body);
    }
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
