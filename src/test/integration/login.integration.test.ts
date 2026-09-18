import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { adminLoginResponseSchema } from "@/contracts/admin/auth";
import { POST as login } from "@/app/api/session/login/route";
import {
  adminRoleFixtures,
  contentEditorFixture,
  type AdminRoleFixture,
} from "@/test/fixtures/admin-roles";
import { mswServer } from "@/test/integration/msw-server";
import {
  BACKEND_LOGIN_URL,
  loginRequest,
  openSeal,
  sealFromResponse,
  setCookieHeader,
} from "@/test/integration/support";

const credentials = { email: "editor@bilgin.test", password: "test-password" };

function backendLogin(handler: Parameters<typeof http.post>[1]) {
  const seen = vi.fn();

  mswServer.use(
    http.post(BACKEND_LOGIN_URL, async (info) => {
      seen(info.request);

      return handler(info);
    }),
  );

  return seen;
}

describe("login contract fixtures", () => {
  it.each(adminRoleFixtures)(
    "$role fixture matches the backend login contract",
    (fixture: AdminRoleFixture) => {
      expect(
        adminLoginResponseSchema.safeParse(fixture.loginResponse).success,
      ).toBe(true);
    },
  );
});

describe("POST /api/session/login — success", () => {
  it.each(adminRoleFixtures)(
    "issues an encrypted session for the $role snapshot",
    async (fixture: AdminRoleFixture) => {
      const seen = backendLogin(() => HttpResponse.json(fixture.loginResponse));

      const response = await login(loginRequest(credentials));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(seen).toHaveBeenCalledTimes(1);
      expect(response.headers.get("cache-control")).toBe("no-store");

      const snapshot = fixture.loginResponse.data.admin;

      expect(body.data.admin.role).toBe(fixture.role);
      expect(body.data.admin.roleLabel).toBe(fixture.roleLabel);
      expect(body.data.admin.abilities).toEqual(snapshot.abilities);

      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain(fixture.token);
      expect(serialized).not.toContain(credentials.password);
      expect(serialized).not.toContain("backendToken");

      const cookie = setCookieHeader(response);
      expect(cookie).toBeDefined();
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=lax");
      expect(cookie).toContain("Path=/");
      expect(cookie).not.toContain(fixture.token);
    },
  );

  it("stores the backend token and timestamps only inside the seal", async () => {
    backendLogin(() => HttpResponse.json(contentEditorFixture.loginResponse));

    const before = Date.now();
    const response = await login(loginRequest(credentials));
    const session = await openSeal(sealFromResponse(response));
    const after = Date.now();

    expect(session.version).toBe(1);
    expect(session.backendToken).toBe(contentEditorFixture.token);
    expect(session.admin.role).toBe("content_editor");
    expect(session.admin.abilities).toEqual({
      edit_content: true,
      publish_content: false,
      edit_curriculum: false,
      view_users: false,
    });
    expect(session.issuedAt).toBeGreaterThanOrEqual(before);
    expect(session.issuedAt).toBeLessThanOrEqual(after);
    expect(session.validatedAt).toBe(session.issuedAt);
    expect(session.expiresAt).toBe(session.issuedAt + 28800 * 1000);
  });

  it("sends the credentials to the real backend login endpoint", async () => {
    let received: { url: string; body: unknown; auth: string | null } | null =
      null;

    mswServer.use(
      http.post(BACKEND_LOGIN_URL, async ({ request }) => {
        received = {
          url: request.url,
          body: await request.json(),
          auth: request.headers.get("authorization"),
        };

        return HttpResponse.json(contentEditorFixture.loginResponse);
      }),
    );

    await login(loginRequest(credentials));

    expect(received).not.toBeNull();
    expect(received!.url).toBe(BACKEND_LOGIN_URL);
    expect(received!.body).toEqual(credentials);
    expect(received!.auth).toBeNull();
  });
});

describe("POST /api/session/login — failure", () => {
  it("keeps the generic Laravel credential error and writes no cookie", async () => {
    backendLogin(() =>
      HttpResponse.json(
        {
          message: "The given data was invalid.",
          errors: { email: ["E-posta veya şifre hatalı."] },
        },
        { status: 422 },
      ),
    );

    const response = await login(loginRequest(credentials));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.kind).toBe("validation");
    expect(body.error.fields.email).toEqual(["E-posta veya şifre hatalı."]);
    expect(setCookieHeader(response)).toBeUndefined();
  });

  it("returns the same shape for an unknown email as for a wrong password", async () => {
    const laravelError = {
      message: "The given data was invalid.",
      errors: { email: ["E-posta veya şifre hatalı."] },
    };

    backendLogin(() => HttpResponse.json(laravelError, { status: 422 }));
    const unknownEmail = await (
      await login(loginRequest({ ...credentials, email: "nobody@bilgin.test" }))
    ).json();

    backendLogin(() => HttpResponse.json(laravelError, { status: 422 }));
    const wrongPassword = await (
      await login(loginRequest({ ...credentials, password: "wrong-password" }))
    ).json();

    expect(unknownEmail).toEqual(wrongPassword);
  });

  it("preserves the rate limit and its Retry-After without a cookie", async () => {
    backendLogin(() =>
      HttpResponse.json(
        { message: "Too Many Attempts." },
        { status: 429, headers: { "Retry-After": "42" } },
      ),
    );

    const response = await login(loginRequest(credentials));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error.kind).toBe("rate_limit");
    expect(body.error.retryAfterSeconds).toBe(42);
    expect(setCookieHeader(response)).toBeUndefined();
  });

  it.each([
    [
      "invalid JSON with a JSON content type",
      () =>
        new HttpResponse("{not json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ],
    [
      "a 2xx body that does not match the contract",
      () => HttpResponse.json({ data: { token: "" } }),
    ],
    [
      "a 500 HTML stack trace page",
      () =>
        new HttpResponse(
          "<html><body>SQLSTATE[HY000] /var/www/app.php:42</body></html>",
          { status: 500, headers: { "content-type": "text/html" } },
        ),
    ],
  ])("returns a safe 502 for %s", async (_label, respond) => {
    backendLogin(() => respond());

    const response = await login(loginRequest(credentials));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(["protocol", "contract", "server"]).toContain(body.error.kind);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("SQLSTATE");
    expect(serialized).not.toContain("/var/www");
    expect(serialized).not.toContain("not json");
    expect(setCookieHeader(response)).toBeUndefined();
  });

  it("returns a safe 502 when the backend is unreachable", async () => {
    backendLogin(() => HttpResponse.error());

    const response = await login(loginRequest(credentials));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error.kind).toBe("network");
    expect(setCookieHeader(response)).toBeUndefined();
  });
});

describe("POST /api/session/login — Origin gate", () => {
  it.each([
    ["a missing Origin", {}],
    ["a foreign Origin", { origin: "https://evil.test" }],
    ["the backend Origin", { origin: "https://backend.test" }],
  ])("rejects %s before any backend call", async (_label, headers) => {
    const seen = backendLogin(() =>
      HttpResponse.json(contentEditorFixture.loginResponse),
    );

    const response = await login(
      loginRequest(credentials, {
        "content-type": "application/json",
        ...headers,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("ORIGIN_REJECTED");
    expect(seen).toHaveBeenCalledTimes(0);
    expect(setCookieHeader(response)).toBeUndefined();
  });

  it("accepts the exact app Origin", async () => {
    const seen = backendLogin(() =>
      HttpResponse.json(contentEditorFixture.loginResponse),
    );

    const response = await login(loginRequest(credentials));

    expect(response.status).toBe(200);
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
