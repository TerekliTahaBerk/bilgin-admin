import { z } from "zod";

import {
  coursesResponseSchema,
  unitsResponseSchema,
  type Course,
  type Unit,
} from "@/contracts/admin/content";
import { apiErrorKinds, type ApiError } from "@/lib/api/error";
import { requireResourceId } from "@/lib/api/resource-id";

const COURSES_PATH = "/api/admin/courses";

const resourceErrorSchema = z.object({
  error: z.object({
    kind: z.enum(apiErrorKinds),
    status: z.number().int().nullable(),
    code: z.string().optional(),
    message: z.string(),
    fields: z.record(z.string(), z.array(z.string())).optional(),
    details: z.unknown().optional(),
    retryAfterSeconds: z.number().int().nonnegative().optional(),
  }),
});

// The BFF is trusted to be ours, not to be correct: its payload is validated
// against the same frontend-owned contract as any other response.
const coursesPayloadSchema = coursesResponseSchema.pick({ data: true });
const unitsPayloadSchema = unitsResponseSchema.pick({ data: true });

const networkError: ApiError = {
  kind: "network",
  status: null,
  message: "Sunucuya ulaşılamadı. Lütfen bağlantınızı kontrol edin.",
};

function contractError(status: number | null): ApiError {
  return {
    kind: "contract",
    status,
    message: "Sunucu yanıtı beklenen formatta değil.",
  };
}

async function readJson(response: Response): Promise<unknown | null> {
  const text = await response.text();

  if (text.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * Private. The public surface stays explicit — `getCourses` and
 * `getCourseUnits` — so no caller can hand this module a path of its own.
 *
 * Rejects with an `ApiError` so TanStack Query's retry policy can branch on the
 * same error taxonomy the rest of the app uses.
 */
type ParseResult<Value> =
  { success: true; data: Value } | { success: false; data?: undefined };

async function requestResource<Value>(
  path: string,
  parse: (body: unknown) => ParseResult<Value>,
  options: { signal?: AbortSignal },
): Promise<Value> {
  let response: Response;

  try {
    response = await fetch(path, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal: options.signal,
    });
  } catch {
    throw networkError;
  }

  const body = await readJson(response);

  if (!response.ok) {
    const parsed = resourceErrorSchema.safeParse(body);

    throw parsed.success ? parsed.data.error : contractError(response.status);
  }

  const parsed = parse(body);

  if (!parsed.success) {
    throw contractError(response.status);
  }

  return parsed.data;
}

export function getCourses(
  options: { signal?: AbortSignal } = {},
): Promise<Course[]> {
  return requestResource(
    COURSES_PATH,
    (body) => {
      const parsed = coursesPayloadSchema.safeParse(body);

      return parsed.success
        ? { success: true, data: parsed.data.data }
        : { success: false };
    },
    options,
  );
}

export function getCourseUnits(
  courseId: number,
  options: { signal?: AbortSignal } = {},
): Promise<Unit[]> {
  // The path is built from a validated number, never from raw input.
  const path = `${COURSES_PATH}/${requireResourceId(courseId)}/units`;

  return requestResource(
    path,
    (body) => {
      const parsed = unitsPayloadSchema.safeParse(body);

      return parsed.success
        ? { success: true, data: parsed.data.data }
        : { success: false };
    },
    options,
  );
}
