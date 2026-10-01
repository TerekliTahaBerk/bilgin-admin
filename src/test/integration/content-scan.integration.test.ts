import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { GET as courses } from "@/app/api/admin/courses/route";
import { GET as units } from "@/app/api/admin/courses/[courseId]/units/route";
import { GET as exercises } from "@/app/api/admin/units/[unitId]/exercises/route";
import { POST as login } from "@/app/api/session/login/route";
import {
  coursesResponseSchema,
  unitExercisesResponseSchema,
  unitsResponseSchema,
} from "@/contracts/admin/content";
import { runContentScan } from "@/features/content/content-scan";
import { buildSnapshot } from "@/features/content/content-snapshot";
import type { ApiError } from "@/lib/api/error";
import { contentReviewerFixture } from "@/test/fixtures/admin-roles";
import { mswServer } from "@/test/integration/msw-server";
import {
  BACKEND_LOGIN_URL,
  BACKEND_ORIGIN,
  loginRequest,
  resourceRequest,
  sealFromResponse,
} from "@/test/integration/support";

/*
 | The full scan has no route of its own: it walks the three existing
 | `/admin/v1` list endpoints through their existing BFF handlers. This suite
 | drives the real scan engine through those handlers — session, transport
 | and contract validation included — with only the Laravel origin faked.
 */

const META = { server_time: "2026-10-01T09:00:00+00:00" };

const backendCourses = [
  {
    id: 1,
    code: "tyt_tarih",
    name: "TYT Tarih",
    scope: "tyt",
    status: "published",
    unit_count: 2,
  },
  {
    id: 2,
    code: "ayt_fizik",
    name: "AYT Fizik",
    scope: "ayt",
    status: "draft",
    unit_count: 1,
  },
];

function backendUnit(id: number, title: string) {
  return {
    id,
    title,
    sort_order: id,
    grade_level: null,
    status: "draft",
    access: "free",
    node_count: 1,
    exercise_count: 1,
  };
}

const backendUnits: Record<string, unknown[]> = {
  "1": [backendUnit(10, "İlk Çağ"), backendUnit(11, "Zaman")],
  "2": [backendUnit(20, "Kuvvet")],
};

function backendExercise(id: number, needsReview: boolean) {
  return {
    id,
    type: "multiple_choice",
    topic: { id: 1, name: "Konu" },
    difficulty: 3,
    status: "published",
    version: 1,
    scopes: ["tyt"],
    preview: `Soru ${id}`,
    stats: {
      attempts: needsReview ? 30 : 0,
      correct_rate: needsReview ? 97 : null,
      avg_seconds: needsReview ? 9 : null,
      needs_review: needsReview,
    },
  };
}

async function issueSession(): Promise<string> {
  mswServer.use(
    http.post(BACKEND_LOGIN_URL, () =>
      HttpResponse.json(contentReviewerFixture.loginResponse),
    ),
  );

  const response = await login(
    loginRequest({ email: "denetci@bilgin.test", password: "test-password" }),
  );
  const seal = sealFromResponse(response);

  mswServer.resetHandlers();

  return seal;
}

/** Loaders that go through the BFF route handlers exactly as the browser would. */
function bffLoaders(seal: string) {
  async function read<Data>(
    response: Response,
    parse: (body: unknown) => Data,
  ): Promise<Data> {
    const body = (await response.json()) as { error?: ApiError };

    if (!response.ok) throw body.error;

    return parse(body);
  }

  return {
    loadCourses: async () =>
      read(
        await courses(resourceRequest("/api/admin/courses", seal)),
        (body) => coursesResponseSchema.pick({ data: true }).parse(body).data,
      ),
    loadUnits: async (courseId: number) =>
      read(
        await units(
          resourceRequest(`/api/admin/courses/${courseId}/units`, seal),
          { params: Promise.resolve({ courseId: String(courseId) }) },
        ),
        (body) => unitsResponseSchema.pick({ data: true }).parse(body).data,
      ),
    loadExercises: async (unitId: number) =>
      read(
        await exercises(
          resourceRequest(`/api/admin/units/${unitId}/exercises`, seal),
          { params: Promise.resolve({ unitId: String(unitId) }) },
        ),
        (body) =>
          unitExercisesResponseSchema.pick({ data: true }).parse(body).data,
      ),
  };
}

function backend({ failUnit }: { failUnit?: number } = {}) {
  const exerciseQueries: string[] = [];

  mswServer.use(
    http.get(`${BACKEND_ORIGIN}/api/admin/v1/courses`, () =>
      HttpResponse.json({ data: backendCourses, meta: META }),
    ),
    http.get(
      `${BACKEND_ORIGIN}/api/admin/v1/courses/:courseId/units`,
      ({ params }) =>
        HttpResponse.json({
          data: backendUnits[String(params.courseId)] ?? [],
          meta: META,
        }),
    ),
    http.get(
      `${BACKEND_ORIGIN}/api/admin/v1/units/:unitId/exercises`,
      ({ params, request }) => {
        const unitId = Number(params.unitId);
        exerciseQueries.push(new URL(request.url).search);

        if (unitId === failUnit) {
          return HttpResponse.json(
            { message: "Server Error" },
            { status: 500 },
          );
        }

        return HttpResponse.json({
          data: {
            unit: { id: unitId, title: `Ünite ${unitId}` },
            exercises: [backendExercise(unitId * 10, unitId === 10)],
          },
          meta: META,
        });
      },
    ),
  );

  return { exerciseQueries };
}

describe("full content scan through the existing BFF", () => {
  it("walks courses → units → unfiltered exercises into a complete snapshot", async () => {
    const seal = await issueSession();
    const { exerciseQueries } = backend();

    const result = await runContentScan(
      { courses: "all", units: [] },
      { ...bffLoaders(seal), onProgress: () => {} },
    );
    const snapshot = buildSnapshot(result, "2026-10-01T09:00:00.000Z");

    expect(result.failures).toEqual([]);
    expect(exerciseQueries).toEqual(["", "", ""]);
    expect(snapshot).toMatchObject({
      status: "complete",
      errors: [],
    });
    expect(snapshot?.courses.map((course) => course.name)).toEqual([
      "TYT Tarih",
      "AYT Fizik",
    ]);
    expect(snapshot?.units.map((unit) => [unit.id, unit.courseId])).toEqual([
      [10, 1],
      [11, 1],
      [20, 2],
    ]);
    expect(
      snapshot?.exercises.map((exercise) => [
        exercise.id,
        exercise.unitId,
        exercise.stats.needs_review,
        exercise.stats.correct_rate,
      ]),
    ).toEqual([
      [100, 10, true, 97],
      [110, 11, false, null],
      [200, 20, false, null],
    ]);
  });

  it("reports a unit the backend failed on and keeps the rest", async () => {
    const seal = await issueSession();
    backend({ failUnit: 11 });

    const result = await runContentScan(
      { courses: "all", units: [] },
      { ...bffLoaders(seal), onProgress: () => {} },
    );
    const snapshot = buildSnapshot(result, "2026-10-01T09:00:00.000Z");

    expect(result.failures).toEqual([
      expect.objectContaining({
        kind: "unit",
        courseId: 1,
        unitId: 11,
        title: "Zaman",
        error: expect.objectContaining({ kind: "server" }),
      }),
    ]);
    expect(snapshot?.status).toBe("partial");
    expect(snapshot?.exercises.map((exercise) => exercise.id)).toEqual([
      100, 200,
    ]);
  });
});
