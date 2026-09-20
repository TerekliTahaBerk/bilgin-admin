import { z } from "zod";

import {
  adminAccountsResponseSchema,
  archiveExerciseResponseSchema,
  contentPackageSchema,
  createAdminResponseSchema,
  createUnitResponseSchema,
  curriculumMappingResponseSchema,
  curriculumOptionsResponseSchema,
  importContentResponseSchema,
  unitTemplatesResponseSchema,
  updateAdminResponseSchema,
  updateCurriculumResponseSchema,
  type AdminAccountsData,
  type ContentPackage,
  type CreateAdminRequest,
  type CreatedUnit,
  type CreateUnitRequest,
  type CurriculumOptions,
  type CurriculumRow,
  type UnitTemplate,
  type UpdateAdminRequest,
  type UpdateCurriculumRequest,
} from "@/contracts/admin/workflows";
import type { ApiError } from "@/lib/api/error";
import { requireResourceId } from "@/lib/api/resource-id";

const errorSchema = z.object({ error: z.custom<ApiError>() });
async function request<T>(
  path: string,
  schema: z.ZodType<{ data: T }>,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      ...init,
    });
  } catch {
    throw {
      kind: "network",
      status: null,
      message: "Sunucuya ulaşılamadı.",
    } satisfies ApiError;
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorSchema.safeParse(body);
    throw parsed.success
      ? parsed.data.error
      : ({
          kind: "contract",
          status: response.status,
          message: "Sunucu yanıtı beklenen formatta değil.",
        } satisfies ApiError);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw {
      kind: "contract",
      status: response.status,
      message: "Sunucu yanıtı beklenen formatta değil.",
    } satisfies ApiError;
  return parsed.data.data;
}
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const getUnitTemplates = (): Promise<UnitTemplate[]> =>
  request(
    "/api/admin/unit-templates",
    unitTemplatesResponseSchema.pick({ data: true }),
  );
export const createUnit = (input: CreateUnitRequest): Promise<CreatedUnit> =>
  request(
    "/api/admin/units",
    createUnitResponseSchema.pick({ data: true }),
    json("POST", input),
  );
export const archiveExercise = (exerciseId: number) =>
  request(
    `/api/admin/exercises/${requireResourceId(exerciseId)}`,
    archiveExerciseResponseSchema.pick({ data: true }),
    { method: "DELETE" },
  );
export const importContent = (input: ContentPackage) =>
  request(
    "/api/admin/content/import",
    importContentResponseSchema.pick({ data: true }),
    json("POST", input),
  );
export const getCurriculumOptions = (): Promise<CurriculumOptions> =>
  request(
    "/api/admin/curriculum/options",
    curriculumOptionsResponseSchema.pick({ data: true }),
  );
export const getCurriculumMapping = (
  variantId: number,
): Promise<{
  exam_variant: { code: string; name: string };
  courses: CurriculumRow[];
}> =>
  request(
    `/api/admin/exam-variants/${requireResourceId(variantId)}/courses`,
    curriculumMappingResponseSchema.pick({ data: true }),
  );
export const updateCurriculum = (
  variantId: number,
  input: UpdateCurriculumRequest,
) =>
  request(
    `/api/admin/exam-variants/${requireResourceId(variantId)}/courses`,
    updateCurriculumResponseSchema.pick({ data: true }),
    json("PUT", input),
  );
export const getAdminAccounts = (): Promise<AdminAccountsData> =>
  request(
    "/api/admin/admins",
    adminAccountsResponseSchema.pick({ data: true }),
  );
export const createAdminAccount = (input: CreateAdminRequest) =>
  request(
    "/api/admin/admins",
    createAdminResponseSchema.pick({ data: true }),
    json("POST", input),
  );
export const updateAdminAccount = (
  adminId: string,
  input: UpdateAdminRequest,
) =>
  request(
    `/api/admin/admins/${encodeURIComponent(adminId)}`,
    updateAdminResponseSchema.pick({ data: true }),
    json("PATCH", input),
  );

export function parseContentPackage(raw: string) {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return { success: false as const, message: "Geçerli bir JSON girin." };
  }
  const parsed = contentPackageSchema.safeParse(value);
  return parsed.success
    ? { success: true as const, data: parsed.data }
    : {
        success: false as const,
        message:
          "Paket course, subject, unit, topics ve exercises alanlarını içermeli.",
      };
}
