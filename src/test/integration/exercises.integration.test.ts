import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { GET as exercises } from "@/app/api/admin/units/[unitId]/exercises/route";
import { POST as login } from "@/app/api/session/login/route";
import type { AdminSession } from "@/lib/session/schema";
import { contentEditorFixture } from "@/test/fixtures/admin-roles";
import { validUnitExercisesResponse } from "@/test/fixtures/exercises-api";
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

const UNIT_ID = 12;
const ANY_EXERCISES_URL = `${BACKEND_ORIGIN}/api/admin/v1/units/:unitId/exercises`;

function callExercises(
  seal: string | null,
  {
    unitId = String(UNIT_ID),
    query = "",
    headers = {},
  }: { unitId?: string; query?: string; headers?: Record<string, string> } = {},
) {
  return exercises(
    resourceRequest(
      `/api/admin/units/${unitId}/exercises${query}`,
      seal,
      headers,
    ),
    { params: Promise.resolve({ unitId }) },
  );
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

function backendExercises(handler: Parameters<typeof http.get>[1]) {
  const seen = vi.fn();

  mswServer.use(
    http.get(ANY_EXERCISES_URL, (info) => {
      seen(info.request);

      return handler(info);
    }),
  );

  return seen;
}

describe("GET /api/admin/units/[unitId]/exercises — success", () => {
  it("returns the unit and its exercises through the real transport", async () => {
    const { seal } = await issueSession();
    let requestedUrl: string | null = null;

    mswServer.use(
      http.get(ANY_EXERCISES_URL, ({ request }) => {
        requestedUrl = request.url;

        return HttpResponse.json(validUnitExercisesResponse);
      }),
    );

    const response = await callExercises(seal);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requestedUrl).toBe(
      `${BACKEND_ORIGIN}/api/admin/v1/units/${UNIT_ID}/exercises`,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.data.unit.id).toBe(UNIT_ID);
    expect(body.data.exercises).toHaveLength(5);
    expect(body.data.exercises[0].stats.correct_rate).toBeNull();
    expect(setCookieHeader(response)).toBeUndefined();
  });

  it("preserves the backend ordering", async () => {
    const { seal } = await issueSession();
    backendExercises(() => HttpResponse.json(validUnitExercisesResponse));

    const body = await (await callExercises(seal)).json();

    expect(body.data.exercises.map((e: { id: number }) => e.id)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it("authenticates with the session token and leaks nothing back", async () => {
    const { seal } = await issueSession();
    let authorization: string | null = null;

    mswServer.use(
      http.get(ANY_EXERCISES_URL, ({ request }) => {
        authorization = request.headers.get("authorization");

        return HttpResponse.json(validUnitExercisesResponse);
      }),
    );

    const serialized = JSON.stringify(await (await callExercises(seal)).json());

    expect(authorization).toBe(`Bearer ${contentEditorFixture.token}`);
    expect(serialized).not.toContain(contentEditorFixture.token);
    expect(serialized).not.toContain("backendToken");
    expect(serialized).not.toContain(BACKEND_ORIGIN);
  });

  it("forwards no browser-supplied header to the backend", async () => {
    const { seal } = await issueSession();
    let received: Record<string, string | null> = {};

    mswServer.use(
      http.get(ANY_EXERCISES_URL, ({ request }) => {
        received = {
          authorization: request.headers.get("authorization"),
          cookie: request.headers.get("cookie"),
          origin: request.headers.get("origin"),
          host: request.headers.get("x-original-host"),
          xForwardedFor: request.headers.get("x-forwarded-for"),
          xRealIp: request.headers.get("x-real-ip"),
          forwarded: request.headers.get("forwarded"),
        };

        return HttpResponse.json(validUnitExercisesResponse);
      }),
    );

    await callExercises(seal, {
      headers: {
        authorization: "Bearer attacker-supplied-token",
        origin: "https://evil.test",
        "x-original-host": "evil.test",
        "x-forwarded-for": "203.0.113.7",
        "x-real-ip": "203.0.113.7",
        forwarded: "for=203.0.113.7",
      },
    });

    expect(received.authorization).toBe(`Bearer ${contentEditorFixture.token}`);
    expect(received.authorization).not.toContain("attacker");
    expect(received.cookie).toBeNull();
    expect(received.origin).toBeNull();
    expect(received.host).toBeNull();
    expect(received.xForwardedFor).toBeNull();
    expect(received.xRealIp).toBeNull();
    expect(received.forwarded).toBeNull();
  });
});

describe("GET /api/admin/units/[unitId]/exercises — filter boundary", () => {
  it.each([
    ["?type=multiple_choice", "type=multiple_choice"],
    ["?status=draft", "status=draft"],
    ["?type=multiple_choice&status=draft", "type=multiple_choice&status=draft"],
  ])(
    "passes the validated query %s to the backend",
    async (query, expected) => {
      const { seal } = await issueSession();
      let requestedUrl: string | null = null;

      mswServer.use(
        http.get(ANY_EXERCISES_URL, ({ request }) => {
          requestedUrl = request.url;

          return HttpResponse.json(validUnitExercisesResponse);
        }),
      );

      const response = await callExercises(seal, { query });

      expect(response.status).toBe(200);
      expect(requestedUrl).toBe(
        `${BACKEND_ORIGIN}/api/admin/v1/units/${UNIT_ID}/exercises?${expected}`,
      );
    },
  );

  it.each([
    ["an unknown type", "?type=banana"],
    ["an unknown status", "?status=banana"],
    ["an uppercase type", "?type=MULTIPLE_CHOICE"],
    ["a duplicated type", "?type=multiple_choice&type=true_false"],
    ["a duplicated status", "?status=draft&status=published"],
    ["an unknown key", "?unknown=value"],
    ["a topic filter", "?topic=7"],
    ["a difficulty filter", "?difficulty=3"],
    ["a topic filter beside a valid one", "?type=multiple_choice&topic=7"],
    ["a path-style injection", "?type=..%2F..%2Fme"],
    ["a url parameter", "?url=https://evil.test"],
    ["an empty type", "?type="],
  ])("rejects %s with 400 and no backend call", async (_label, query) => {
    const { seal } = await issueSession();
    const seen = backendExercises(() =>
      HttpResponse.json(validUnitExercisesResponse),
    );

    const response = await callExercises(seal, { query });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(seen).toHaveBeenCalledTimes(0);
    expect(body.error.kind).toBe("protocol");
    expect(setCookieHeader(response)).toBeUndefined();
  });

  it("never echoes a rejected filter value back to the browser", async () => {
    const { seal } = await issueSession();
    backendExercises(() => HttpResponse.json(validUnitExercisesResponse));

    const response = await callExercises(seal, {
      query: "?type=..%2F..%2Fme&url=https://evil.test",
    });

    const serialized = JSON.stringify(await response.json());

    expect(serialized).not.toContain("evil.test");
    expect(serialized).not.toContain("..");
  });
});

describe("GET /api/admin/units/[unitId]/exercises — unit id validation", () => {
  it.each([
    ["zero", "0"],
    ["a negative id", "-1"],
    ["a word", "abc"],
    ["a fractional id", "1.2"],
    ["a traversal attempt", "12/../../me"],
    ["an encoded traversal", "12%2F..%2Fme"],
    ["a query string", "12?status=published"],
    ["an oversized integer", "999999999999999999999"],
    ["scientific notation", "1e3"],
    ["hex", "0x1"],
    ["an empty id", ""],
  ])("rejects %s with 400 and no backend call", async (_label, unitId) => {
    const { seal } = await issueSession();
    const seen = backendExercises(() =>
      HttpResponse.json(validUnitExercisesResponse),
    );

    const response = await callExercises(seal, { unitId });

    expect(response.status).toBe(400);
    expect(seen).toHaveBeenCalledTimes(0);
  });

  it("validates the id before it looks at the session", async () => {
    const seen = backendExercises(() =>
      HttpResponse.json(validUnitExercisesResponse),
    );

    const response = await callExercises(null, { unitId: "abc" });

    expect(response.status).toBe(400);
    expect(seen).toHaveBeenCalledTimes(0);
  });
});

describe("GET /api/admin/units/[unitId]/exercises — session states", () => {
  it("rejects a request with no session cookie without calling the backend", async () => {
    const seen = backendExercises(() =>
      HttpResponse.json(validUnitExercisesResponse),
    );

    const response = await callExercises(null);

    expect(response.status).toBe(401);
    expect(seen).toHaveBeenCalledTimes(0);
    expect(setCookieHeader(response)).toBeUndefined();
  });

  it.each([
    ["a malformed cookie", "not-a-seal"],
    ["a tampered cookie", "Fe26.2**deadbeef*tampered*value*payload*mac"],
  ])("clears the cookie for %s", async (_label, seal) => {
    const seen = backendExercises(() =>
      HttpResponse.json(validUnitExercisesResponse),
    );

    const response = await callExercises(seal);

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

    const response = await callExercises(expired);

    expect(response.status).toBe(401);
    expect(setCookieHeader(response)).toContain("Max-Age=0");
  });
});

describe("GET /api/admin/units/[unitId]/exercises — backend failures", () => {
  it("clears the session when the backend rejects the token", async () => {
    const { seal } = await issueSession();
    backendExercises(() =>
      HttpResponse.json({ message: "Unauthenticated." }, { status: 401 }),
    );

    const response = await callExercises(seal);

    expect(response.status).toBe(401);
    expect(setCookieHeader(response)).toContain("Max-Age=0");
  });

  it("preserves the session when the backend answers 403", async () => {
    const { seal } = await issueSession();
    backendExercises(() =>
      HttpResponse.json(
        { error: { code: "FORBIDDEN", message: "Bu işlem için yetkin yok." } },
        { status: 403 },
      ),
    );

    const response = await callExercises(seal);

    expect(response.status).toBe(403);
    expect(setCookieHeader(response)).toBeUndefined();
  });

  it("preserves the session when the unit does not exist", async () => {
    const { seal } = await issueSession();
    backendExercises(() =>
      HttpResponse.json({ message: "Not Found." }, { status: 404 }),
    );

    const response = await callExercises(seal);
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
      "a payload that breaks the exercise contract",
      () =>
        HttpResponse.json({
          data: {
            unit: { id: 12, title: "x" },
            exercises: [{ id: 1, type: "essay", difficulty: 9 }],
          },
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
    backendExercises(() => respond());

    const response = await callExercises(seal);
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(502);
    expect(setCookieHeader(response)).toBeUndefined();
    expect(serialized).not.toContain("SQLSTATE");
    expect(serialized).not.toContain("/var/www");
    expect(serialized).not.toContain(contentEditorFixture.token);
  });
});
