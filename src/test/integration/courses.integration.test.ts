import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { GET as courses } from "@/app/api/admin/courses/route";
import { POST as login } from "@/app/api/session/login/route";
import type { AdminSession } from "@/lib/session/schema";
import { contentEditorFixture } from "@/test/fixtures/admin-roles";
import { validCoursesResponse } from "@/test/fixtures/courses-api";
import { mswServer } from "@/test/integration/msw-server";
import {
  BACKEND_LOGIN_URL,
  BACKEND_ORIGIN,
  loginRequest,
  openSeal,
  resealWith,
  resourceRequest,
  sealFromResponse,
  setCookieHeader,
} from "@/test/integration/support";

const BACKEND_COURSES_URL = `${BACKEND_ORIGIN}/api/admin/v1/courses`;

function coursesRequest(
  seal: string | null,
  extraHeaders: Record<string, string> = {},
) {
  return resourceRequest("/api/admin/courses", seal, extraHeaders);
}

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

function backendCourses(handler: Parameters<typeof http.get>[1]) {
  const seen = vi.fn();

  mswServer.use(
    http.get(BACKEND_COURSES_URL, (info) => {
      seen(info.request);

      return handler(info);
    }),
  );

  return seen;
}

describe("GET /api/admin/courses — success", () => {
  it("returns the course list through the real transport", async () => {
    const { seal } = await issueSession();
    const seen = backendCourses(() => HttpResponse.json(validCoursesResponse));

    const response = await courses(coursesRequest(seal));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.data).toHaveLength(4);
    expect(body.data[0].code).toBe("tyt_turkce");
    expect(body.data.map((c: { status: string }) => c.status)).toContain(
      "review",
    );
    expect(setCookieHeader(response)).toBeUndefined();
  });

  it("authenticates with the session token and leaks nothing back", async () => {
    const { seal } = await issueSession();
    let authorization: string | null = null;

    mswServer.use(
      http.get(BACKEND_COURSES_URL, ({ request }) => {
        authorization = request.headers.get("authorization");

        return HttpResponse.json(validCoursesResponse);
      }),
    );

    const response = await courses(coursesRequest(seal));
    const serialized = JSON.stringify(await response.json());

    expect(authorization).toBe(`Bearer ${contentEditorFixture.token}`);
    expect(serialized).not.toContain(contentEditorFixture.token);
    expect(serialized).not.toContain("backendToken");
    expect(serialized).not.toContain(BACKEND_ORIGIN);
  });

  it("preserves the backend ordering", async () => {
    const { seal } = await issueSession();
    backendCourses(() => HttpResponse.json(validCoursesResponse));

    const body = await (await courses(coursesRequest(seal))).json();

    expect(body.data.map((c: { id: number }) => c.id)).toEqual([1, 2, 3, 4]);
  });
});

describe("GET /api/admin/courses — incoming header safety", () => {
  it("forwards no browser-supplied header to the backend", async () => {
    const { seal } = await issueSession();
    let received: Record<string, string | null> = {};

    mswServer.use(
      http.get(BACKEND_COURSES_URL, ({ request }) => {
        received = {
          authorization: request.headers.get("authorization"),
          cookie: request.headers.get("cookie"),
          xForwardedFor: request.headers.get("x-forwarded-for"),
          xRealIp: request.headers.get("x-real-ip"),
          forwarded: request.headers.get("forwarded"),
          origin: request.headers.get("origin"),
        };

        return HttpResponse.json(validCoursesResponse);
      }),
    );

    await courses(
      coursesRequest(seal, {
        authorization: "Bearer attacker-supplied-token",
        "x-forwarded-for": "203.0.113.7",
        "x-real-ip": "203.0.113.7",
        forwarded: "for=203.0.113.7",
        origin: "https://evil.test",
      }),
    );

    expect(received.authorization).toBe(`Bearer ${contentEditorFixture.token}`);
    expect(received.authorization).not.toContain("attacker");
    expect(received.cookie).toBeNull();
    expect(received.xForwardedFor).toBeNull();
    expect(received.xRealIp).toBeNull();
    expect(received.forwarded).toBeNull();
    expect(received.origin).toBeNull();
  });
});

describe("GET /api/admin/courses — local session states", () => {
  it("rejects a request with no session cookie without calling the backend", async () => {
    const seen = backendCourses(() => HttpResponse.json(validCoursesResponse));

    const response = await courses(coursesRequest(null));

    expect(response.status).toBe(401);
    expect(seen).toHaveBeenCalledTimes(0);
    expect(setCookieHeader(response)).toBeUndefined();
  });

  it.each([
    ["a malformed cookie", "not-a-seal"],
    ["a tampered cookie", "Fe26.2**deadbeef*tampered*value*payload*mac"],
  ])("clears the cookie for %s", async (_label, seal) => {
    const seen = backendCourses(() => HttpResponse.json(validCoursesResponse));

    const response = await courses(coursesRequest(seal));

    expect(response.status).toBe(401);
    expect(setCookieHeader(response)).toContain("Max-Age=0");
    expect(seen).toHaveBeenCalledTimes(0);
  });

  it("clears the cookie for an expired session payload", async () => {
    const { session } = await issueSession();
    const expired = await resealWith(session, {
      issuedAt: session.issuedAt - 28800 * 1000 - 2000,
      validatedAt: session.issuedAt - 28800 * 1000 - 2000,
      expiresAt: session.issuedAt - 1000,
    });
    const seen = backendCourses(() => HttpResponse.json(validCoursesResponse));

    const response = await courses(coursesRequest(expired));

    expect(response.status).toBe(401);
    expect(setCookieHeader(response)).toContain("Max-Age=0");
    expect(seen).toHaveBeenCalledTimes(0);
  });
});

describe("GET /api/admin/courses — backend failures", () => {
  it("clears the session when the backend rejects the token", async () => {
    const { seal } = await issueSession();
    backendCourses(() =>
      HttpResponse.json({ message: "Unauthenticated." }, { status: 401 }),
    );

    const response = await courses(coursesRequest(seal));

    expect(response.status).toBe(401);
    expect(setCookieHeader(response)).toContain("Max-Age=0");
  });

  it("preserves the session when the backend answers 403", async () => {
    const { seal } = await issueSession();
    backendCourses(() =>
      HttpResponse.json(
        { error: { code: "FORBIDDEN", message: "Bu işlem için yetkin yok." } },
        { status: 403 },
      ),
    );

    const response = await courses(coursesRequest(seal));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.kind).toBe("authorization");
    expect(setCookieHeader(response)).toBeUndefined();
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
      "a payload that breaks the course contract",
      () =>
        HttpResponse.json({
          data: [{ id: 1, code: "x", name: "X", scope: "lys", status: "live" }],
          meta: { server_time: "2026-09-16T19:05:20+00:00" },
        }),
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
    const { seal } = await issueSession();
    backendCourses(() => respond());

    const response = await courses(coursesRequest(seal));
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(502);
    expect(setCookieHeader(response)).toBeUndefined();
    expect(serialized).not.toContain("SQLSTATE");
    expect(serialized).not.toContain("/var/www");
    expect(serialized).not.toContain(contentEditorFixture.token);
  });
});
