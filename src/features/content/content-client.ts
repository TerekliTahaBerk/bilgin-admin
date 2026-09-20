import { z } from "zod";

import {
  coursesResponseSchema,
  unitExercisesResponseSchema,
  unitsResponseSchema,
  type Course,
  type Unit,
  type UnitExercisesData,
} from "@/contracts/admin/content";
import {
  courseTopicsResponseSchema,
  createExerciseResponseSchema,
  exerciseDetailResponseSchema,
  updateExerciseResponseSchema,
  type CourseTopicsData,
  type CreateExerciseRequest,
  type ExerciseDetail,
  type UpdateExerciseRequest,
} from "@/contracts/admin/exercise-editor";
import {
  nodePreviewResponseSchema,
  publishUnitResponseSchema,
  unitNodesResponseSchema,
  type NodePreview,
  type PublishUnitData,
  type UnitNodesData,
} from "@/contracts/admin/publication";
import {
  buildExerciseQuery,
  type ExerciseServerFilters,
} from "@/features/content/exercise-filters";
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
const exercisesPayloadSchema = unitExercisesResponseSchema.pick({ data: true });
const topicsPayloadSchema = courseTopicsResponseSchema.pick({ data: true });
const exerciseDetailPayloadSchema = exerciseDetailResponseSchema.pick({
  data: true,
});
const createExercisePayloadSchema = createExerciseResponseSchema.pick({
  data: true,
});
const updateExercisePayloadSchema = updateExerciseResponseSchema.pick({
  data: true,
});
const unitNodesPayloadSchema = unitNodesResponseSchema.pick({ data: true });
const nodePreviewPayloadSchema = nodePreviewResponseSchema.pick({ data: true });
const publishUnitPayloadSchema = publishUnitResponseSchema.pick({ data: true });

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

/**
 * `input === undefined` sends no body and no Content-Type at all. An intent
 * that carries no data (publishing a unit) should not have to invent an empty
 * JSON object to be expressible.
 */
async function requestMutation<Value>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  input: unknown,
  parse: (body: unknown) => ParseResult<Value>,
): Promise<Value> {
  let response: Response;

  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      ...(input === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          }),
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
  if (!parsed.success) throw contractError(response.status);

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

/**
 * `filters` carries only the two server-applied parameters — topic and
 * difficulty are client-side and deliberately absent from this signature, so
 * they cannot cause a request.
 */
export function getUnitExercises(
  unitId: number,
  filters: ExerciseServerFilters = {},
  options: { signal?: AbortSignal } = {},
): Promise<UnitExercisesData> {
  const path = `/api/admin/units/${requireResourceId(unitId)}/exercises${buildExerciseQuery(filters)}`;

  return requestResource(
    path,
    (body) => {
      const parsed = exercisesPayloadSchema.safeParse(body);

      return parsed.success
        ? { success: true, data: parsed.data.data }
        : { success: false };
    },
    options,
  );
}

export function getCourseTopics(
  courseId: number,
  options: { signal?: AbortSignal } = {},
): Promise<CourseTopicsData> {
  return requestResource(
    `${COURSES_PATH}/${requireResourceId(courseId)}/topics`,
    (body) => {
      const parsed = topicsPayloadSchema.safeParse(body);
      return parsed.success
        ? { success: true, data: parsed.data.data }
        : { success: false };
    },
    options,
  );
}

export function getExerciseDetail(
  exerciseId: number,
  options: { signal?: AbortSignal } = {},
): Promise<ExerciseDetail> {
  return requestResource(
    `/api/admin/exercises/${requireResourceId(exerciseId)}`,
    (body) => {
      const parsed = exerciseDetailPayloadSchema.safeParse(body);
      return parsed.success
        ? { success: true, data: parsed.data.data }
        : { success: false };
    },
    options,
  );
}

export function createExercise(input: CreateExerciseRequest) {
  return requestMutation("/api/admin/exercises", "POST", input, (body) => {
    const parsed = createExercisePayloadSchema.safeParse(body);
    return parsed.success
      ? { success: true, data: parsed.data.data }
      : { success: false };
  });
}

export function updateExercise(
  exerciseId: number,
  input: UpdateExerciseRequest,
) {
  return requestMutation(
    `/api/admin/exercises/${requireResourceId(exerciseId)}`,
    "PATCH",
    input,
    (body) => {
      const parsed = updateExercisePayloadSchema.safeParse(body);
      return parsed.success
        ? { success: true, data: parsed.data.data }
        : { success: false };
    },
  );
}

export function getUnitNodes(
  unitId: number,
  options: { signal?: AbortSignal } = {},
): Promise<UnitNodesData> {
  return requestResource(
    `/api/admin/units/${requireResourceId(unitId)}/nodes`,
    (body) => {
      const parsed = unitNodesPayloadSchema.safeParse(body);
      return parsed.success
        ? { success: true, data: parsed.data.data }
        : { success: false };
    },
    options,
  );
}

export function getNodePreview(
  nodeId: number,
  options: { signal?: AbortSignal } = {},
): Promise<NodePreview> {
  return requestResource(
    `/api/admin/nodes/${requireResourceId(nodeId)}/preview-selection`,
    (body) => {
      const parsed = nodePreviewPayloadSchema.safeParse(body);
      return parsed.success
        ? { success: true, data: parsed.data.data }
        : { success: false };
    },
    options,
  );
}

export function publishUnit(unitId: number): Promise<PublishUnitData> {
  return requestMutation(
    `/api/admin/units/${requireResourceId(unitId)}/publish`,
    "POST",
    undefined,
    (body) => {
      const parsed = publishUnitPayloadSchema.safeParse(body);
      return parsed.success
        ? { success: true, data: parsed.data.data }
        : { success: false };
    },
  );
}
