import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { POST as login } from "@/app/api/session/login/route";
import { GET as me } from "@/app/api/session/me/route";
import type { AdminSession } from "@/lib/session/schema";
import { contentEditorFixture } from "@/test/fixtures/admin-roles";
import { mswServer } from "@/test/integration/msw-server";
import {
  BACKEND_LOGIN_URL,
  BACKEND_ME_URL,
  loginRequest,
  meRequest,
  openSeal,
  resealWith,
  sealFromResponse,
  setCookieHeader,
} from "@/test/integration/support";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

const meIdentity = {
  data: {
    id: "01a0ab9b-0000-4000-8000-00000000ed17",
    name: "İçerik Editörü (güncel)",
    email: "editor.new@bilgin.test",
    role: "content_editor",
    role_label: "İçerik Editörü",
  },
  meta: { server_time: "2026-09-16T19:10:20+00:00" },
};

async function issueSession(): Promise<{
  seal: string;
  session: AdminSession;
}> {
  mswServer.use(
    http.post(BACKEND_LOGIN_URL, () =>
      HttpResponse.json(contentEditorFixture.loginResponse),
    ),
  );

  const response = await login(
    loginRequest({ email: "editor@bilgin.test", password: "test-password" }),
  );
  const seal = sealFromResponse(response);

  mswServer.resetHandlers();

  return { seal, session: await openSeal(seal) };
}

/**
 * Moves the whole session window back so `validatedAt` falls outside the
 * five-minute freshness window while the 8h lifetime invariant still holds.
 */
async function staleSeal(): Promise<{ seal: string; session: AdminSession }> {
  const { session } = await issueSession();
  const issuedAt = session.issuedAt - FIVE_MINUTES_MS - 1000;
  const stale: AdminSession = {
    ...session,
    issuedAt,
    validatedAt: issuedAt,
    expiresAt: issuedAt + 28800 * 1000,
  };

  return { seal: await resealWith(session, stale), session: stale };
}

function backendMe(handler: Parameters<typeof http.get>[1]) {
  const seen = vi.fn();

  mswServer.use(
    http.get(BACKEND_ME_URL, (info) => {
      seen(info.request);

      return handler(info);
    }),
  );

  return seen;
}

describe("GET /api/session/me — fresh session", () => {
  it("answers from the local snapshot without touching the backend", async () => {
    const { seal } = await issueSession();
    const seen = backendMe(() => HttpResponse.json(meIdentity));

    const response = await me(meRequest(seal));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(seen).toHaveBeenCalledTimes(0);
    expect(setCookieHeader(response)).toBeUndefined();
    expect(body.data.admin.email).toBe("editor@bilgin.test");
    expect(JSON.stringify(body)).not.toContain(contentEditorFixture.token);
  });

  it("rejects a request with no session cookie", async () => {
    const response = await me(meRequest(null));

    expect(response.status).toBe(401);
    expect(setCookieHeader(response)).toBeUndefined();
  });

  it.each([
    ["a malformed cookie", "not-a-seal"],
    ["a tampered cookie", "Fe26.2**deadbeef*tampered*value*payload*mac"],
  ])("clears the cookie for %s", async (_label, seal) => {
    const response = await me(meRequest(seal));

    expect(response.status).toBe(401);
    expect(setCookieHeader(response)).toContain("Max-Age=0");
  });

  it("clears the cookie for an expired session payload", async () => {
    const { session } = await issueSession();
    const expired = await resealWith(session, {
      issuedAt: session.issuedAt - 28800 * 1000 - 2000,
      validatedAt: session.issuedAt - 28800 * 1000 - 2000,
      expiresAt: session.issuedAt - 1000,
    });

    const response = await me(meRequest(expired));

    expect(response.status).toBe(401);
    expect(setCookieHeader(response)).toContain("Max-Age=0");
  });

  it("clears the cookie for an unsupported session version", async () => {
    const { session } = await issueSession();
    const wrongVersion = await resealWith(session, { version: 2 });

    const response = await me(meRequest(wrongVersion));

    expect(response.status).toBe(401);
    expect(setCookieHeader(response)).toContain("Max-Age=0");
  });
});

describe("GET /api/session/me — stale session revalidation", () => {
  it("revalidates once with the session token and refreshes identity only", async () => {
    const { seal, session } = await staleSeal();
    let received: {
      auth: string | null;
      cookie: string | null;
      incomingAuth: string | null;
    } | null = null;

    mswServer.use(
      http.get(BACKEND_ME_URL, ({ request }) => {
        received = {
          auth: request.headers.get("authorization"),
          cookie: request.headers.get("cookie"),
          incomingAuth: request.headers.get("x-forwarded-authorization"),
        };

        return HttpResponse.json(meIdentity);
      }),
    );

    const response = await me(
      meRequest(seal, {
        authorization: "Bearer attacker-supplied-token",
        "x-forwarded-for": "10.0.0.1",
      }),
    );
    const body = await response.json();
    const refreshed = await openSeal(sealFromResponse(response));

    expect(response.status).toBe(200);
    expect(received).not.toBeNull();
    expect(received!.auth).toBe(`Bearer ${contentEditorFixture.token}`);
    expect(received!.cookie).toBeNull();
    expect(received!.incomingAuth).toBeNull();

    // Identity refreshes, the ability snapshot and the session id do not.
    expect(body.data.admin.id).toBe(session.admin.id);
    expect(body.data.admin.role).toBe("content_editor");
    expect(body.data.admin.name).toBe("İçerik Editörü (güncel)");
    expect(body.data.admin.email).toBe("editor.new@bilgin.test");
    expect(body.data.admin.abilities).toEqual(session.admin.abilities);

    expect(refreshed.validatedAt).toBeGreaterThan(session.validatedAt);
    expect(refreshed.issuedAt).toBe(session.issuedAt);
    expect(refreshed.expiresAt).toBe(session.expiresAt);
    expect(refreshed.backendToken).toBe(contentEditorFixture.token);
  });

  it("does not slide the absolute expiry when refreshing the cookie", async () => {
    const { seal, session } = await staleSeal();
    backendMe(() => HttpResponse.json(meIdentity));

    const response = await me(meRequest(seal));
    const cookie = setCookieHeader(response);
    const refreshed = await openSeal(sealFromResponse(response));
    const remainingSeconds = Math.floor(
      (session.expiresAt - Date.now()) / 1000,
    );

    expect(refreshed.expiresAt).toBe(session.expiresAt);
    const maxAge = Number(/Max-Age=(\d+)/.exec(cookie ?? "")?.[1]);
    expect(maxAge).toBeLessThanOrEqual(remainingSeconds + 1);
    expect(maxAge).toBeGreaterThan(0);
  });
});

describe("GET /api/session/me — security states", () => {
  it("clears the session when the backend rejects the token with 401", async () => {
    const { seal } = await staleSeal();
    backendMe(() =>
      HttpResponse.json({ message: "Unauthenticated." }, { status: 401 }),
    );

    const response = await me(meRequest(seal));

    expect(response.status).toBe(401);
    expect(setCookieHeader(response)).toContain("Max-Age=0");
  });

  it("preserves the session when the backend answers 403", async () => {
    const { seal } = await staleSeal();
    backendMe(() =>
      HttpResponse.json(
        { error: { code: "FORBIDDEN", message: "Bu işlem için yetkin yok." } },
        { status: 403 },
      ),
    );

    const response = await me(meRequest(seal));

    expect(response.status).toBe(403);
    expect(setCookieHeader(response)).toBeUndefined();
  });

  it("clears the session when the backend identity id does not match", async () => {
    const { seal } = await staleSeal();
    backendMe(() =>
      HttpResponse.json({
        ...meIdentity,
        data: {
          ...meIdentity.data,
          id: "01a0ab9b-0000-4000-8000-000000000bad",
        },
      }),
    );

    const response = await me(meRequest(seal));

    expect(response.status).toBe(401);
    expect(setCookieHeader(response)).toContain("Max-Age=0");
  });

  it("clears the session when the backend role changed, without re-deriving abilities", async () => {
    const { seal } = await staleSeal();
    backendMe(() =>
      HttpResponse.json({
        ...meIdentity,
        data: {
          ...meIdentity.data,
          role: "super_admin",
          role_label: "Süper Yönetici",
        },
      }),
    );

    const response = await me(meRequest(seal));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(setCookieHeader(response)).toContain("Max-Age=0");
    expect(JSON.stringify(body)).not.toContain("edit_curriculum");
  });

  it.each([
    [
      "a 500 HTML stack page",
      () =>
        new HttpResponse("<html>SQLSTATE[HY000] /var/www/app.php:42</html>", {
          status: 500,
          headers: { "content-type": "text/html" },
        }),
    ],
    ["an unreachable backend", () => HttpResponse.error()],
    [
      "a 2xx body that breaks the contract",
      () => HttpResponse.json({ data: { id: "" } }),
    ],
    [
      "invalid JSON",
      () =>
        new HttpResponse("{oops", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ],
  ])("keeps the session and answers a safe 502 for %s", async (_l, respond) => {
    const { seal } = await staleSeal();
    backendMe(() => respond());

    const response = await me(meRequest(seal));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(setCookieHeader(response)).toBeUndefined();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("SQLSTATE");
    expect(serialized).not.toContain("/var/www");
    expect(serialized).not.toContain(contentEditorFixture.token);
  });
});
