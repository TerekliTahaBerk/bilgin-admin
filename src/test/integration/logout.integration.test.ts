import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { POST as login } from "@/app/api/session/login/route";
import { POST as logout } from "@/app/api/session/logout/route";
import { contentEditorFixture } from "@/test/fixtures/admin-roles";
import { mswServer } from "@/test/integration/msw-server";
import {
  BACKEND_LOGIN_URL,
  BACKEND_ME_URL,
  loginRequest,
  logoutRequest,
  sealFromResponse,
  setCookieHeader,
} from "@/test/integration/support";

/**
 * Any backend request during logout is a bug: the frontend clears its own
 * cookie and the backend exposes no admin token revoke endpoint.
 */
function watchBackend() {
  const seen = vi.fn();

  mswServer.use(
    http.post(BACKEND_LOGIN_URL, () => {
      seen("login");

      return HttpResponse.json(contentEditorFixture.loginResponse);
    }),
    http.get(BACKEND_ME_URL, () => {
      seen("me");

      return HttpResponse.json({ data: {} });
    }),
  );

  return seen;
}

describe("POST /api/session/logout", () => {
  it("clears the frontend cookie without calling the backend", async () => {
    const seen = watchBackend();

    const response = await logout(logoutRequest());

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(setCookieHeader(response)).toContain("Max-Age=0");
    expect(seen).toHaveBeenCalledTimes(0);
  });

  it("invalidates a session that was issued moments earlier", async () => {
    mswServer.use(
      http.post(BACKEND_LOGIN_URL, () =>
        HttpResponse.json(contentEditorFixture.loginResponse),
      ),
    );

    const loginResponse = await login(
      loginRequest({ email: "editor@bilgin.test", password: "test-password" }),
    );
    expect(sealFromResponse(loginResponse).length).toBeGreaterThan(0);

    const response = await logout(logoutRequest());
    const cleared = setCookieHeader(response);

    expect(cleared).toContain("Max-Age=0");
    expect(cleared).toContain("HttpOnly");
  });

  it.each([
    ["a missing Origin", {}],
    ["a foreign Origin", { origin: "https://evil.test" }],
  ])("rejects %s and clears nothing", async (_label, headers) => {
    const seen = watchBackend();

    const response = await logout(logoutRequest(headers));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("ORIGIN_REJECTED");
    expect(setCookieHeader(response)).toBeUndefined();
    expect(seen).toHaveBeenCalledTimes(0);
  });
});

describe("integration network gate", () => {
  it("fails any request the suite did not explicitly declare", async () => {
    await expect(
      fetch("https://api.bilgin.example/real-backend"),
    ).rejects.toThrow();
  });
});
