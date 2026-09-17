import { sealData } from "iron-session";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SafeAdmin } from "@/contracts/admin/session";
import { GET as getSessionRoute } from "@/app/api/session/me/route";
import { POST as loginRoute } from "@/app/api/session/login/route";
import { POST as logoutRoute } from "@/app/api/session/logout/route";
import {
  getSessionCryptoOptions,
  sessionCookiePolicy,
  sessionMaxAgeSeconds,
} from "@/lib/session/config";
import { unsealAdminSession } from "@/lib/session/read";
import {
  createAdminSessionPayload,
  sealAdminSession,
} from "@/lib/session/write";
import {
  validAdminMeResponse,
  validEditorLoginResponse,
} from "@/test/fixtures/admin-api";

const backendMocks = vi.hoisted(() => ({
  login: vi.fn(),
  me: vi.fn(),
}));

vi.mock("@/lib/backend/admin-auth", () => ({
  adminBackend: backendMocks,
}));

const NOW = 1_800_000_000_000;
const LOGIN_INPUT = {
  email: "editor@example.test",
  password: "test-password-must-not-leak",
};

const safeAdmin: SafeAdmin = {
  id: validEditorLoginResponse.data.admin.id,
  name: validEditorLoginResponse.data.admin.name,
  email: validEditorLoginResponse.data.admin.email,
  role: validEditorLoginResponse.data.admin.role,
  roleLabel: validEditorLoginResponse.data.admin.role_label,
  abilities: validEditorLoginResponse.data.admin.abilities,
};

function loginRequest(
  origin: string | null = "http://localhost:3000",
  body: BodyInit = JSON.stringify(LOGIN_INPUT),
): Request {
  const headers = new Headers({ "Content-Type": "application/json" });

  if (origin !== null) {
    headers.set("Origin", origin);
  }

  return new Request("http://localhost:3000/api/session/login", {
    method: "POST",
    headers,
    body,
  });
}

function logoutRequest(origin: string | null = "http://localhost:3000") {
  const headers = new Headers();

  if (origin !== null) {
    headers.set("Origin", origin);
  }

  return new Request("http://localhost:3000/api/session/logout", {
    method: "POST",
    headers,
  });
}

function sessionRequest(seal?: string): NextRequest {
  const headers = new Headers();

  if (seal !== undefined) {
    headers.set("Cookie", `${sessionCookiePolicy.name}=${seal}`);
  }

  return new NextRequest("http://localhost:3000/api/session/me", {
    headers,
  });
}

function expectNoStore(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe("no-store");
}

function expectClearedSessionCookie(response: Response) {
  const setCookie = response.headers.get("Set-Cookie");

  expect(setCookie).toContain(`${sessionCookiePolicy.name}=`);
  expect(setCookie).toMatch(/Max-Age=0/i);
  expect(setCookie).toMatch(/Path=\//i);
  expect(setCookie).toMatch(/HttpOnly/i);
  expect(setCookie).toMatch(/SameSite=lax/i);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  backendMocks.login.mockReset();
  backendMocks.me.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/session/login", () => {
  it("creates an encrypted HttpOnly session and returns only SafeAdmin", async () => {
    backendMocks.login.mockResolvedValue({
      ok: true,
      data: validEditorLoginResponse,
    });

    const response = await loginRoute(loginRequest());
    const body = await response.json();
    const cookie = response.cookies.get(sessionCookiePolicy.name);

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(backendMocks.login).toHaveBeenCalledTimes(1);
    expect(backendMocks.login).toHaveBeenCalledWith(LOGIN_INPUT);
    expect(body).toEqual({ data: { admin: safeAdmin } });
    expect(JSON.stringify(body)).not.toContain(
      validEditorLoginResponse.data.token,
    );
    expect(JSON.stringify(body)).not.toContain(LOGIN_INPUT.password);
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(false);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.path).toBe("/");
    expect(cookie?.maxAge).toBe(sessionMaxAgeSeconds);
    expect(cookie).not.toHaveProperty("domain");

    const session = await unsealAdminSession(cookie?.value ?? "", NOW);
    expect(session).toMatchObject({
      backendToken: validEditorLoginResponse.data.token,
      admin: safeAdmin,
      issuedAt: NOW,
      validatedAt: NOW,
      expiresAt: NOW + sessionMaxAgeSeconds * 1000,
    });
  });

  it("overwrites an existing session only after successful login", async () => {
    backendMocks.login.mockResolvedValue({
      ok: true,
      data: validEditorLoginResponse,
    });
    const request = loginRequest();
    request.headers.set("Cookie", `${sessionCookiePolicy.name}=old-session`);

    const response = await loginRoute(request);

    expect(response.cookies.get(sessionCookiePolicy.name)?.value).not.toBe(
      "old-session",
    );
  });

  it.each([null, "https://evil.example.test"])(
    "rejects invalid Origin %s before backend access",
    async (origin) => {
      const response = await loginRoute(loginRequest(origin));

      expect(response.status).toBe(403);
      expectNoStore(response);
      expect(backendMocks.login).not.toHaveBeenCalled();
      expect(response.headers.get("Set-Cookie")).toBeNull();
    },
  );

  it("rejects malformed JSON before backend access", async () => {
    const response = await loginRoute(loginRequest(undefined, "{broken"));

    expect(response.status).toBe(400);
    expectNoStore(response);
    expect(backendMocks.login).not.toHaveBeenCalled();
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("preserves safe backend validation fields without setting a cookie", async () => {
    backendMocks.login.mockResolvedValue({
      ok: false,
      error: {
        kind: "validation",
        status: 422,
        message: "The given data was invalid.",
        fields: { email: ["E-posta veya şifre hatalı."] },
      },
    });

    const response = await loginRoute(loginRequest());

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { fields: { email: ["E-posta veya şifre hatalı."] } },
    });
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("preserves rate limiting without setting a cookie", async () => {
    backendMocks.login.mockResolvedValue({
      ok: false,
      error: {
        kind: "rate_limit",
        status: 429,
        message: "Çok fazla istek gönderildi.",
        retryAfterSeconds: 30,
      },
    });

    const response = await loginRoute(loginRequest());

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: { kind: "rate_limit", retryAfterSeconds: 30 },
    });
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("maps upstream failures to a safe 502 without setting a cookie", async () => {
    backendMocks.login.mockResolvedValue({
      ok: false,
      error: {
        kind: "server",
        status: 500,
        message: "Sunucu hatası oluştu. Lütfen daha sonra tekrar deneyin.",
      },
    });

    const response = await loginRoute(loginRequest());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(JSON.stringify(body)).not.toContain("SQLSTATE");
    expect(JSON.stringify(body)).not.toContain(LOGIN_INPUT.password);
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });
});

describe("POST /api/session/logout", () => {
  it("clears the local cookie idempotently and never calls the backend", async () => {
    const response = await logoutRoute(logoutRequest());

    expect(response.status).toBe(204);
    expectNoStore(response);
    expectClearedSessionCookie(response);
    expect(backendMocks.login).not.toHaveBeenCalled();
    expect(backendMocks.me).not.toHaveBeenCalled();
  });

  it.each([null, "https://evil.example.test"])(
    "rejects invalid Origin %s without clearing the cookie",
    async (origin) => {
      const response = await logoutRoute(logoutRequest(origin));

      expect(response.status).toBe(403);
      expect(response.headers.get("Set-Cookie")).toBeNull();
      expectNoStore(response);
    },
  );
});

describe("GET /api/session/me", () => {
  it("returns a fresh snapshot without backend validation or cookie refresh", async () => {
    const session = createAdminSessionPayload(
      { backendToken: "test-admin-token", admin: safeAdmin },
      NOW,
    );
    const seal = await sealAdminSession(session);

    const response = await getSessionRoute(sessionRequest(seal));

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(await response.json()).toEqual({ data: { admin: safeAdmin } });
    expect(backendMocks.me).not.toHaveBeenCalled();
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("refreshes stale identity while preserving abilities and absolute expiry", async () => {
    const loginAt = NOW - 6 * 60 * 1000;
    const session = createAdminSessionPayload(
      { backendToken: "test-admin-token", admin: safeAdmin },
      loginAt,
    );
    const seal = await sealAdminSession(session);
    const updatedMe = {
      ...validAdminMeResponse,
      data: {
        ...validAdminMeResponse.data,
        name: "Güncel İsim",
        email: "updated@example.test",
        role_label: "Güncel Rol Etiketi",
      },
    };
    backendMocks.me.mockResolvedValue({ ok: true, data: updatedMe });

    const response = await getSessionRoute(sessionRequest(seal));
    const responseBody = await response.json();
    const cookie = response.cookies.get(sessionCookiePolicy.name);
    const refreshed = await unsealAdminSession(cookie?.value ?? "", NOW);

    expect(response.status).toBe(200);
    expect(backendMocks.me).toHaveBeenCalledTimes(1);
    expect(backendMocks.me).toHaveBeenCalledWith(session.backendToken);
    expect(responseBody.data.admin).toEqual({
      ...safeAdmin,
      name: updatedMe.data.name,
      email: updatedMe.data.email,
      roleLabel: updatedMe.data.role_label,
    });
    expect(responseBody.data.admin.abilities).toEqual(safeAdmin.abilities);
    expect(JSON.stringify(responseBody)).not.toContain(session.backendToken);
    expect(refreshed?.issuedAt).toBe(session.issuedAt);
    expect(refreshed?.expiresAt).toBe(session.expiresAt);
    expect(refreshed?.validatedAt).toBe(NOW);
    expect(refreshed?.backendToken).toBe(session.backendToken);
    expect(refreshed?.admin.abilities).toEqual(session.admin.abilities);
    expect(cookie?.maxAge).toBe(Math.floor((session.expiresAt - NOW) / 1000));
    expect(cookie?.maxAge).toBeLessThan(sessionMaxAgeSeconds);
    expect(new Date(cookie?.expires ?? 0).getTime()).toBe(session.expiresAt);
  });

  it.each([
    ["id", { ...validAdminMeResponse.data, id: "different-admin" }],
    ["role", { ...validAdminMeResponse.data, role: "different-role" }],
  ])("clears an identity %s mismatch", async (_field, identity) => {
    const session = createAdminSessionPayload(
      { backendToken: "test-admin-token", admin: safeAdmin },
      NOW - 6 * 60 * 1000,
    );
    backendMocks.me.mockResolvedValue({
      ok: true,
      data: { ...validAdminMeResponse, data: identity },
    });

    const response = await getSessionRoute(
      sessionRequest(await sealAdminSession(session)),
    );

    expect(response.status).toBe(401);
    expectClearedSessionCookie(response);
  });

  it("clears the cookie for a backend 401", async () => {
    const session = createAdminSessionPayload(
      { backendToken: "test-admin-token", admin: safeAdmin },
      NOW - 6 * 60 * 1000,
    );
    backendMocks.me.mockResolvedValue({
      ok: false,
      error: {
        kind: "authentication",
        status: 401,
        message: "Oturum doğrulanamadı.",
      },
    });

    const response = await getSessionRoute(
      sessionRequest(await sealAdminSession(session)),
    );

    expect(response.status).toBe(401);
    expectClearedSessionCookie(response);
  });

  it("preserves the cookie for backend 403", async () => {
    const session = createAdminSessionPayload(
      { backendToken: "test-admin-token", admin: safeAdmin },
      NOW - 6 * 60 * 1000,
    );
    backendMocks.me.mockResolvedValue({
      ok: false,
      error: {
        kind: "authorization",
        status: 403,
        message: "Bu işlem için yetkiniz yok.",
      },
    });

    const response = await getSessionRoute(
      sessionRequest(await sealAdminSession(session)),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it.each(["network", "server", "protocol", "contract"] as const)(
    "preserves the cookie for a %s error",
    async (kind) => {
      const session = createAdminSessionPayload(
        { backendToken: "test-admin-token", admin: safeAdmin },
        NOW - 6 * 60 * 1000,
      );
      backendMocks.me.mockResolvedValue({
        ok: false,
        error: {
          kind,
          status: kind === "network" ? null : 500,
          message: "Güvenli upstream hatası.",
        },
      });

      const response = await getSessionRoute(
        sessionRequest(await sealAdminSession(session)),
      );

      expect(response.status).toBe(502);
      expect(response.headers.get("Set-Cookie")).toBeNull();
    },
  );

  it("returns 401 without a Set-Cookie when no session exists", async () => {
    const response = await getSessionRoute(sessionRequest());

    expect(response.status).toBe(401);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(backendMocks.me).not.toHaveBeenCalled();
  });

  it("clears malformed, tampered, expired and unsupported sessions", async () => {
    const validSession = createAdminSessionPayload(
      { backendToken: "test-admin-token", admin: safeAdmin },
      NOW,
    );
    const validSeal = await sealAdminSession(validSession);
    const replacement = validSeal[10] === "a" ? "b" : "a";
    const tampered = `${validSeal.slice(0, 10)}${replacement}${validSeal.slice(11)}`;
    const expired = await sealAdminSession(
      createAdminSessionPayload(
        { backendToken: "test-admin-token", admin: safeAdmin },
        NOW - sessionMaxAgeSeconds * 1000,
      ),
    );
    const unsupported = await sealData(
      { ...validSession, version: 2 },
      getSessionCryptoOptions(),
    );

    for (const invalidSeal of ["not-a-seal", tampered, expired, unsupported]) {
      const response = await getSessionRoute(sessionRequest(invalidSeal));

      expect(response.status).toBe(401);
      expectClearedSessionCookie(response);
    }

    expect(backendMocks.me).not.toHaveBeenCalled();
  });
});
