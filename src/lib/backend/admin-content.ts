import "server-only";

import {
  coursesResponseSchema,
  unitExercisesResponseSchema,
  unitsResponseSchema,
  type CoursesResponse,
  type UnitExercisesResponse,
  type UnitsResponse,
} from "@/contracts/admin/content";
import {
  courseTopicsResponseSchema,
  createExerciseResponseSchema,
  exerciseDetailResponseSchema,
  updateExerciseResponseSchema,
  type CourseTopicsResponse,
  type CreateExerciseRequest,
  type CreateExerciseResponse,
  type ExerciseDetailResponse,
  type UpdateExerciseRequest,
  type UpdateExerciseResponse,
} from "@/contracts/admin/exercise-editor";
import {
  requireExerciseFilters,
  type ExerciseServerFilters,
} from "@/features/content/exercise-filters";
import { requireResourceId } from "@/lib/api/resource-id";
import {
  requestAdminBackend,
  type BackendRequestOptions,
  type BackendResult,
} from "@/lib/backend/client";

function requireBackendToken(backendToken: string): string {
  if (backendToken.trim().length === 0) {
    throw new TypeError("A backend token is required.");
  }

  return backendToken;
}

/**
 * Content read operations. Each one names a fixed endpoint in the transport
 * registry — there is deliberately no `get(path)` escape hatch, so a caller can
 * never choose the backend path.
 */
export const adminContent = Object.freeze({
  courses(
    backendToken: string,
    options: BackendRequestOptions = {},
  ): Promise<BackendResult<CoursesResponse>> {
    return requestAdminBackend(
      {
        operation: "courses",
        backendToken: requireBackendToken(backendToken),
        signal: options.signal,
      },
      coursesResponseSchema,
    );
  },

  /**
   * `courseId` is validated here and again while the path is built. A caller
   * cannot pass a path, only an id — there is no get(path) operation.
   */
  units(
    courseId: number,
    backendToken: string,
    options: BackendRequestOptions = {},
  ): Promise<BackendResult<UnitsResponse>> {
    return requestAdminBackend(
      {
        operation: "units",
        courseId: requireResourceId(courseId),
        backendToken: requireBackendToken(backendToken),
        signal: options.signal,
      },
      unitsResponseSchema,
    );
  },

  /**
   * `filters` only ever carries the two parameters the backend applies, and
   * each is re-validated while the query string is built.
   */
  exercises(
    unitId: number,
    filters: ExerciseServerFilters,
    backendToken: string,
    options: BackendRequestOptions = {},
  ): Promise<BackendResult<UnitExercisesResponse>> {
    return requestAdminBackend(
      {
        operation: "exercises",
        unitId: requireResourceId(unitId),
        filters: requireExerciseFilters(filters),
        backendToken: requireBackendToken(backendToken),
        signal: options.signal,
      },
      unitExercisesResponseSchema,
    );
  },

  topics(
    courseId: number,
    backendToken: string,
    options: BackendRequestOptions = {},
  ): Promise<BackendResult<CourseTopicsResponse>> {
    return requestAdminBackend(
      {
        operation: "topics",
        courseId: requireResourceId(courseId),
        backendToken: requireBackendToken(backendToken),
        signal: options.signal,
      },
      courseTopicsResponseSchema,
    );
  },

  exerciseDetail(
    exerciseId: number,
    backendToken: string,
    options: BackendRequestOptions = {},
  ): Promise<BackendResult<ExerciseDetailResponse>> {
    return requestAdminBackend(
      {
        operation: "exerciseDetail",
        exerciseId: requireResourceId(exerciseId),
        backendToken: requireBackendToken(backendToken),
        signal: options.signal,
      },
      exerciseDetailResponseSchema,
    );
  },

  createExercise(
    input: CreateExerciseRequest,
    backendToken: string,
    options: BackendRequestOptions = {},
  ): Promise<BackendResult<CreateExerciseResponse>> {
    return requestAdminBackend(
      {
        operation: "createExercise",
        body: input,
        backendToken: requireBackendToken(backendToken),
        signal: options.signal,
      },
      createExerciseResponseSchema,
    );
  },

  updateExercise(
    exerciseId: number,
    input: UpdateExerciseRequest,
    backendToken: string,
    options: BackendRequestOptions = {},
  ): Promise<BackendResult<UpdateExerciseResponse>> {
    return requestAdminBackend(
      {
        operation: "updateExercise",
        exerciseId: requireResourceId(exerciseId),
        body: input,
        backendToken: requireBackendToken(backendToken),
        signal: options.signal,
      },
      updateExerciseResponseSchema,
    );
  },
});
