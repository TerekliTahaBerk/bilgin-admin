import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { POST as importContent } from "@/app/api/admin/content/import/route";
import {
  GET as admins,
  POST as createAdmin,
} from "@/app/api/admin/admins/route";
import { PATCH as updateAdmin } from "@/app/api/admin/admins/[adminId]/route";
import { GET as curriculumOptions } from "@/app/api/admin/curriculum/options/route";
import {
  GET as curriculumMapping,
  PUT as updateCurriculum,
} from "@/app/api/admin/exam-variants/[variantId]/courses/route";
import { DELETE as archiveExercise } from "@/app/api/admin/exercises/[exerciseId]/route";
import { GET as unitTemplates } from "@/app/api/admin/unit-templates/route";
import { POST as createUnit } from "@/app/api/admin/units/route";
import { POST as login } from "@/app/api/session/login/route";
import {
  contentEditorFixture,
  contentReviewerFixture,
  superAdminFixture,
  type AdminRoleFixture,
} from "@/test/fixtures/admin-roles";
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

const meta = { server_time: "2026-09-20T15:00:00+00:00" };
const pkg = {
  course: "tyt_tarih",
  subject: "tarih",
  unit: { title: "Tarih", template: "standard" },
  topics: [{ code: "tarih" }],
  exercises: [{ type: "multiple_choice", answer_key: { option: "a" } }],
};

async function issueSession(fixture: AdminRoleFixture) {
  mswServer.use(
    http.post(BACKEND_LOGIN_URL, () =>
      HttpResponse.json(fixture.loginResponse),
    ),
  );
  const response = await login(
    loginRequest({
      email: fixture.loginResponse.data.admin.email,
      password: "test-password",
    }),
  );
  const seal = sealFromResponse(response);
  mswServer.resetHandlers();
  return seal;
}

describe("remaining workflow BFF routes", () => {
  it("imports the complete package at the exact endpoint without leaking browser headers", async () => {
    const seal = await issueSession(contentEditorFixture);
    let requestBody: unknown;
    let authorization: string | null = null;
    let incomingOrigin: string | null = null;
    mswServer.use(
      http.post(
        `${BACKEND_ORIGIN}/api/admin/v1/content/import`,
        async ({ request }) => {
          requestBody = await request.json();
          authorization = request.headers.get("authorization");
          incomingOrigin = request.headers.get("origin");
          return HttpResponse.json(
            {
              data: {
                unit_id: 41,
                unit_title: "Tarih",
                topics: 1,
                nodes: 6,
                exercises: 1,
              },
              meta,
            },
            { status: 201 },
          );
        },
      ),
    );
    const response = await importContent(
      mutationRequest("/api/admin/content/import", seal, "POST", pkg, {
        origin: APP_ORIGIN,
        authorization: "Bearer browser-token",
      }),
    );

    expect(response.status).toBe(201);
    expect(requestBody).toEqual(pkg);
    expect(authorization).toBe(`Bearer ${contentEditorFixture.token}`);
    expect(incomingOrigin).toBeNull();
  });

  it("rejects bad Origin and missing edit ability before import reaches the backend", async () => {
    const editorSeal = await issueSession(contentEditorFixture);
    const reviewerSeal = await issueSession(contentReviewerFixture);
    const seen = vi.fn();
    mswServer.use(
      http.post(`${BACKEND_ORIGIN}/api/admin/v1/content/import`, () => {
        seen();
        return HttpResponse.json({});
      }),
    );

    expect(
      (
        await importContent(
          mutationRequest(
            "/api/admin/content/import",
            editorSeal,
            "POST",
            pkg,
            { origin: "https://evil.test" },
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await importContent(
          mutationRequest(
            "/api/admin/content/import",
            reviewerSeal,
            "POST",
            pkg,
          ),
        )
      ).status,
    ).toBe(403);
    expect(seen).not.toHaveBeenCalled();
  });

  it("uses explicit template/create/archive endpoints and preserves a backend 403 session", async () => {
    const seal = await issueSession(contentEditorFixture);
    const seen: string[] = [];
    mswServer.use(
      http.get(
        `${BACKEND_ORIGIN}/api/admin/v1/unit-templates`,
        ({ request }) => {
          seen.push(`${request.method} ${new URL(request.url).pathname}`);
          return HttpResponse.json({ data: [], meta });
        },
      ),
      http.post(`${BACKEND_ORIGIN}/api/admin/v1/units`, ({ request }) => {
        seen.push(`${request.method} ${new URL(request.url).pathname}`);
        return HttpResponse.json(
          {
            error: { code: "TOPIC_MISMATCH", message: "Konu derse ait değil." },
          },
          { status: 422 },
        );
      }),
      http.delete(
        `${BACKEND_ORIGIN}/api/admin/v1/exercises/88`,
        ({ request }) => {
          seen.push(`${request.method} ${new URL(request.url).pathname}`);
          return HttpResponse.json({
            data: { id: 88, status: "archived" },
            meta,
          });
        },
      ),
    );

    expect(
      (await unitTemplates(resourceRequest("/api/admin/unit-templates", seal)))
        .status,
    ).toBe(200);
    const createResponse = await createUnit(
      mutationRequest("/api/admin/units", seal, "POST", {
        course_code: "tyt_tarih",
        template_code: "standard",
        title: "Tarih",
        topic_ids: [3],
      }),
    );
    expect(createResponse.status).toBe(422);
    expect(setCookieHeader(createResponse)).toBeUndefined();
    expect(
      (
        await archiveExercise(
          mutationRequest("/api/admin/exercises/88", seal, "DELETE", undefined),
          { params: Promise.resolve({ exerciseId: "88" }) },
        )
      ).status,
    ).toBe(200);
    expect(seen).toEqual([
      "GET /api/admin/v1/unit-templates",
      "POST /api/admin/v1/units",
      "DELETE /api/admin/v1/exercises/88",
    ]);
  });

  it("discovers source ids and sends curriculum updates as one exact full replacement", async () => {
    const seal = await issueSession(superAdminFixture);
    const rows = [
      {
        course_id: 3,
        exam_section_id: 9,
        sort_order: 1,
        access: "free",
        exam_weight: null,
        is_required: true,
      },
    ];
    let body: unknown;
    mswServer.use(
      http.get(`${BACKEND_ORIGIN}/api/admin/v1/curriculum/options`, () =>
        HttpResponse.json({
          data: {
            variants: [
              {
                id: 7,
                exam_id: 4,
                code: "say",
                name: "Sayısal",
                field_code: "say",
                sort_order: 1,
                is_active: true,
              },
            ],
            sections: [
              { id: 9, exam_id: 4, code: "tyt", name: "TYT", sort_order: 1 },
            ],
          },
          meta,
        }),
      ),
      http.get(`${BACKEND_ORIGIN}/api/admin/v1/exam-variants/7/courses`, () =>
        HttpResponse.json({
          data: { exam_variant: { code: "say", name: "Sayısal" }, courses: [] },
          meta,
        }),
      ),
      http.put(
        `${BACKEND_ORIGIN}/api/admin/v1/exam-variants/7/courses`,
        async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({
            data: { exam_variant: "say", course_count: 1 },
            meta,
          });
        },
      ),
    );

    expect(
      (
        await curriculumOptions(
          resourceRequest("/api/admin/curriculum/options", seal),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await curriculumMapping(
          resourceRequest("/api/admin/exam-variants/7/courses", seal),
          { params: Promise.resolve({ variantId: "7" }) },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await updateCurriculum(
          mutationRequest("/api/admin/exam-variants/7/courses", seal, "PUT", {
            courses: rows,
          }),
          { params: Promise.resolve({ variantId: "7" }) },
        )
      ).status,
    ).toBe(200);
    expect(body).toEqual({ courses: rows });
  });

  it("guards curriculum routes by the ability snapshot", async () => {
    const seal = await issueSession(contentEditorFixture);
    const seen = vi.fn();
    mswServer.use(
      http.get(`${BACKEND_ORIGIN}/api/admin/v1/curriculum/options`, () => {
        seen();
        return HttpResponse.json({});
      }),
    );
    expect(
      (
        await curriculumOptions(
          resourceRequest("/api/admin/curriculum/options", seal),
        )
      ).status,
    ).toBe(403);
    expect(seen).not.toHaveBeenCalled();
  });

  it("creates, lists, and patches admins with the exact allowlisted bodies", async () => {
    const seal = await issueSession(superAdminFixture);
    const adminId = "01a0ab9b-0000-4000-8000-00000000beef";
    const bodies: unknown[] = [];
    mswServer.use(
      http.get(`${BACKEND_ORIGIN}/api/admin/v1/admins`, () =>
        HttpResponse.json({ data: { roles: [], admins: [] }, meta }),
      ),
      http.post(
        `${BACKEND_ORIGIN}/api/admin/v1/admins`,
        async ({ request }) => {
          bodies.push(await request.json());
          return HttpResponse.json(
            {
              data: {
                id: adminId,
                email: "new@bilgin.test",
                role: "content_editor",
              },
              meta,
            },
            { status: 201 },
          );
        },
      ),
      http.patch(
        `${BACKEND_ORIGIN}/api/admin/v1/admins/${adminId}`,
        async ({ request }) => {
          bodies.push(await request.json());
          return HttpResponse.json(
            {
              error: {
                code: "ADMIN_LOCKOUT_PREVENTED",
                message: "Son süper yönetici korunur.",
              },
            },
            { status: 422 },
          );
        },
      ),
    );
    expect(
      (await admins(resourceRequest("/api/admin/admins", seal))).status,
    ).toBe(200);
    expect(
      (
        await createAdmin(
          mutationRequest("/api/admin/admins", seal, "POST", {
            name: "Yeni",
            email: "new@bilgin.test",
            password: "very-safe-pass",
            role: "content_editor",
          }),
        )
      ).status,
    ).toBe(201);
    const patchResponse = await updateAdmin(
      mutationRequest(`/api/admin/admins/${adminId}`, seal, "PATCH", {
        name: "Yeni Ad",
        role: "content_reviewer",
      }),
      { params: Promise.resolve({ adminId }) },
    );
    expect(patchResponse.status).toBe(422);
    expect(bodies).toEqual([
      {
        name: "Yeni",
        email: "new@bilgin.test",
        password: "very-safe-pass",
        role: "content_editor",
      },
      { name: "Yeni Ad", role: "content_reviewer" },
    ]);
  });

  it("clears the session on backend 401 but preserves it on backend 403", async () => {
    const seal = await issueSession(superAdminFixture);
    mswServer.use(
      http.get(`${BACKEND_ORIGIN}/api/admin/v1/admins`, () =>
        HttpResponse.json({ message: "Unauthenticated." }, { status: 401 }),
      ),
    );
    const unauthorized = await admins(
      resourceRequest("/api/admin/admins", seal),
    );
    expect(unauthorized.status).toBe(401);
    expect(setCookieHeader(unauthorized)).toContain("Max-Age=0");

    mswServer.use(
      http.get(`${BACKEND_ORIGIN}/api/admin/v1/admins`, () =>
        HttpResponse.json(
          { error: { code: "FORBIDDEN", message: "Yasak." } },
          { status: 403 },
        ),
      ),
    );
    const forbidden = await admins(resourceRequest("/api/admin/admins", seal));
    expect(forbidden.status).toBe(403);
    expect(setCookieHeader(forbidden)).toBeUndefined();
  });
});
