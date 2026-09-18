import type { NextRequest, NextResponse } from "next/server";

import {
  exerciseTypeSchema,
  publishStatusSchema,
} from "@/contracts/admin/content";
import type { ExerciseServerFilters } from "@/features/content/exercise-filters";
import { parseResourceId } from "@/lib/api/resource-id";
import { adminContent } from "@/lib/backend/admin-content";
import { clearSessionCookie, readSessionSeal } from "@/lib/session/cookie";
import {
  createInvalidSessionResponse,
  createResourceSuccessResponse,
  createSessionErrorResponse,
} from "@/lib/session/http";
import { unsealAdminSession } from "@/lib/session/read";

/** Exactly the parameters the backend applies. Anything else is a bad request. */
const ALLOWED_QUERY_KEYS = new Set(["type", "status"]);

function invalidRequest(message: string): NextResponse {
  return createSessionErrorResponse(
    { kind: "protocol", status: 400, message },
    400,
  );
}

function invalidSessionWithClearedCookie(): NextResponse {
  const response = createInvalidSessionResponse();

  clearSessionCookie(response);

  return response;
}

/**
 * Reads the filters off the incoming URL under a strict allowlist. An unknown
 * key, a repeated key or a value outside the enum is rejected rather than
 * dropped, so a mistyped filter can never silently widen the result set — and
 * the browser's raw search string never reaches the backend.
 */
function readFilters(url: URL): ExerciseServerFilters | { error: string } {
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_QUERY_KEYS.has(key)) {
      return { error: "Geçersiz filtre." };
    }

    if (url.searchParams.getAll(key).length > 1) {
      return { error: "Filtre birden fazla kez gönderilemez." };
    }
  }

  const filters: { type?: string; status?: string } = {};
  const type = url.searchParams.get("type");
  const status = url.searchParams.get("status");

  if (type !== null) {
    const parsed = exerciseTypeSchema.safeParse(type);

    if (!parsed.success) {
      return { error: "Geçersiz soru tipi." };
    }

    filters.type = parsed.data;
  }

  if (status !== null) {
    const parsed = publishStatusSchema.safeParse(status);

    if (!parsed.success) {
      return { error: "Geçersiz durum." };
    }

    filters.status = parsed.data;
  }

  return filters as ExerciseServerFilters;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ unitId: string }> },
) {
  const unitId = parseResourceId((await params).unitId);

  if (unitId === null) {
    return invalidRequest("Geçersiz ünite kimliği.");
  }

  const filters = readFilters(new URL(request.url));

  if ("error" in filters) {
    return invalidRequest(filters.error);
  }

  const seal = readSessionSeal(request);

  if (seal === null) {
    return createInvalidSessionResponse();
  }

  const session = await unsealAdminSession(seal);

  if (session === null) {
    return invalidSessionWithClearedCookie();
  }

  const result = await adminContent.exercises(
    unitId,
    filters,
    session.backendToken,
  );

  if (!result.ok) {
    if (result.error.kind === "authentication") {
      return invalidSessionWithClearedCookie();
    }

    return createSessionErrorResponse(result.error);
  }

  return createResourceSuccessResponse(result.data.data);
}
