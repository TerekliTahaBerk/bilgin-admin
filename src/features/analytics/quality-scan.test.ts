import { describe, expect, it, vi } from "vitest";

import type { Unit } from "@/contracts/admin/content";
import {
  retryTarget,
  runQualityScan,
  type ScanDependencies,
  type ScanProgress,
} from "@/features/analytics/quality-scan";
import type { ApiError } from "@/lib/api/error";
import { qualityUnit, qualityUnitExercises } from "@/test/fixtures/quality";

function apiError(
  kind: ApiError["kind"],
  extra: Partial<ApiError> = {},
): ApiError {
  return { kind, status: null, message: `${kind} hatası`, ...extra };
}

function scanDeps(overrides: Partial<ScanDependencies> = {}) {
  const progress: ScanProgress[] = [];
  const deps: ScanDependencies = {
    loadUnits: vi.fn(async (): Promise<Unit[]> => []),
    loadExercises: vi.fn(async (unitId: number) =>
      qualityUnitExercises(unitId, []),
    ),
    onProgress: (event) => progress.push(event),
    ...overrides,
  };

  return { deps, progress };
}

/*
 | The engine itself (bounded concurrency, halting, failures, mismatched
 | units) is covered in `content-scan.test.ts`. This suite covers what the
 | Quality Center's adapter adds on top: its scope, its two-phase progress
 | and skipping units the backend reports as empty.
 */
describe("runQualityScan", () => {
  it("lists the scope's courses, then reads each non-empty unit once", async () => {
    const unitsByCourse: Record<number, Unit[]> = {
      1: [
        qualityUnit(10, { exercise_count: 4 }),
        qualityUnit(11, { exercise_count: 0 }),
      ],
      2: [qualityUnit(20, { exercise_count: 1 })],
    };
    const loadExercises = vi.fn(async (unitId: number) =>
      qualityUnitExercises(unitId, []),
    );
    const { deps, progress } = scanDeps({
      loadUnits: vi.fn(async (courseId: number) => unitsByCourse[courseId]!),
      loadExercises,
      concurrency: 1,
    });

    const outcome = await runQualityScan(
      { courseIds: [1, 2], units: [] },
      deps,
    );

    expect(outcome).toEqual({
      status: "completed",
      failures: [],
      haltError: null,
    });
    // Unit 11 has no exercises according to the backend: never requested.
    expect(loadExercises.mock.calls.map(([id]) => id)).toEqual([10, 20]);
    expect(progress).toEqual([
      { phase: "units", completed: 0, total: 2 },
      { phase: "units", completed: 1, total: 2 },
      { phase: "units", completed: 2, total: 2 },
      { phase: "exercises", completed: 0, total: 2 },
      { phase: "exercises", completed: 1, total: 2 },
      { phase: "exercises", completed: 2, total: 2 },
    ]);
  });

  it("reads single units without listing any course or reporting a units phase", async () => {
    const { deps, progress } = scanDeps();

    await runQualityScan(
      { courseIds: [], units: [{ courseId: 1, unitId: 10, title: "A" }] },
      deps,
    );

    expect(deps.loadUnits).not.toHaveBeenCalled();
    expect(deps.loadExercises).toHaveBeenCalledWith(10);
    expect(progress.map((event) => event.phase)).toEqual([
      "exercises",
      "exercises",
    ]);
  });

  it("reports failures with their context", async () => {
    const { deps } = scanDeps({
      loadUnits: vi.fn(async (courseId: number) => {
        if (courseId === 1) throw apiError("server");
        return [qualityUnit(20, { title: "Kuvvet", exercise_count: 3 })];
      }),
      loadExercises: vi.fn(async () => {
        throw apiError("not_found");
      }),
    });

    const outcome = await runQualityScan(
      { courseIds: [1, 2], units: [] },
      deps,
    );

    expect(outcome.status).toBe("completed");
    expect(outcome.failures).toEqual([
      { kind: "course", courseId: 1, error: apiError("server") },
      {
        kind: "unit",
        courseId: 2,
        unitId: 20,
        title: "Kuvvet",
        error: apiError("not_found"),
      },
    ]);
  });

  it("halts on an expired session", async () => {
    const expired = apiError("authentication");
    const { deps } = scanDeps({
      loadExercises: vi.fn(async () => {
        throw expired;
      }),
      concurrency: 1,
    });

    const outcome = await runQualityScan(
      {
        courseIds: [],
        units: [
          { courseId: 1, unitId: 1, title: "A" },
          { courseId: 1, unitId: 2, title: "B" },
        ],
      },
      deps,
    );

    expect(outcome).toEqual({
      status: "halted",
      failures: [],
      haltError: expired,
    });
    expect(deps.loadExercises).toHaveBeenCalledTimes(1);
  });

  it("stops on an aborted signal without reporting the aborted request", async () => {
    const abort = new AbortController();
    const loadExercises = vi.fn(async () => {
      abort.abort();
      throw new Error("aborted");
    });
    const { deps } = scanDeps({
      loadExercises,
      signal: abort.signal,
      concurrency: 1,
    });

    const outcome = await runQualityScan(
      {
        courseIds: [],
        units: [
          { courseId: 1, unitId: 1, title: "A" },
          { courseId: 1, unitId: 2, title: "B" },
        ],
      },
      deps,
    );

    expect(outcome).toEqual({
      status: "cancelled",
      failures: [],
      haltError: null,
    });
    expect(loadExercises).toHaveBeenCalledTimes(1);
  });
});

describe("retryTarget", () => {
  it("retries failed courses whole and failed units alone", () => {
    expect(
      retryTarget([
        { kind: "course", courseId: 1, error: apiError("server") },
        {
          kind: "unit",
          courseId: 2,
          unitId: 20,
          title: "Kuvvet",
          error: apiError("network"),
        },
      ]),
    ).toEqual({
      courseIds: [1],
      units: [{ courseId: 2, unitId: 20, title: "Kuvvet" }],
    });
  });

  it("is empty with no failures", () => {
    expect(retryTarget([])).toEqual({ courseIds: [], units: [] });
  });
});
