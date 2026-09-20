import "server-only";

import {
  adminAccountsResponseSchema,
  archiveExerciseResponseSchema,
  createAdminResponseSchema,
  createUnitResponseSchema,
  curriculumMappingResponseSchema,
  curriculumOptionsResponseSchema,
  importContentResponseSchema,
  unitTemplatesResponseSchema,
  updateAdminResponseSchema,
  updateCurriculumResponseSchema,
  type ContentPackage,
  type CreateAdminRequest,
  type CreateUnitRequest,
  type UpdateAdminRequest,
  type UpdateCurriculumRequest,
} from "@/contracts/admin/workflows";
import {
  requestAdminBackend,
  type BackendRequestOptions,
} from "@/lib/backend/client";
import { requireResourceId } from "@/lib/api/resource-id";

function token(value: string) {
  if (!value.trim()) throw new TypeError("A backend token is required.");
  return value;
}

export const adminWorkflows = Object.freeze({
  templates: (backendToken: string, options: BackendRequestOptions = {}) =>
    requestAdminBackend(
      {
        operation: "unitTemplates",
        backendToken: token(backendToken),
        signal: options.signal,
      },
      unitTemplatesResponseSchema,
    ),
  createUnit: (
    input: CreateUnitRequest,
    backendToken: string,
    options: BackendRequestOptions = {},
  ) =>
    requestAdminBackend(
      {
        operation: "createUnit",
        body: input,
        backendToken: token(backendToken),
        signal: options.signal,
      },
      createUnitResponseSchema,
    ),
  archiveExercise: (
    exerciseId: number,
    backendToken: string,
    options: BackendRequestOptions = {},
  ) =>
    requestAdminBackend(
      {
        operation: "archiveExercise",
        exerciseId: requireResourceId(exerciseId),
        backendToken: token(backendToken),
        signal: options.signal,
      },
      archiveExerciseResponseSchema,
    ),
  importContent: (
    input: ContentPackage,
    backendToken: string,
    options: BackendRequestOptions = {},
  ) =>
    requestAdminBackend(
      {
        operation: "importContent",
        body: input,
        backendToken: token(backendToken),
        signal: options.signal,
      },
      importContentResponseSchema,
    ),
  curriculumOptions: (
    backendToken: string,
    options: BackendRequestOptions = {},
  ) =>
    requestAdminBackend(
      {
        operation: "curriculumOptions",
        backendToken: token(backendToken),
        signal: options.signal,
      },
      curriculumOptionsResponseSchema,
    ),
  curriculumMapping: (
    variantId: number,
    backendToken: string,
    options: BackendRequestOptions = {},
  ) =>
    requestAdminBackend(
      {
        operation: "curriculumMapping",
        variantId: requireResourceId(variantId),
        backendToken: token(backendToken),
        signal: options.signal,
      },
      curriculumMappingResponseSchema,
    ),
  updateCurriculum: (
    variantId: number,
    input: UpdateCurriculumRequest,
    backendToken: string,
    options: BackendRequestOptions = {},
  ) =>
    requestAdminBackend(
      {
        operation: "updateCurriculum",
        variantId: requireResourceId(variantId),
        body: input,
        backendToken: token(backendToken),
        signal: options.signal,
      },
      updateCurriculumResponseSchema,
    ),
  admins: (backendToken: string, options: BackendRequestOptions = {}) =>
    requestAdminBackend(
      {
        operation: "admins",
        backendToken: token(backendToken),
        signal: options.signal,
      },
      adminAccountsResponseSchema,
    ),
  createAdmin: (
    input: CreateAdminRequest,
    backendToken: string,
    options: BackendRequestOptions = {},
  ) =>
    requestAdminBackend(
      {
        operation: "createAdmin",
        body: input,
        backendToken: token(backendToken),
        signal: options.signal,
      },
      createAdminResponseSchema,
    ),
  updateAdmin: (
    adminId: string,
    input: UpdateAdminRequest,
    backendToken: string,
    options: BackendRequestOptions = {},
  ) =>
    requestAdminBackend(
      {
        operation: "updateAdmin",
        adminId,
        body: input,
        backendToken: token(backendToken),
        signal: options.signal,
      },
      updateAdminResponseSchema,
    ),
});
