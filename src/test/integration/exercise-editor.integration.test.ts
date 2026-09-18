import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { GET as topics } from "@/app/api/admin/courses/[courseId]/topics/route";
import {
  GET as detail,
  PATCH as update,
} from "@/app/api/admin/exercises/[exerciseId]/route";
import { POST as create } from "@/app/api/admin/exercises/route";
import { POST as login } from "@/app/api/session/login/route";
import type { AdminRoleFixture } from "@/test/fixtures/admin-roles";
import {
  contentEditorFixture,
  contentReviewerFixture,
} from "@/test/fixtures/admin-roles";
import {
  validCreateExerciseResponse,
  validExerciseDetailResponse,
  validTopicsResponse,
  validUpdateExerciseResponse,
} from "@/test/fixtures/exercise-editor-api";
import { mswServer } from "@/test/integration/msw-server";
import {
  APP_ORIGIN,
  BACKEND_LOGIN_URL,
  BACKEND_ORIGIN,
  loginRequest,
  mutationRequest,
  resourceRequest,
  sealFromResponse,
  setCookieHeader,
} from "@/test/integration/support";

const TOPICS_URL = `${BACKEND_ORIGIN}/api/admin/v1/courses/:courseId/topics`;
const DETAIL_URL = `${BACKEND_ORIGIN}/api/admin/v1/exercises/:exerciseId`;
const CREATE_URL = `${BACKEND_ORIGIN}/api/admin/v1/exercises`;

const editable = {
  type: "multiple_choice",
  topic_id: 1,
  difficulty: 3,
  content: {
    stem: "Soru?",
    options: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
  },
  answer_key: { correct_option_id: "a" },
  explanation: null,
  applicable_scopes: ["tyt"],
};

async function issueSession(fixture: AdminRoleFixture = contentEditorFixture) {
  mswServer.use(
    http.post(BACKEND_LOGIN_URL, () =>
      HttpResponse.json(fixture.loginResponse),
    ),
  );
  const response = await login(
    loginRequest({
      email: fixture.loginResponse.data.admin.email,
      password: "x",
    }),
  );
  const seal = sealFromResponse(response);
  mswServer.resetHandlers();
  return seal;
}

describe("exercise editor read BFFs", () => {
  it("gets topics with optional fields and no forwarded browser headers", async () => {
    const seal = await issueSession();
    let received: Request | null = null;
    mswServer.use(
      http.get(TOPICS_URL, ({ request }) => {
        received = request;
        return HttpResponse.json(validTopicsResponse);
      }),
    );
    const response = await topics(
      resourceRequest("/api/admin/courses/1/topics", seal, {
        authorization: "Bearer attacker",
        origin: "https://evil.test",
        "x-forwarded-for": "203.0.113.8",
      }),
      { params: Promise.resolve({ courseId: "1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.topics[0].parent_id).toBeUndefined();
    expect((received as Request | null)?.headers.get("authorization")).toBe(
      `Bearer ${contentEditorFixture.token}`,
    );
    expect((received as Request | null)?.headers.get("origin")).toBeNull();
    expect(
      (received as Request | null)?.headers.get("x-forwarded-for"),
    ).toBeNull();
  });

  it("gets authenticated detail including answer key and preserves 404", async () => {
    const seal = await issueSession();
    mswServer.use(
      http.get(DETAIL_URL, () =>
        HttpResponse.json(validExerciseDetailResponse),
      ),
    );
    const success = await detail(
      resourceRequest("/api/admin/exercises/1", seal),
      { params: Promise.resolve({ exerciseId: "1" }) },
    );
    expect((await success.json()).data.answer_key.correct_option_id).toBe("b");

    mswServer.resetHandlers();
    mswServer.use(
      http.get(DETAIL_URL, () =>
        HttpResponse.json({ message: "Not Found." }, { status: 404 }),
      ),
    );
    const missing = await detail(
      resourceRequest("/api/admin/exercises/999", seal),
      { params: Promise.resolve({ exerciseId: "999" }) },
    );
    expect(missing.status).toBe(404);
    expect(setCookieHeader(missing)).toBeUndefined();
  });

  it.each(["0", "abc", "1.2", "1e3", "999999999999999999999"])(
    "rejects invalid detail id %s before backend",
    async (exerciseId) => {
      const seen = vi.fn();
      mswServer.use(http.get(DETAIL_URL, seen));
      const response = await detail(
        resourceRequest(`/api/admin/exercises/${exerciseId}`, null),
        { params: Promise.resolve({ exerciseId }) },
      );
      expect(response.status).toBe(400);
      expect(seen).not.toHaveBeenCalled();
    },
  );

  it("maps backend contract and server failures to safe 502 without clearing", async () => {
    const seal = await issueSession();
    mswServer.use(
      http.get(DETAIL_URL, () =>
        HttpResponse.json({ data: { id: 1, type: "essay" } }),
      ),
    );
    const response = await detail(
      resourceRequest("/api/admin/exercises/1", seal),
      { params: Promise.resolve({ exerciseId: "1" }) },
    );
    expect(response.status).toBe(502);
    expect(setCookieHeader(response)).toBeUndefined();
  });
});

describe("POST /api/admin/exercises", () => {
  it("sends the exact allowlisted body and sealed-session bearer token", async () => {
    const seal = await issueSession();
    let body: unknown;
    let authorization: string | null = null;
    let forwarded: Record<string, string | null> = {};
    mswServer.use(
      http.post(CREATE_URL, async ({ request }) => {
        body = await request.json();
        authorization = request.headers.get("authorization");
        forwarded = {
          cookie: request.headers.get("cookie"),
          origin: request.headers.get("origin"),
          forwarded: request.headers.get("forwarded"),
          realIp: request.headers.get("x-real-ip"),
        };
        return HttpResponse.json(validCreateExerciseResponse, { status: 201 });
      }),
    );
    const response = await create(
      mutationRequest(
        "/api/admin/exercises",
        seal,
        "POST",
        {
          ...editable,
          owner_unit_id: 12,
          status: "published",
          version: 9,
          stats: { attempts: 5 },
        },
        {
          origin: APP_ORIGIN,
          authorization: "Bearer attacker",
          forwarded: "for=evil",
          "x-real-ip": "203.0.113.2",
        },
      ),
    );
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(201);
    expect(body).toEqual({ ...editable, owner_unit_id: 12 });
    expect(body).not.toHaveProperty("status");
    expect(authorization).toBe(`Bearer ${contentEditorFixture.token}`);
    expect(forwarded).toEqual({
      cookie: null,
      origin: null,
      forwarded: null,
      realIp: null,
    });
    expect(serialized).not.toContain(contentEditorFixture.token);
    expect(serialized).not.toContain(BACKEND_ORIGIN);
  });

  it.each([
    ["missing", {}],
    ["wrong", { origin: "https://evil.test" }],
  ])("rejects %s Origin with zero backend calls", async (_label, headers) => {
    const seal = await issueSession();
    const seen = vi.fn();
    mswServer.use(http.post(CREATE_URL, seen));
    const response = await create(
      mutationRequest(
        "/api/admin/exercises",
        seal,
        "POST",
        { ...editable, owner_unit_id: 12 },
        headers,
      ),
    );
    expect(response.status).toBe(403);
    expect(seen).not.toHaveBeenCalled();
  });

  it("blocks edit_content=false before backend and preserves the cookie", async () => {
    const seal = await issueSession(contentReviewerFixture);
    const seen = vi.fn();
    mswServer.use(http.post(CREATE_URL, seen));
    const response = await create(
      mutationRequest("/api/admin/exercises", seal, "POST", {
        ...editable,
        owner_unit_id: 12,
      }),
    );
    expect(response.status).toBe(403);
    expect(seen).not.toHaveBeenCalled();
    expect(setCookieHeader(response)).toBeUndefined();
  });

  it("normalizes TOPIC_MISMATCH and content schema errors", async () => {
    const seal = await issueSession();
    mswServer.use(
      http.post(CREATE_URL, () =>
        HttpResponse.json(
          { error: { code: "TOPIC_MISMATCH", message: "raw detail" } },
          { status: 422 },
        ),
      ),
    );
    const mismatch = await create(
      mutationRequest("/api/admin/exercises", seal, "POST", {
        ...editable,
        owner_unit_id: 12,
      }),
    );
    expect((await mismatch.json()).error.code).toBe("TOPIC_MISMATCH");

    mswServer.resetHandlers();
    mswServer.use(
      http.post(CREATE_URL, () =>
        HttpResponse.json(
          {
            error: {
              code: "INVALID_EXERCISE_CONTENT",
              message: "Soru şeması geçersiz.",
              details: {
                schema_errors: ["Doğru şık 'z' şıklar arasında yok."],
              },
            },
          },
          { status: 422 },
        ),
      ),
    );
    const invalid = await create(
      mutationRequest("/api/admin/exercises", seal, "POST", {
        ...editable,
        owner_unit_id: 12,
      }),
    );
    expect((await invalid.json()).error.details.schema_errors).toHaveLength(1);
  });
});

describe("PATCH /api/admin/exercises/[exerciseId]", () => {
  it("validates id, strips ownership/status/version and parses warning", async () => {
    const seal = await issueSession();
    let body: unknown;
    mswServer.use(
      http.patch(DETAIL_URL, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(validUpdateExerciseResponse);
      }),
    );
    const response = await update(
      mutationRequest("/api/admin/exercises/1", seal, "PATCH", {
        ...editable,
        owner_unit_id: 44,
        status: "archived",
        version: 99,
        id: 9,
      }),
      { params: Promise.resolve({ exerciseId: "1" }) },
    );
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual(editable);
    expect(result.data).toMatchObject({ version: 4, answer_key_changed: true });
  });

  it("preserves the session for backend 403 and clears it for backend 401", async () => {
    const seal = await issueSession();
    mswServer.use(
      http.patch(DETAIL_URL, () =>
        HttpResponse.json(
          { error: { code: "FORBIDDEN", message: "No" } },
          { status: 403 },
        ),
      ),
    );
    const forbidden = await update(
      mutationRequest("/api/admin/exercises/1", seal, "PATCH", editable),
      { params: Promise.resolve({ exerciseId: "1" }) },
    );
    expect(forbidden.status).toBe(403);
    expect(setCookieHeader(forbidden)).toBeUndefined();

    mswServer.resetHandlers();
    mswServer.use(
      http.patch(DETAIL_URL, () =>
        HttpResponse.json({ message: "Unauthenticated." }, { status: 401 }),
      ),
    );
    const unauthorized = await update(
      mutationRequest("/api/admin/exercises/1", seal, "PATCH", editable),
      { params: Promise.resolve({ exerciseId: "1" }) },
    );
    expect(unauthorized.status).toBe(401);
    expect(setCookieHeader(unauthorized)).toContain("Max-Age=0");
  });
});
