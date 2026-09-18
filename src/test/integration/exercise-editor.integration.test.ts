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
  validFillBlankDetailResponse,
  validFlashcardDetailResponse,
  validNumericInputDetailResponse,
  validTopicsResponse,
  validTrueFalseDetailResponse,
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

const trueFalseEditable = {
  type: "true_false",
  topic_id: 1,
  difficulty: 3,
  content: { statement: "Uygurlar yerleşik hayata geçmiştir." },
  answer_key: { value: false },
  explanation: null,
  applicable_scopes: ["tyt"],
};

describe("true/false mutations through the real BFF chain", () => {
  it("creates with the exact backend body, keeping the answer a JSON boolean false", async () => {
    const seal = await issueSession();
    let raw = "";
    let body: unknown;
    mswServer.use(
      http.post(CREATE_URL, async ({ request }) => {
        raw = await request.text();
        body = JSON.parse(raw);
        return HttpResponse.json(validCreateExerciseResponse, { status: 201 });
      }),
    );

    const response = await create(
      mutationRequest(
        "/api/admin/exercises",
        seal,
        "POST",
        {
          ...trueFalseEditable,
          owner_unit_id: 12,
          // Mass-assignment attempts the browser must never get forwarded.
          id: 77,
          status: "published",
          version: 9,
          stats: { attempts: 5 },
          owner_course_id: 3,
        },
        { origin: APP_ORIGIN },
      ),
    );

    expect(response.status).toBe(201);
    expect(body).toEqual({ ...trueFalseEditable, owner_unit_id: 12 });
    // The wire format itself, not just the parsed object.
    expect(raw).toContain('"value":false');
    expect(raw).not.toContain('"false"');
    expect(body).not.toHaveProperty("id");
    expect(body).not.toHaveProperty("status");
    expect(body).not.toHaveProperty("version");
    expect(body).not.toHaveProperty("stats");
    expect(body).not.toHaveProperty("owner_course_id");
  });

  it("updates without forwarding ownership, status or version and returns the warning", async () => {
    const seal = await issueSession();
    let body: unknown;
    let raw = "";
    mswServer.use(
      http.patch(DETAIL_URL, async ({ request }) => {
        raw = await request.text();
        body = JSON.parse(raw);
        return HttpResponse.json(validUpdateExerciseResponse);
      }),
    );

    const response = await update(
      mutationRequest("/api/admin/exercises/2", seal, "PATCH", {
        ...trueFalseEditable,
        answer_key: { value: true },
        owner_unit_id: 999,
        status: "archived",
        version: 3,
        id: 2,
      }),
      { params: Promise.resolve({ exerciseId: "2" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ...trueFalseEditable, answer_key: { value: true } });
    expect(raw).toContain('"value":true');
    expect(body).not.toHaveProperty("owner_unit_id");
    expect(body).not.toHaveProperty("status");
    expect(body).not.toHaveProperty("version");
    expect(body).not.toHaveProperty("id");
    expect(payload.data.version).toBe(4);
    expect(payload.data.answer_key_changed).toBe(true);
    expect(payload.data.warning).toContain("Cevap anahtarı değişti");
  });

  it.each([
    ['string "false"', "false"],
    ['string "true"', "true"],
    ["number 1", 1],
    ["number 0", 0],
    ["null", null],
  ])(
    "rejects a %s answer with 400 and zero backend calls",
    async (_label, value) => {
      const seal = await issueSession();
      const seen = vi.fn();
      mswServer.use(http.post(CREATE_URL, seen), http.patch(DETAIL_URL, seen));

      const created = await create(
        mutationRequest(
          "/api/admin/exercises",
          seal,
          "POST",
          { ...trueFalseEditable, answer_key: { value }, owner_unit_id: 12 },
          { origin: APP_ORIGIN },
        ),
      );
      const updated = await update(
        mutationRequest("/api/admin/exercises/2", seal, "PATCH", {
          ...trueFalseEditable,
          answer_key: { value },
        }),
        { params: Promise.resolve({ exerciseId: "2" }) },
      );

      expect(created.status).toBe(400);
      expect(updated.status).toBe(400);
      expect(seen).not.toHaveBeenCalled();
    },
  );

  it.each([["fill_blank"], ["matching"], ["banana"]])(
    "rejects the unsupported mutation type %s with 400 and zero backend calls",
    async (type) => {
      const seal = await issueSession();
      const seen = vi.fn();
      mswServer.use(http.post(CREATE_URL, seen), http.patch(DETAIL_URL, seen));

      const created = await create(
        mutationRequest(
          "/api/admin/exercises",
          seal,
          "POST",
          { ...trueFalseEditable, type, owner_unit_id: 12 },
          { origin: APP_ORIGIN },
        ),
      );
      const updated = await update(
        mutationRequest("/api/admin/exercises/2", seal, "PATCH", {
          ...trueFalseEditable,
          type,
        }),
        { params: Promise.resolve({ exerciseId: "2" }) },
      );

      expect(created.status).toBe(400);
      expect(updated.status).toBe(400);
      expect(seen).not.toHaveBeenCalled();
    },
  );

  it("rejects a true/false body carrying multiple choice content", async () => {
    const seal = await issueSession();
    const seen = vi.fn();
    mswServer.use(http.post(CREATE_URL, seen));

    const response = await create(
      mutationRequest(
        "/api/admin/exercises",
        seal,
        "POST",
        {
          ...trueFalseEditable,
          content: { stem: "Soru?", options: [{ id: "a", text: "A" }] },
          answer_key: { correct_option_id: "a" },
          owner_unit_id: 12,
        },
        { origin: APP_ORIGIN },
      ),
    );

    expect(response.status).toBe(400);
    expect(seen).not.toHaveBeenCalled();
  });

  it("blocks a true/false mutation for edit_content=false before the backend", async () => {
    const seal = await issueSession(contentReviewerFixture);
    const seen = vi.fn();
    mswServer.use(http.post(CREATE_URL, seen), http.patch(DETAIL_URL, seen));

    const created = await create(
      mutationRequest(
        "/api/admin/exercises",
        seal,
        "POST",
        { ...trueFalseEditable, owner_unit_id: 12 },
        { origin: APP_ORIGIN },
      ),
    );
    const updated = await update(
      mutationRequest(
        "/api/admin/exercises/2",
        seal,
        "PATCH",
        trueFalseEditable,
      ),
      { params: Promise.resolve({ exerciseId: "2" }) },
    );

    expect(created.status).toBe(403);
    expect(updated.status).toBe(403);
    expect(seen).not.toHaveBeenCalled();
    expect(setCookieHeader(created)).toBeUndefined();
  });

  it("rejects a missing Origin on a true/false create with zero backend calls", async () => {
    const seal = await issueSession();
    const seen = vi.fn();
    mswServer.use(http.post(CREATE_URL, seen));

    const response = await create(
      mutationRequest(
        "/api/admin/exercises",
        seal,
        "POST",
        { ...trueFalseEditable, owner_unit_id: 12 },
        {},
      ),
    );

    expect(response.status).toBe(403);
    expect(seen).not.toHaveBeenCalled();
  });

  it("reads a stored true/false detail including its false answer key", async () => {
    const seal = await issueSession();
    mswServer.use(
      http.get(DETAIL_URL, () =>
        HttpResponse.json(validTrueFalseDetailResponse),
      ),
    );

    const response = await detail(
      resourceRequest("/api/admin/exercises/2", seal),
      { params: Promise.resolve({ exerciseId: "2" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.type).toBe("true_false");
    expect(payload.data.answer_key).toEqual({ value: false });
    expect(payload.data.content.statement).toBe(
      validTrueFalseDetailResponse.data.content.statement,
    );
  });
});

const fillBlankEditable = {
  type: "fill_blank",
  topic_id: 1,
  difficulty: 2,
  content: {
    template: "Türklerde {{0}} adı verilir.",
    choices: ["Töre", "Kurultay", "Kut"],
  },
  answer_key: { blanks: ["Töre"] },
  explanation: null,
  applicable_scopes: ["tyt"],
};

describe("fill blank mutations through the real BFF chain", () => {
  it("creates with the exact backend body and strips everything else", async () => {
    const seal = await issueSession();
    let body: unknown;
    let authorization: string | null = null;
    mswServer.use(
      http.post(CREATE_URL, async ({ request }) => {
        body = await request.json();
        authorization = request.headers.get("authorization");
        return HttpResponse.json(validCreateExerciseResponse, { status: 201 });
      }),
    );

    const response = await create(
      mutationRequest(
        "/api/admin/exercises",
        seal,
        "POST",
        {
          ...fillBlankEditable,
          owner_unit_id: 12,
          id: 77,
          status: "published",
          version: 9,
          stats: { attempts: 5 },
          owner_course_id: 3,
        },
        { origin: APP_ORIGIN, authorization: "Bearer attacker" },
      ),
    );

    expect(response.status).toBe(201);
    expect(body).toEqual({ ...fillBlankEditable, owner_unit_id: 12 });
    expect(authorization).toBe(`Bearer ${contentEditorFixture.token}`);
    for (const stripped of [
      "id",
      "status",
      "version",
      "stats",
      "owner_course_id",
    ]) {
      expect(body).not.toHaveProperty(stripped);
    }
  });

  it("creates a multi-blank question with the answers in template order", async () => {
    const seal = await issueSession();
    let body: unknown;
    mswServer.use(
      http.post(CREATE_URL, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(validCreateExerciseResponse, { status: 201 });
      }),
    );

    const response = await create(
      mutationRequest(
        "/api/admin/exercises",
        seal,
        "POST",
        {
          ...fillBlankEditable,
          content: {
            template: "{{0}} ve {{1}} birlikte kullanılır.",
            choices: ["Töre", "Kut"],
          },
          answer_key: { blanks: ["Kut", "Töre"] },
          owner_unit_id: 12,
        },
        { origin: APP_ORIGIN },
      ),
    );

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ answer_key: { blanks: ["Kut", "Töre"] } });
  });

  it("forwards a free-answer body whose choices are empty, as the backend allows", async () => {
    const seal = await issueSession();
    let body: unknown;
    mswServer.use(
      http.post(CREATE_URL, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(validCreateExerciseResponse, { status: 201 });
      }),
    );

    const response = await create(
      mutationRequest(
        "/api/admin/exercises",
        seal,
        "POST",
        {
          ...fillBlankEditable,
          content: { template: "Başkent {{0}} şehridir.", choices: [] },
          answer_key: { blanks: ["Karabalgasun"] },
          owner_unit_id: 12,
        },
        { origin: APP_ORIGIN },
      ),
    );

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      content: { template: "Başkent {{0}} şehridir.", choices: [] },
      answer_key: { blanks: ["Karabalgasun"] },
    });
  });

  it("updates without forwarding ownership, status or version and returns the warning", async () => {
    const seal = await issueSession();
    let body: unknown;
    mswServer.use(
      http.patch(DETAIL_URL, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(validUpdateExerciseResponse);
      }),
    );

    const response = await update(
      mutationRequest("/api/admin/exercises/3", seal, "PATCH", {
        ...fillBlankEditable,
        answer_key: { blanks: ["Kurultay"] },
        owner_unit_id: 999,
        status: "archived",
        version: 3,
        id: 3,
      }),
      { params: Promise.resolve({ exerciseId: "3" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ...fillBlankEditable,
      answer_key: { blanks: ["Kurultay"] },
    });
    expect(body).not.toHaveProperty("owner_unit_id");
    expect(body).not.toHaveProperty("status");
    expect(body).not.toHaveProperty("version");
    expect(body).not.toHaveProperty("id");
    expect(payload.data.version).toBe(4);
    expect(payload.data.warning).toContain("Cevap anahtarı değişti");
  });

  it.each([
    [
      "a template with no placeholder",
      {
        content: { template: "Düz metin.", choices: [] },
        answer_key: { blanks: ["A"] },
      },
    ],
    [
      "more placeholders than answers",
      {
        content: { template: "{{0}} ve {{1}}", choices: [] },
        answer_key: { blanks: ["A"] },
      },
    ],
    [
      "more answers than placeholders",
      {
        content: { template: "{{0}}", choices: [] },
        answer_key: { blanks: ["A", "B"] },
      },
    ],
    [
      "an answer outside a non-empty choice list",
      {
        content: { template: "{{0}}", choices: ["A", "B"] },
        answer_key: { blanks: ["Z"] },
      },
    ],
    ["an empty answer list", { answer_key: { blanks: [] } }],
    [
      "a blank template",
      {
        content: { template: "   ", choices: [] },
        answer_key: { blanks: ["A"] },
      },
    ],
  ])("rejects %s with 400 and zero backend calls", async (_label, change) => {
    const seal = await issueSession();
    const seen = vi.fn();
    mswServer.use(http.post(CREATE_URL, seen), http.patch(DETAIL_URL, seen));

    const created = await create(
      mutationRequest(
        "/api/admin/exercises",
        seal,
        "POST",
        { ...fillBlankEditable, ...change, owner_unit_id: 12 },
        { origin: APP_ORIGIN },
      ),
    );
    const updated = await update(
      mutationRequest("/api/admin/exercises/3", seal, "PATCH", {
        ...fillBlankEditable,
        ...change,
      }),
      { params: Promise.resolve({ exerciseId: "3" }) },
    );

    expect(created.status).toBe(400);
    expect(updated.status).toBe(400);
    expect(seen).not.toHaveBeenCalled();
  });

  it("blocks a fill blank mutation for edit_content=false before the backend", async () => {
    const seal = await issueSession(contentReviewerFixture);
    const seen = vi.fn();
    mswServer.use(http.post(CREATE_URL, seen), http.patch(DETAIL_URL, seen));

    const created = await create(
      mutationRequest(
        "/api/admin/exercises",
        seal,
        "POST",
        { ...fillBlankEditable, owner_unit_id: 12 },
        { origin: APP_ORIGIN },
      ),
    );

    expect(created.status).toBe(403);
    expect(seen).not.toHaveBeenCalled();
    expect(setCookieHeader(created)).toBeUndefined();
  });

  it("rejects a missing Origin on a fill blank create with zero backend calls", async () => {
    const seal = await issueSession();
    const seen = vi.fn();
    mswServer.use(http.post(CREATE_URL, seen));

    const response = await create(
      mutationRequest(
        "/api/admin/exercises",
        seal,
        "POST",
        { ...fillBlankEditable, owner_unit_id: 12 },
        {},
      ),
    );

    expect(response.status).toBe(403);
    expect(seen).not.toHaveBeenCalled();
  });

  it("reads a stored fill blank detail, including one with no choices", async () => {
    const seal = await issueSession();
    mswServer.use(
      http.get(DETAIL_URL, () =>
        HttpResponse.json(validFillBlankDetailResponse),
      ),
    );
    const withChoices = await detail(
      resourceRequest("/api/admin/exercises/3", seal),
      { params: Promise.resolve({ exerciseId: "3" }) },
    );
    const withChoicesBody = await withChoices.json();

    expect(withChoices.status).toBe(200);
    expect(withChoicesBody.data.content.choices).toEqual([
      "Töre",
      "Kurultay",
      "Toy",
      "Yuğ",
    ]);
    expect(withChoicesBody.data.answer_key).toEqual({ blanks: ["Töre"] });

    mswServer.resetHandlers();
    mswServer.use(
      http.get(DETAIL_URL, () =>
        HttpResponse.json({
          ...validFillBlankDetailResponse,
          data: {
            ...validFillBlankDetailResponse.data,
            content: { template: "Başkent {{0}} şehridir." },
            answer_key: { blanks: ["Karabalgasun"] },
          },
        }),
      ),
    );
    const freeAnswer = await detail(
      resourceRequest("/api/admin/exercises/4", seal),
      { params: Promise.resolve({ exerciseId: "4" }) },
    );

    expect(freeAnswer.status).toBe(200);
    expect((await freeAnswer.json()).data.content.template).toBe(
      "Başkent {{0}} şehridir.",
    );
  });

  it("surfaces backend schema errors for a body it could not pre-empt", async () => {
    const seal = await issueSession();
    mswServer.use(
      http.post(CREATE_URL, () =>
        HttpResponse.json(
          {
            error: {
              code: "INVALID_EXERCISE_CONTENT",
              message: "Soru içeriği geçersiz.",
              details: {
                schema_errors: [
                  "Şablon en az bir boşluk içermeli: {{0}}",
                  "Cevap listesi boş olamaz.",
                ],
              },
            },
          },
          { status: 422 },
        ),
      ),
    );

    const response = await create(
      mutationRequest(
        "/api/admin/exercises",
        seal,
        "POST",
        { ...fillBlankEditable, owner_unit_id: 12 },
        { origin: APP_ORIGIN },
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error.code).toBe("INVALID_EXERCISE_CONTENT");
    expect(payload.error.details.schema_errors).toContain(
      "Cevap listesi boş olamaz.",
    );
  });
});

const numericEditable = {
  type: "numeric_input",
  topic_id: 1,
  difficulty: 3,
  content: { stem: "Sıfırıncı yıl hangisidir?" },
  answer_key: { value: 0, tolerance: 0 },
  explanation: null,
  applicable_scopes: ["tyt"],
};

const flashcardEditable = {
  type: "flashcard",
  topic_id: 1,
  difficulty: 2,
  content: { front: "Kut", back: "Yönetme yetkisi inancı." },
  answer_key: { self_assessed: true },
  explanation: null,
  applicable_scopes: ["tyt"],
};

describe("numeric input mutations through the real BFF chain", () => {
  it("creates with a JSON zero answer and strips everything else", async () => {
    const seal = await issueSession();
    let raw = "";
    let body: unknown;
    let authorization: string | null = null;
    mswServer.use(
      http.post(CREATE_URL, async ({ request }) => {
        raw = await request.text();
        body = JSON.parse(raw);
        authorization = request.headers.get("authorization");
        return HttpResponse.json(validCreateExerciseResponse, { status: 201 });
      }),
    );

    const response = await create(
      mutationRequest(
        "/api/admin/exercises",
        seal,
        "POST",
        {
          ...numericEditable,
          owner_unit_id: 12,
          id: 77,
          status: "published",
          version: 9,
          stats: { attempts: 3 },
          owner_course_id: 4,
        },
        { origin: APP_ORIGIN, authorization: "Bearer attacker" },
      ),
    );

    expect(response.status).toBe(201);
    expect(body).toEqual({ ...numericEditable, owner_unit_id: 12 });
    // The wire format itself, not just the parsed object.
    expect(raw).toContain('"value":0');
    expect(raw).toContain('"tolerance":0');
    expect(raw).not.toContain('"0"');
    expect(authorization).toBe(`Bearer ${contentEditorFixture.token}`);
    for (const stripped of [
      "id",
      "status",
      "version",
      "stats",
      "owner_course_id",
    ]) {
      expect(body).not.toHaveProperty(stripped);
    }
  });

  it("forwards negative, decimal and suffixed numeric questions unchanged", async () => {
    const seal = await issueSession();
    let body: unknown;
    mswServer.use(
      http.post(CREATE_URL, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(validCreateExerciseResponse, { status: 201 });
      }),
    );

    const response = await create(
      mutationRequest(
        "/api/admin/exercises",
        seal,
        "POST",
        {
          ...numericEditable,
          content: { stem: "Kaç derece?", suffix: "derece" },
          answer_key: { value: -2.5, tolerance: 0.01 },
          owner_unit_id: 12,
        },
        { origin: APP_ORIGIN },
      ),
    );

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      content: { stem: "Kaç derece?", suffix: "derece" },
      answer_key: { value: -2.5, tolerance: 0.01 },
    });
  });

  it("updates without forwarding ownership, status or version", async () => {
    const seal = await issueSession();
    let body: unknown;
    mswServer.use(
      http.patch(DETAIL_URL, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(validUpdateExerciseResponse);
      }),
    );

    const response = await update(
      mutationRequest("/api/admin/exercises/4", seal, "PATCH", {
        ...numericEditable,
        answer_key: { value: 0.33, tolerance: 0.01 },
        owner_unit_id: 999,
        status: "archived",
        version: 3,
        id: 4,
      }),
      { params: Promise.resolve({ exerciseId: "4" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ...numericEditable,
      answer_key: { value: 0.33, tolerance: 0.01 },
    });
    for (const stripped of ["owner_unit_id", "status", "version", "id"]) {
      expect(body).not.toHaveProperty(stripped);
    }
    expect(payload.data.version).toBe(4);
  });

  it.each([
    ['a string value "0"', { value: "0", tolerance: 0 }],
    ['a string value "375"', { value: "375", tolerance: 0 }],
    ['a string tolerance "0"', { value: 375, tolerance: "0" }],
    ["a negative tolerance", { value: 375, tolerance: -1 }],
    ["a null value", { value: null, tolerance: 0 }],
    ["a missing value", { tolerance: 0 }],
    ["a missing tolerance", { value: 375 }],
  ])(
    "rejects %s with 400 and zero backend calls",
    async (_label, answerKey) => {
      const seal = await issueSession();
      const seen = vi.fn();
      mswServer.use(http.post(CREATE_URL, seen), http.patch(DETAIL_URL, seen));

      const created = await create(
        mutationRequest(
          "/api/admin/exercises",
          seal,
          "POST",
          { ...numericEditable, answer_key: answerKey, owner_unit_id: 12 },
          { origin: APP_ORIGIN },
        ),
      );
      const updated = await update(
        mutationRequest("/api/admin/exercises/4", seal, "PATCH", {
          ...numericEditable,
          answer_key: answerKey,
        }),
        { params: Promise.resolve({ exerciseId: "4" }) },
      );

      expect(created.status).toBe(400);
      expect(updated.status).toBe(400);
      expect(seen).not.toHaveBeenCalled();
    },
  );

  it("reads a stored numeric detail, including a zero answer", async () => {
    const seal = await issueSession();
    mswServer.use(
      http.get(DETAIL_URL, () =>
        HttpResponse.json(validNumericInputDetailResponse),
      ),
    );

    const response = await detail(
      resourceRequest("/api/admin/exercises/4", seal),
      { params: Promise.resolve({ exerciseId: "4" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.answer_key).toEqual({ value: 0, tolerance: 0 });
    expect(payload.data.content.suffix).toBe("yılı");
  });
});

describe("flashcard mutations through the real BFF chain", () => {
  it("creates with the canonical answer key, ignoring what the browser sent", async () => {
    const seal = await issueSession();
    let body: unknown;
    mswServer.use(
      http.post(CREATE_URL, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(validCreateExerciseResponse, { status: 201 });
      }),
    );

    const response = await create(
      mutationRequest(
        "/api/admin/exercises",
        seal,
        "POST",
        {
          ...flashcardEditable,
          // A crafted answer key must not reach the backend.
          answer_key: { self_assessed: false, admin: true, other: "x" },
          owner_unit_id: 12,
          id: 9,
          status: "published",
          version: 4,
          stats: {},
        },
        { origin: APP_ORIGIN },
      ),
    );

    expect(response.status).toBe(201);
    expect(body).toEqual({ ...flashcardEditable, owner_unit_id: 12 });
    expect(body).toMatchObject({ answer_key: { self_assessed: true } });
    for (const stripped of ["id", "status", "version", "stats"]) {
      expect(body).not.toHaveProperty(stripped);
    }
  });

  it("updates without forwarding ownership, status or version", async () => {
    const seal = await issueSession();
    let body: unknown;
    mswServer.use(
      http.patch(DETAIL_URL, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(validUpdateExerciseResponse);
      }),
    );

    const response = await update(
      mutationRequest("/api/admin/exercises/5", seal, "PATCH", {
        ...flashcardEditable,
        content: { front: "Kut (kavram)", back: "Tanım" },
        owner_unit_id: 999,
        status: "archived",
        version: 7,
        id: 5,
      }),
      { params: Promise.resolve({ exerciseId: "5" }) },
    );

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ...flashcardEditable,
      content: { front: "Kut (kavram)", back: "Tanım" },
    });
    for (const stripped of ["owner_unit_id", "status", "version", "id"]) {
      expect(body).not.toHaveProperty(stripped);
    }
  });

  it("reads a stored card whose answer key has no self_assessed", async () => {
    const seal = await issueSession();
    mswServer.use(
      http.get(DETAIL_URL, () =>
        HttpResponse.json({
          ...validFlashcardDetailResponse,
          data: { ...validFlashcardDetailResponse.data, answer_key: {} },
        }),
      ),
    );

    const response = await detail(
      resourceRequest("/api/admin/exercises/5", seal),
      { params: Promise.resolve({ exerciseId: "5" }) },
    );

    expect(response.status).toBe(200);
    expect((await response.json()).data.content.front).toBe("Kut");
  });
});

describe("the five unsupported types stay unmutable", () => {
  it.each([
    ["matching"],
    ["ordering"],
    ["word_order"],
    ["image_hotspot"],
    ["diagram_label"],
  ])("rejects a %s mutation with 400 and zero backend calls", async (type) => {
    const seal = await issueSession();
    const seen = vi.fn();
    mswServer.use(http.post(CREATE_URL, seen), http.patch(DETAIL_URL, seen));

    const created = await create(
      mutationRequest(
        "/api/admin/exercises",
        seal,
        "POST",
        { ...flashcardEditable, type, owner_unit_id: 12 },
        { origin: APP_ORIGIN },
      ),
    );
    const updated = await update(
      mutationRequest("/api/admin/exercises/5", seal, "PATCH", {
        ...flashcardEditable,
        type,
      }),
      { params: Promise.resolve({ exerciseId: "5" }) },
    );

    expect(created.status).toBe(400);
    expect(updated.status).toBe(400);
    expect(seen).not.toHaveBeenCalled();
  });

  it.each([
    ["numeric_input", numericEditable],
    ["flashcard", flashcardEditable],
  ])(
    "keeps the %s guards: wrong Origin and edit_content=false both stop before the backend",
    async (_label, editable) => {
      const seen = vi.fn();

      const editorSeal = await issueSession();
      mswServer.use(http.post(CREATE_URL, seen));
      const wrongOrigin = await create(
        mutationRequest(
          "/api/admin/exercises",
          editorSeal,
          "POST",
          { ...editable, owner_unit_id: 12 },
          { origin: "https://evil.test" },
        ),
      );
      expect(wrongOrigin.status).toBe(403);

      const reviewerSeal = await issueSession(contentReviewerFixture);
      const forbidden = await create(
        mutationRequest(
          "/api/admin/exercises",
          reviewerSeal,
          "POST",
          { ...editable, owner_unit_id: 12 },
          { origin: APP_ORIGIN },
        ),
      );
      expect(forbidden.status).toBe(403);
      expect(setCookieHeader(forbidden)).toBeUndefined();
      expect(seen).not.toHaveBeenCalled();
    },
  );
});
