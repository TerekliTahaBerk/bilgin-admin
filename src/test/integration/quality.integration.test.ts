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
import {
  buildQualityRows,
  summarizeQuality,
} from "@/features/analytics/quality-dataset";
import { applyQualityFilters } from "@/features/analytics/quality-filters";
import { toApiError } from "@/lib/api/error";
import { shouldHaltBatch } from "@/lib/api/retry-policy";
import { contentReviewerFixture } from "@/test/fixtures/admin-roles";
import { validCoursesResponse } from "@/test/fixtures/courses-api";
import { validUnitExercisesResponse } from "@/test/fixtures/exercises-api";
import { mswServer } from "@/test/integration/msw-server";
import {
  BACKEND_LOGIN_URL,
  BACKEND_ORIGIN,
  loginRequest,
  resourceRequest,
  sealFromResponse,
} from "@/test/integration/support";

/*
 | The Quality Center has no route of its own: it reads the three existing
 | `/admin/v1` list endpoints through their existing BFF handlers. This suite
 | runs that exact chain against a faked Laravel origin and feeds the BFF
 | payloads into the Quality Center's own model, so a contract drift on any
 | hop fails here.
 */

const COURSE_ID = 1;
const UNIT_ID = 12;

const backendUnits = {
  data: [
    {
      id: UNIT_ID,
      title: "İlk ve Orta Çağlarda Türk Dünyası",
      sort_order: 1,
      grade_level: 9,
      status: "published",
      access: "free",
      node_count: 6,
      exercise_count: 5,
    },
  ],
  meta: { server_time: "2026-09-16T19:05:20+00:00" },
};

/** A reviewer: `edit_content: false`, so this also proves no edit ability is needed. */
async function issueReviewerSession(): Promise<string> {
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

describe("Quality Center data chain through the existing BFF", () => {
  it("reads courses → units → unfiltered exercises and keeps the backend's needs_review", async () => {
    const seal = await issueReviewerSession();
    const exerciseQueries: string[] = [];

    mswServer.use(
      http.get(`${BACKEND_ORIGIN}/api/admin/v1/courses`, () =>
        HttpResponse.json(validCoursesResponse),
      ),
      http.get(`${BACKEND_ORIGIN}/api/admin/v1/courses/:courseId/units`, () =>
        HttpResponse.json(backendUnits),
      ),
      http.get(
        `${BACKEND_ORIGIN}/api/admin/v1/units/:unitId/exercises`,
        ({ request }) => {
          exerciseQueries.push(new URL(request.url).search);
          return HttpResponse.json(validUnitExercisesResponse);
        },
      ),
    );

    const coursesBody = await (
      await courses(resourceRequest("/api/admin/courses", seal))
    ).json();
    const unitsBody = await (
      await units(
        resourceRequest(`/api/admin/courses/${COURSE_ID}/units`, seal),
        { params: Promise.resolve({ courseId: String(COURSE_ID) }) },
      )
    ).json();
    const exercisesBody = await (
      await exercises(
        resourceRequest(`/api/admin/units/${UNIT_ID}/exercises`, seal),
        { params: Promise.resolve({ unitId: String(UNIT_ID) }) },
      )
    ).json();

    // The scan always asks for the whole unit: no type/status filter.
    expect(exerciseQueries).toEqual([""]);

    const courseList = coursesResponseSchema
      .pick({ data: true })
      .parse(coursesBody).data;
    const unitList = unitsResponseSchema
      .pick({ data: true })
      .parse(unitsBody).data;
    const unitExercises = unitExercisesResponseSchema
      .pick({ data: true })
      .parse(exercisesBody).data;

    const rows = buildQualityRows(
      courseList,
      unitList.map((unit) => ({ courseId: COURSE_ID, unit })),
      [{ unitId: UNIT_ID, data: unitExercises }],
    );

    expect(rows).toHaveLength(validUnitExercisesResponse.data.exercises.length);
    expect(rows.every((row) => row.course.name === "TYT Türkçe")).toBe(true);

    // Exactly the rows the backend flagged — nothing recomputed.
    const backendFlagged = validUnitExercisesResponse.data.exercises
      .filter((exercise) => exercise.stats.needs_review)
      .map((exercise) => exercise.id);
    expect(
      applyQualityFilters(rows, { needsReview: true }).map((row) => row.id),
    ).toEqual(backendFlagged);

    const summary = summarizeQuality(rows);
    expect(summary.needsReview).toBe(backendFlagged.length);
    // The unattempted exercise keeps a null rate end to end.
    expect(rows.find((row) => row.id === 1)?.stats.correct_rate).toBeNull();
    expect(summary.unsolved).toBe(1);
  });

  it("forwards a backend 429 as a rate-limit error the scan can halt on", async () => {
    const seal = await issueReviewerSession();

    mswServer.use(
      http.get(`${BACKEND_ORIGIN}/api/admin/v1/units/:unitId/exercises`, () =>
        HttpResponse.json(
          { message: "Too Many Attempts." },
          { status: 429, headers: { "Retry-After": "30" } },
        ),
      ),
    );

    const response = await exercises(
      resourceRequest(`/api/admin/units/${UNIT_ID}/exercises`, seal),
      { params: Promise.resolve({ unitId: String(UNIT_ID) }) },
    );
    const body = (await response.json()) as { error: unknown };
    const error = toApiError(body.error);

    expect(response.status).toBe(429);
    expect(error.kind).toBe("rate_limit");
    expect(shouldHaltBatch(error)).toBe(true);
  });
});
