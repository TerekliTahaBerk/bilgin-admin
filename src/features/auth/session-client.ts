import { z } from "zod";

import { safeAdminSchema, type SafeAdmin } from "@/contracts/admin/session";
import { apiErrorKinds, type ApiError } from "@/lib/api/error";

const sessionSuccessResponseSchema = z.object({
  data: z.object({
    admin: safeAdminSchema,
  }),
});

const sessionErrorResponseSchema = z.object({
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

export type SessionClientResult =
  { ok: true; admin: SafeAdmin } | { ok: false; error: ApiError };

export type SessionLogoutResult = { ok: true } | { ok: false; error: ApiError };

export type SessionClientOptions = Readonly<{
  signal?: AbortSignal;
}>;

const networkError: ApiError = {
  kind: "network",
  status: null,
  message: "Oturum servisine ulaşılamadı. Lütfen tekrar deneyin.",
};

function protocolError(status: number | null): ApiError {
  return {
    kind: "protocol",
    status,
    message: "Oturum servisinden geçersiz bir yanıt alındı.",
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

async function requestSession(
  path: "/api/session/login" | "/api/session/me",
  init: RequestInit,
): Promise<SessionClientResult> {
  try {
    const response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
    });
    const body = await readJson(response);

    if (response.ok) {
      const parsed = sessionSuccessResponseSchema.safeParse(body);

      return parsed.success
        ? { ok: true, admin: parsed.data.data.admin }
        : { ok: false, error: protocolError(response.status) };
    }

    const parsed = sessionErrorResponseSchema.safeParse(body);

    return parsed.success
      ? { ok: false, error: parsed.data.error }
      : { ok: false, error: protocolError(response.status) };
  } catch {
    return { ok: false, error: networkError };
  }
}

export function loginSession(
  input: { email: string; password: string },
  options: SessionClientOptions = {},
): Promise<SessionClientResult> {
  return requestSession("/api/session/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: options.signal,
  });
}

export function getSession(
  options: SessionClientOptions = {},
): Promise<SessionClientResult> {
  return requestSession("/api/session/me", {
    method: "GET",
    signal: options.signal,
  });
}

export async function logoutSession(
  options: SessionClientOptions = {},
): Promise<SessionLogoutResult> {
  try {
    const response = await fetch("/api/session/logout", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal: options.signal,
    });

    if (response.ok) {
      return { ok: true };
    }

    const parsed = sessionErrorResponseSchema.safeParse(
      await readJson(response),
    );

    return parsed.success
      ? { ok: false, error: parsed.data.error }
      : { ok: false, error: protocolError(response.status) };
  } catch {
    return { ok: false, error: networkError };
  }
}
