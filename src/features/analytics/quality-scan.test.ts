import { describe, expect, it, vi } from "vitest";

import type { Unit } from "@/contracts/admin/content";
import {
  retryTarget,
  runQualityScan,
  SCAN_CONCURRENCY,
  type ScanDependencies,
  type ScanProgress,
} from "@/features/analytics/quality-scan";
import type { ApiError } from "@/lib/api/error";
import { qualityUnit } from "@/test/fixtures/quality";

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
    loadExercises: vi.fn(async () => undefined),
    isCancelled: () => false,
    onProgress: (event) => progress.push(event),
    ...overrides,
  };

  return { deps, progress };
}

describe("runQualityScan", () => {
  it("lists units per course, then reads each non-empty unit once", async () => {
    const unitsByCourse: Record<number, Unit[]> = {
      1: [
        qualityUnit(10, { exercise_count: 4 }),
        qualityUnit(11, { exercise_count: 0 }),
      ],
      2: [qualityUnit(20, { exercise_count: 1 })],
    };
    const loadExercises = vi.fn<(unitId: number) => Promise<undefined>>(
      async () => undefined,
    );
    const { deps, progress } = scanDeps({
      loadUnits: vi.fn(async (courseId: number) => unitsByCourse[courseId]!),
      loadExercises,
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
    expect(deps.loadUnits).toHaveBeenCalledTimes(2);
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

  it("reads explicitly targeted units without listing any course", async () => {
    const { deps } = scanDeps();

    await runQualityScan(
      { courseIds: [], units: [{ courseId: 1, unitId: 10, title: "A" }] },
      deps,
    );

    expect(deps.loadUnits).not.toHaveBeenCalled();
    expect(deps.loadExercises).toHaveBeenCalledWith(10);
  });

  it("does not read a unit twice when it is both targeted and listed", async () => {
    const { deps } = scanDeps({
      loadUnits: vi.fn(async () => [qualityUnit(10, { exercise_count: 2 })]),
    });

    await runQualityScan(
      { courseIds: [1], units: [{ courseId: 1, unitId: 10, title: "A" }] },
      deps,
    );

    expect(deps.loadExercises).toHaveBeenCalledTimes(1);
  });

  it("uses bounded concurrency by default", async () => {
    let inFlight = 0;
    let peak = 0;
    const units = Array.from({ length: 12 }, (_, index) => ({
      courseId: 1,
      unitId: index + 1,
      title: `Ü${index}`,
    }));
    const { deps } = scanDeps({
      loadExercises: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((done) => setTimeout(done, 1));
        inFlight -= 1;
      },
    });

    await runQualityScan({ courseIds: [], units }, deps);

    expect(peak).toBe(SCAN_CONCURRENCY);
  });

  it("records failures and keeps going", async () => {
    const { deps } = scanDeps({
      loadUnits: vi.fn(async (courseId: number) => {
        if (courseId === 1) throw apiError("server");
        return [
          qualityUnit(20, { title: "Kuvvet", exercise_count: 3 }),
          qualityUnit(21, { exercise_count: 3 }),
        ];
      }),
      loadExercises: vi.fn(async (unitId: number) => {
        if (unitId === 20) throw apiError("not_found");
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
    expect(deps.loadExercises).toHaveBeenCalledWith(21);
  });

  it.each(["authentication", "rate_limit"] as const)(
    "halts on %s instead of repeating it for every unit",
    async (kind) => {
      const halting = apiError(kind, { retryAfterSeconds: 30 });
      const loadExercises = vi.fn(async () => {
        throw halting;
      });
      const units = Array.from({ length: 10 }, (_, index) => ({
        courseId: 1,
        unitId: index + 1,
        title: `Ü${index}`,
      }));
      const { deps } = scanDeps({ loadExercises, concurrency: 1 });

      const outcome = await runQualityScan({ courseIds: [], units }, deps);

      expect(outcome).toEqual({
        status: "halted",
        failures: [],
        haltError: halting,
      });
      expect(loadExercises).toHaveBeenCalledTimes(1);
    },
  );

  it("skips the exercise phase when listing units halts", async () => {
    const { deps } = scanDeps({
      loadUnits: vi.fn(async () => {
        throw apiError("authentication");
      }),
    });

    const outcome = await runQualityScan(
      { courseIds: [1, 2], units: [] },
      deps,
    );

    expect(outcome.status).toBe("halted");
    expect(deps.loadExercises).not.toHaveBeenCalled();
  });

  it("reports a cancelled scan and stops scheduling", async () => {
    let cancelled = false;
    const loadExercises = vi.fn(async () => {
      cancelled = true;
    });
    const { deps } = scanDeps({
      loadExercises,
      isCancelled: () => cancelled,
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

    expect(outcome.status).toBe("cancelled");
    expect(loadExercises).toHaveBeenCalledTimes(1);
  });

  it("completes immediately for an empty target", async () => {
    const { deps, progress } = scanDeps();

    expect(await runQualityScan({ courseIds: [], units: [] }, deps)).toEqual({
      status: "completed",
      failures: [],
      haltError: null,
    });
    expect(progress).toEqual([{ phase: "exercises", completed: 0, total: 0 }]);
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
