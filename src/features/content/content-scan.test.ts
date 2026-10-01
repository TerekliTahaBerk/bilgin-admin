import { describe, expect, it, vi } from "vitest";

import type {
  Course,
  Unit,
  UnitExercisesData,
} from "@/contracts/admin/content";
import {
  CONTENT_SCAN_CONCURRENCY,
  retryTargetFor,
  runContentScan,
  scanCompletion,
  type ContentScanDependencies,
  type ContentScanProgress,
} from "@/features/content/content-scan";
import type { ApiError } from "@/lib/api/error";
import {
  qualityCourse,
  qualityExercise,
  qualityUnit,
  qualityUnitExercises,
} from "@/test/fixtures/quality";

function apiError(
  kind: ApiError["kind"],
  extra: Partial<ApiError> = {},
): ApiError {
  return { kind, status: null, message: `${kind} hatası`, ...extra };
}

const courses: Course[] = [
  qualityCourse(1, { unit_count: 2 }),
  qualityCourse(2, { unit_count: 1 }),
];
const unitsByCourse: Record<number, Unit[]> = {
  1: [
    qualityUnit(10, { title: "A", exercise_count: 2 }),
    // Reports no exercises, but a full scan still reads it.
    qualityUnit(11, { title: "B", exercise_count: 0 }),
  ],
  2: [qualityUnit(20, { title: "C", exercise_count: 1 })],
};
const listsByUnit: Record<number, UnitExercisesData> = {
  10: qualityUnitExercises(10, [qualityExercise(100), qualityExercise(101)]),
  11: qualityUnitExercises(11, [qualityExercise(110)]),
  20: qualityUnitExercises(20, [qualityExercise(200)]),
};

function deps(overrides: Partial<ContentScanDependencies> = {}) {
  const progress: ContentScanProgress[] = [];
  const all: ContentScanDependencies = {
    loadCourses: vi.fn(async () => courses),
    loadUnits: vi.fn(async (courseId: number) => unitsByCourse[courseId]!),
    loadExercises: vi.fn(async (unitId: number) => listsByUnit[unitId]!),
    onProgress: (event) => progress.push(event),
    concurrency: 1,
    ...overrides,
  };

  return { deps: all, progress };
}

describe("runContentScan — full scan", () => {
  it("reads courses, then every course's units, then every unit's exercises", async () => {
    const { deps: d } = deps();

    const result = await runContentScan({ courses: "all", units: [] }, d);

    expect(result.status).toBe("completed");
    expect(result.courses).toEqual(courses);
    expect(result.unitLists).toEqual([
      { courseId: 1, units: unitsByCourse[1] },
      { courseId: 2, units: unitsByCourse[2] },
    ]);
    expect(result.exerciseLists).toEqual([
      { courseId: 1, unitId: 10, data: listsByUnit[10] },
      { courseId: 1, unitId: 11, data: listsByUnit[11] },
      { courseId: 2, unitId: 20, data: listsByUnit[20] },
    ]);
    expect(result.failures).toEqual([]);
    expect(d.loadCourses).toHaveBeenCalledTimes(1);
    expect(d.loadExercises).toHaveBeenCalledTimes(3);
  });

  it("reports progress through every phase with known and estimated totals", async () => {
    const { deps: d, progress } = deps();

    await runContentScan({ courses: "all", units: [] }, d);

    expect(progress).toEqual([
      {
        phase: "courses",
        courses: { total: null, scanned: 0 },
        units: { total: null, scanned: 0 },
        exercises: 0,
        failed: 0,
      },
      // Unit total estimated from the backend's unit_count (2 + 1).
      {
        phase: "units",
        courses: { total: 2, scanned: 0 },
        units: { total: 3, scanned: 0 },
        exercises: 0,
        failed: 0,
      },
      {
        phase: "units",
        courses: { total: 2, scanned: 1 },
        units: { total: 3, scanned: 0 },
        exercises: 0,
        failed: 0,
      },
      {
        phase: "units",
        courses: { total: 2, scanned: 2 },
        units: { total: 3, scanned: 0 },
        exercises: 0,
        failed: 0,
      },
      {
        phase: "exercises",
        courses: { total: 2, scanned: 2 },
        units: { total: 3, scanned: 0 },
        exercises: 0,
        failed: 0,
      },
      {
        phase: "exercises",
        courses: { total: 2, scanned: 2 },
        units: { total: 3, scanned: 1 },
        exercises: 2,
        failed: 0,
      },
      {
        phase: "exercises",
        courses: { total: 2, scanned: 2 },
        units: { total: 3, scanned: 2 },
        exercises: 3,
        failed: 0,
      },
      {
        phase: "exercises",
        courses: { total: 2, scanned: 2 },
        units: { total: 3, scanned: 3 },
        exercises: 4,
        failed: 0,
      },
    ]);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const many = Array.from({ length: 20 }, (_, index) =>
      qualityUnit(index + 1),
    );
    const { deps: d } = deps({
      concurrency: undefined,
      loadCourses: async () => [qualityCourse(1, { unit_count: 20 })],
      loadUnits: async () => many,
      loadExercises: async (unitId) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((done) => setTimeout(done, 1));
        inFlight -= 1;
        return qualityUnitExercises(unitId, []);
      },
    });

    await runContentScan({ courses: "all", units: [] }, d);

    expect(CONTENT_SCAN_CONCURRENCY).toBeGreaterThanOrEqual(4);
    expect(CONTENT_SCAN_CONCURRENCY).toBeLessThanOrEqual(6);
    expect(peak).toBe(CONTENT_SCAN_CONCURRENCY);
  });

  it("records a failed course list and reads nothing else", async () => {
    const { deps: d } = deps({
      loadCourses: vi.fn(async () => {
        throw apiError("server");
      }),
    });

    const result = await runContentScan({ courses: "all", units: [] }, d);

    expect(result).toMatchObject({
      status: "completed",
      courses: null,
      failures: [{ kind: "courses", error: apiError("server") }],
    });
    expect(d.loadUnits).not.toHaveBeenCalled();
  });

  it("records failed courses and units with their context and keeps going", async () => {
    const { deps: d, progress } = deps({
      loadUnits: vi.fn(async (courseId: number) => {
        if (courseId === 2) throw apiError("server");
        return unitsByCourse[courseId]!;
      }),
      loadExercises: vi.fn(async (unitId: number) => {
        if (unitId === 11) throw apiError("network");
        return listsByUnit[unitId]!;
      }),
    });

    const result = await runContentScan({ courses: "all", units: [] }, d);

    expect(result.status).toBe("completed");
    expect(result.failures).toEqual([
      { kind: "course", courseId: 2, error: apiError("server") },
      {
        kind: "unit",
        courseId: 1,
        unitId: 11,
        title: "B",
        error: apiError("network"),
      },
    ]);
    expect(result.exerciseLists.map((list) => list.unitId)).toEqual([10]);
    expect(progress.at(-1)?.failed).toBe(2);
  });

  it("treats a list for another unit as a failure, never as data", async () => {
    const { deps: d } = deps({
      loadExercises: vi.fn(async (unitId: number) =>
        unitId === 20 ? listsByUnit[10]! : listsByUnit[unitId]!,
      ),
    });

    const result = await runContentScan({ courses: "all", units: [] }, d);

    expect(result.failures).toEqual([
      {
        kind: "unit",
        courseId: 2,
        unitId: 20,
        title: "C",
        error: expect.objectContaining({ kind: "contract" }),
      },
    ]);
    expect(result.exerciseLists.map((list) => list.unitId)).toEqual([10, 11]);
  });

  it.each(["authentication", "rate_limit"] as const)(
    "halts on %s instead of repeating it",
    async (kind) => {
      const halting = apiError(kind, { retryAfterSeconds: 20 });
      const { deps: d } = deps({
        loadExercises: vi.fn(async () => {
          throw halting;
        }),
      });

      const result = await runContentScan({ courses: "all", units: [] }, d);

      expect(result).toMatchObject({
        status: "halted",
        failures: [],
        haltError: halting,
      });
      expect(d.loadExercises).toHaveBeenCalledTimes(1);
    },
  );

  it("halts in the course phase without reading units", async () => {
    const { deps: d } = deps({
      loadCourses: vi.fn(async () => {
        throw apiError("authentication");
      }),
    });

    const result = await runContentScan({ courses: "all", units: [] }, d);

    expect(result.status).toBe("halted");
    expect(d.loadUnits).not.toHaveBeenCalled();
  });
});

describe("runContentScan — cancellation", () => {
  it("stops scheduling once the signal aborts and reports nothing as failed", async () => {
    const abort = new AbortController();
    const { deps: d } = deps({
      signal: abort.signal,
      loadExercises: vi.fn(async () => {
        abort.abort();
        throw new DOMException("Aborted", "AbortError");
      }),
    });

    const result = await runContentScan({ courses: "all", units: [] }, d);

    expect(result.status).toBe("cancelled");
    expect(result.failures).toEqual([]);
    expect(d.loadExercises).toHaveBeenCalledTimes(1);
  });

  it("does nothing beyond the course list when aborted during it", async () => {
    const abort = new AbortController();
    const { deps: d } = deps({
      signal: abort.signal,
      loadCourses: vi.fn(async () => {
        abort.abort();
        return courses;
      }),
    });

    const result = await runContentScan({ courses: "all", units: [] }, d);

    expect(result.status).toBe("cancelled");
    expect(d.loadUnits).not.toHaveBeenCalled();
  });
});

describe("runContentScan — targeted", () => {
  it("lists only the given courses and never the course list", async () => {
    const { deps: d, progress } = deps();

    const result = await runContentScan({ courses: [2], units: [] }, d);

    expect(d.loadCourses).not.toHaveBeenCalled();
    expect(result.courses).toBeNull();
    expect(result.exerciseLists.map((list) => list.unitId)).toEqual([20]);
    // Without course metadata the unit total is unknown until listed.
    expect(progress[0]).toMatchObject({
      phase: "units",
      courses: { total: 1, scanned: 0 },
      units: { total: null },
    });
  });

  it("reads given units directly and once, even when also listed", async () => {
    const { deps: d } = deps();

    await runContentScan(
      { courses: [1], units: [{ courseId: 1, unitId: 10, title: "A" }] },
      d,
    );

    expect(
      (d.loadExercises as ReturnType<typeof vi.fn>).mock.calls.map(
        ([id]) => id,
      ),
    ).toEqual([10, 11]);
  });

  it("can skip units the backend reports as empty", async () => {
    const { deps: d } = deps({ skipEmptyUnits: true });

    await runContentScan({ courses: [1], units: [] }, d);

    expect(d.loadExercises).toHaveBeenCalledTimes(1);
    expect(d.loadExercises).toHaveBeenCalledWith(10);
  });
});

describe("retryTargetFor", () => {
  it("retries the whole scan when the course list failed", () => {
    expect(
      retryTargetFor([
        { kind: "courses", error: apiError("server") },
        { kind: "course", courseId: 2, error: apiError("server") },
      ]),
    ).toEqual({ courses: "all", units: [] });
  });

  it("retries failed courses whole and failed units alone", () => {
    expect(
      retryTargetFor([
        { kind: "course", courseId: 2, error: apiError("server") },
        {
          kind: "unit",
          courseId: 1,
          unitId: 11,
          title: "B",
          error: apiError("network"),
        },
      ]),
    ).toEqual({
      courses: [2],
      units: [{ courseId: 1, unitId: 11, title: "B" }],
    });
  });
});

describe("scanCompletion", () => {
  const progress = (
    overrides: Partial<ContentScanProgress>,
  ): ContentScanProgress => ({
    phase: "exercises",
    courses: { total: 2, scanned: 2 },
    units: { total: 4, scanned: 1 },
    exercises: 0,
    failed: 0,
    ...overrides,
  });

  it("counts the course list, unit lists and exercise lists", () => {
    // 1 + 2 + 1 done of 1 + 2 + 4.
    expect(scanCompletion(progress({}), true)).toBeCloseTo(4 / 7);
    // A targeted run has no course list to read: 2 + 1 of 2 + 4.
    expect(scanCompletion(progress({}), false)).toBeCloseTo(3 / 6);
  });

  it("is zero while reading the course list and unknown without totals", () => {
    expect(
      scanCompletion(
        progress({ phase: "courses", courses: { total: null, scanned: 0 } }),
        true,
      ),
    ).toBe(0);
    expect(
      scanCompletion(
        progress({ phase: "units", units: { total: null, scanned: 0 } }),
        false,
      ),
    ).toBeNull();
  });

  it("is complete for an empty catalogue", () => {
    expect(
      scanCompletion(
        progress({
          courses: { total: 0, scanned: 0 },
          units: { total: 0, scanned: 0 },
        }),
        false,
      ),
    ).toBe(1);
  });
});
