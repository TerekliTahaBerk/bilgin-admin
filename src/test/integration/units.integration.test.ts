import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { GET as units } from "@/app/api/admin/courses/[courseId]/units/route";
import { POST as login } from "@/app/api/session/login/route";
import type { AdminSession } from "@/lib/session/schema";
import { contentEditorFixture } from "@/test/fixtures/admin-roles";
import { validUnitsResponse } from "@/test/fixtures/courses-api";
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

const COURSE_ID = 7;
const BACKEND_UNITS_URL = `${BACKEND_ORIGIN}/api/admin/v1/courses/${COURSE_ID}/units`;
const ANY_UNITS_URL = `${BACKEND_ORIGIN}/api/admin/v1/courses/:courseId/units`;

function unitsRequest(
  seal: string | null,
  courseId: string = String(COURSE_ID),
  extraHeaders: Record<string, string> = {},
) {
  return {
    request: resourceRequest(
      `/api/admin/courses/${courseId}/units`,
      seal,
      extraHeaders,
    ),
    context: { params: Promise.resolve({ courseId }) },
  };
}

function callUnits(
  seal: string | null,
  courseId: string = String(COURSE_ID),
  extraHeaders: Record<string, string> = {},
) {
  const { request, context } = unitsRequest(seal, courseId, extraHeaders);

  return units(request, context);
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

/** Matches ANY course id, so a wrong outgoing path still fails loudly. */
function backendUnits(handler: Parameters<typeof http.get>[1]) {
  const seen = vi.fn();

  mswServer.use(
    http.get(ANY_UNITS_URL, (info) => {
      seen(info.request);

      return handler(info);
    }),
  );

  return seen;
}

describe("GET /api/admin/courses/[courseId]/units — success", () => {
  it("returns the unit list through the real transport", async () => {
    const { seal } = await issueSession();
    let requestedUrl: string | null = null;

    mswServer.use(
      http.get(ANY_UNITS_URL, ({ request }) => {
        requestedUrl = request.url;

        return HttpResponse.json(validUnitsResponse);
      }),
    );

    const response = await callUnits(seal);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requestedUrl).toBe(BACKEND_UNITS_URL);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.data).toHaveLength(3);
    expect(body.data[0].title).toBe("İlk ve Orta Çağlarda Türk Dünyası");
    expect(body.data[2].grade_level).toBeNull();
    expect(setCookieHeader(response)).toBeUndefined();
  });

  it("preserves the backend ordering", async () => {
    const { seal } = await issueSession();
    backendUnits(() => HttpResponse.json(validUnitsResponse));

    const body = await (await callUnits(seal)).json();

    expect(body.data.map((u: { sort_order: number }) => u.sort_order)).toEqual([
      1, 2, 3,
    ]);
  });

  it("authenticates with the session token and leaks nothing back", async () => {
    const { seal } = await issueSession();
    let authorization: string | null = null;

    mswServer.use(
      http.get(ANY_UNITS_URL, ({ request }) => {
        authorization = request.headers.get("authorization");

        return HttpResponse.json(validUnitsResponse);
      }),
    );

    const serialized = JSON.stringify(await (await callUnits(seal)).json());

    expect(authorization).toBe(`Bearer ${contentEditorFixture.token}`);
    expect(serialized).not.toContain(contentEditorFixture.token);
    expect(serialized).not.toContain("backendToken");
    expect(serialized).not.toContain(BACKEND_ORIGIN);
  });

  it("forwards no browser-supplied header to the backend", async () => {
    const { seal } = await issueSession();
    let received: Record<string, string | null> = {};

    mswServer.use(
      http.get(ANY_UNITS_URL, ({ request }) => {
        received = {
          authorization: request.headers.get("authorization"),
          cookie: request.headers.get("cookie"),
          xForwardedFor: request.headers.get("x-forwarded-for"),
          xRealIp: request.headers.get("x-real-ip"),
          forwarded: request.headers.get("forwarded"),
          origin: request.headers.get("origin"),
        };

        return HttpResponse.json(validUnitsResponse);
      }),
    );

    await callUnits(seal, String(COURSE_ID), {
      authorization: "Bearer attacker-supplied-token",
      "x-forwarded-for": "203.0.113.7",
      "x-real-ip": "203.0.113.7",
      forwarded: "for=203.0.113.7",
      origin: "https://evil.test",
    });

    expect(received.authorization).toBe(`Bearer ${contentEditorFixture.token}`);
    expect(received.authorization).not.toContain("attacker");
    expect(received.cookie).toBeNull();
    expect(received.xForwardedFor).toBeNull();
    expect(received.xRealIp).toBeNull();
    expect(received.forwarded).toBeNull();
    expect(received.origin).toBeNull();
  });
});

describe("GET /api/admin/courses/[courseId]/units — course id validation", () => {
  it.each([
    ["zero", "0"],
    ["a negative id", "-1"],
    ["a word", "abc"],
    ["a fractional id", "1.2"],
    ["a traversal attempt", "1/../../me"],
    ["an encoded traversal", "1%2F..%2Fme"],
    ["a query string", "1?x=y"],
    ["an oversized integer", "999999999999999999999"],
    ["an empty id", ""],
  ])("rejects %s with 400 and no backend call", async (_label, courseId) => {
    const { seal } = await issueSession();
    const seen = backendUnits(() => HttpResponse.json(validUnitsResponse));

    const response = await callUnits(seal, courseId);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(seen).toHaveBeenCalledTimes(0);
    expect(setCookieHeader(response)).toBeUndefined();
    expect(body.error.kind).toBe("protocol");
  });

  it.each([
    ["a traversal attempt", "1/../../me"],
    ["an encoded traversal", "1%2F..%2Fme"],
    ["a query string", "1?x=y"],
    ["a word", "abc"],
    ["an oversized integer", "999999999999999999999"],
  ])("never echoes %s back to the browser", async (_label, courseId) => {
    const { seal } = await issueSession();
    backendUnits(() => HttpResponse.json(validUnitsResponse));

    const response = await callUnits(seal, courseId);

    expect(JSON.stringify(await response.json())).not.toContain(courseId);
  });

  it("validates the id before it even looks at the session", async () => {
    const seen = backendUnits(() => HttpResponse.json(validUnitsResponse));

    const response = await callUnits(null, "abc");

    expect(response.status).toBe(400);
    expect(seen).toHaveBeenCalledTimes(0);
  });
});

describe("GET /api/admin/courses/[courseId]/units — session states", () => {
  it("rejects a request with no session cookie without calling the backend", async () => {
    const seen = backendUnits(() => HttpResponse.json(validUnitsResponse));

    const response = await callUnits(null);

    expect(response.status).toBe(401);
    expect(seen).toHaveBeenCalledTimes(0);
    expect(setCookieHeader(response)).toBeUndefined();
  });

  it.each([
    ["a malformed cookie", "not-a-seal"],
    ["a tampered cookie", "Fe26.2**deadbeef*tampered*value*payload*mac"],
  ])("clears the cookie for %s", async (_label, seal) => {
    const seen = backendUnits(() => HttpResponse.json(validUnitsResponse));

    const response = await callUnits(seal);

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
    const seen = backendUnits(() => HttpResponse.json(validUnitsResponse));

    const response = await callUnits(expired);

    expect(response.status).toBe(401);
    expect(setCookieHeader(response)).toContain("Max-Age=0");
    expect(seen).toHaveBeenCalledTimes(0);
  });
});

describe("GET /api/admin/courses/[courseId]/units — backend failures", () => {
  it("clears the session when the backend rejects the token", async () => {
    const { seal } = await issueSession();
    backendUnits(() =>
      HttpResponse.json({ message: "Unauthenticated." }, { status: 401 }),
    );

    const response = await callUnits(seal);

    expect(response.status).toBe(401);
    expect(setCookieHeader(response)).toContain("Max-Age=0");
  });

  it("preserves the session when the backend answers 403", async () => {
    const { seal } = await issueSession();
    backendUnits(() =>
      HttpResponse.json(
        { error: { code: "FORBIDDEN", message: "Bu işlem için yetkin yok." } },
        { status: 403 },
      ),
    );

    const response = await callUnits(seal);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.kind).toBe("authorization");
    expect(setCookieHeader(response)).toBeUndefined();
  });

  it("preserves the session when the course does not exist", async () => {
    const { seal } = await issueSession();
    backendUnits(() =>
      HttpResponse.json({ message: "Not Found." }, { status: 404 }),
    );

    const response = await callUnits(seal);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.kind).toBe("not_found");
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
      "a payload that breaks the unit contract",
      () =>
        HttpResponse.json({
          data: [{ id: 1, title: "X", status: "live", access: "paid" }],
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
    backendUnits(() => respond());

    const response = await callUnits(seal);
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(502);
    expect(setCookieHeader(response)).toBeUndefined();
    expect(serialized).not.toContain("SQLSTATE");
    expect(serialized).not.toContain("/var/www");
    expect(serialized).not.toContain(contentEditorFixture.token);
  });
});
