import "server-only";

import type { NextRequest, NextResponse } from "next/server";

import type { AdminSession } from "@/lib/session/schema";
import { can } from "@/lib/authz/abilities";
import { clearSessionCookie, readSessionSeal } from "@/lib/session/cookie";
import {
  createInvalidSessionResponse,
  createSessionErrorResponse,
} from "@/lib/session/http";
import { unsealAdminSession } from "@/lib/session/read";

type SessionResult =
  { ok: true; session: AdminSession } | { ok: false; response: NextResponse };

function clearedInvalidSessionResponse(): NextResponse {
  const response = createInvalidSessionResponse();
  clearSessionCookie(response);
  return response;
}

export async function readBffSession(
  request: NextRequest,
): Promise<SessionResult> {
  const seal = readSessionSeal(request);

  if (seal === null) {
    return { ok: false, response: createInvalidSessionResponse() };
  }

  const session = await unsealAdminSession(seal);

  return session === null
    ? { ok: false, response: clearedInvalidSessionResponse() }
    : { ok: true, session };
}

export async function readEditorBffSession(
  request: NextRequest,
): Promise<SessionResult> {
  const result = await readBffSession(request);

  if (!result.ok) return result;

  if (!can(result.session.admin, "edit_content")) {
    return {
      ok: false,
      response: createSessionErrorResponse({
        kind: "authorization",
        status: 403,
        code: "FORBIDDEN",
        message: "Düzenleme yetkiniz yok.",
      }),
    };
  }

  return result;
}

/**
 * Publishing needs `publish_content`, never `edit_content`: the four-eyes rule
 * exists so the author of a question cannot be the one who ships it. This is a
 * UX guard only — the backend runs the same check and has the last word.
 */
export async function readPublisherBffSession(
  request: NextRequest,
): Promise<SessionResult> {
  const result = await readBffSession(request);

  if (!result.ok) return result;

  if (!can(result.session.admin, "publish_content")) {
    return {
      ok: false,
      response: createSessionErrorResponse({
        kind: "authorization",
        status: 403,
        code: "FORBIDDEN",
        message: "Yayınlama yetkiniz yok.",
      }),
    };
  }

  return result;
}

export async function readCurriculumBffSession(
  request: NextRequest,
): Promise<SessionResult> {
  const result = await readBffSession(request);
  if (!result.ok) return result;

  if (!can(result.session.admin, "edit_curriculum")) {
    return {
      ok: false,
      response: createSessionErrorResponse({
        kind: "authorization",
        status: 403,
        code: "FORBIDDEN",
        message: "Müfredat ve yönetici yönetimi yetkiniz yok.",
      }),
    };
  }

  return result;
}

export function clearSessionForBackendAuthentication(): NextResponse {
  return clearedInvalidSessionResponse();
}
