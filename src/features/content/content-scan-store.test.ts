/**
 * @vitest-environment jsdom
 */
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Course,
  Unit,
  UnitExercisesData,
} from "@/contracts/admin/content";
import {
  coursesQueryKey,
  courseUnitsQueryKey,
  unitExercisesQueryKey,
} from "@/features/content/content-queries";
import type { ExerciseServerFilters } from "@/features/content/exercise-filters";
import type { ApiError } from "@/lib/api/error";
import {
  qualityCourse,
  qualityExercise,
  qualityUnit,
  qualityUnitExercises,
} from "@/test/fixtures/quality";

const getCourses = vi.fn<(signal?: AbortSignal) => Promise<Course[]>>();
const getCourseUnits =
  vi.fn<(courseId: number, signal?: AbortSignal) => Promise<Unit[]>>();
const getUnitExercises =
  vi.fn<
    (
      unitId: number,
      filters: ExerciseServerFilters,
      signal?: AbortSignal,
    ) => Promise<UnitExercisesData>
  >();

vi.mock("@/features/content/content-client", () => ({
  getCourses: (options: { signal?: AbortSignal } = {}) =>
    getCourses(options.signal),
  getCourseUnits: (courseId: number, options: { signal?: AbortSignal } = {}) =>
    getCourseUnits(courseId, options.signal),
  getUnitExercises: (
    unitId: number,
    filters: ExerciseServerFilters,
    options: { signal?: AbortSignal } = {},
  ) => getUnitExercises(unitId, filters, options.signal),
}));

const { ContentScanController, INITIAL_CONTENT_SCAN_STATE } =
  await import("@/features/content/content-scan-store");

const courses = [
  qualityCourse(1, { name: "TYT Tarih", unit_count: 2 }),
  qualityCourse(2, { name: "AYT Fizik", unit_count: 1 }),
];
const unitsByCourse: Record<number, Unit[]> = {
  1: [
    qualityUnit(10, { title: "İlk Çağ" }),
    qualityUnit(11, { title: "Zaman" }),
  ],
  2: [qualityUnit(20, { title: "Kuvvet" })],
};
const listsByUnit: Record<number, UnitExercisesData> = {
  10: qualityUnitExercises(
    10,
    [qualityExercise(100), qualityExercise(101)],
    "İlk Çağ",
  ),
  11: qualityUnitExercises(11, [], "Zaman"),
  20: qualityUnitExercises(20, [qualityExercise(200)], "Kuvvet"),
};

const serverError: ApiError = {
  kind: "server",
  status: 500,
  message: "Sunucu hatası oluştu.",
};

let clock = 0;
const now = () => new Date(Date.UTC(2026, 9, 1, 9, 0, clock++));

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const controller = new ContentScanController(queryClient, now);
  const changes = vi.fn();
  controller.subscribe(changes);

  return { queryClient, controller, changes };
}

async function settled(controller: InstanceType<typeof ContentScanController>) {
  await vi.waitFor(() => expect(controller.getState().run).toBeNull());
}

beforeEach(() => {
  clock = 0;
  getCourses.mockReset().mockResolvedValue(courses);
  getCourseUnits
    .mockReset()
    .mockImplementation(async (courseId) => unitsByCourse[courseId]!);
  getUnitExercises
    .mockReset()
    .mockImplementation(async (unitId) => listsByUnit[unitId]!);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ContentScanController", () => {
  it("starts empty", () => {
    const { controller } = setup();

    expect(controller.getState()).toEqual(INITIAL_CONTENT_SCAN_STATE);
  });

  it("runs a full scan and publishes a complete snapshot", async () => {
    const { controller, changes } = setup();

    controller.start();
    expect(controller.getState().run).toMatchObject({
      kind: "full",
      refresh: false,
      isCancelling: false,
    });

    await settled(controller);
    const state = controller.getState();

    expect(state.snapshot).toMatchObject({
      status: "complete",
      errors: [],
      courses,
    });
    expect(state.snapshot?.units).toHaveLength(3);
    expect(state.snapshot?.exercises.map((exercise) => exercise.id)).toEqual([
      100, 101, 200,
    ]);
    expect(state.lastFullScanAt).toBe(state.snapshot?.generatedAt);
    expect(state.lastOutcome).toMatchObject({
      kind: "full",
      status: "complete",
      failures: [],
      haltError: null,
    });
    // Every unit is read, even the one with no exercises.
    expect(
      getUnitExercises.mock.calls.map(([id, filters]) => [id, filters]),
    ).toEqual([
      [10, {}],
      [11, {}],
      [20, {}],
    ]);
    expect(changes).toHaveBeenCalled();
  });

  it("writes every list into the shared cache under the browsers' keys", async () => {
    const { controller, queryClient } = setup();

    controller.start();
    await settled(controller);

    expect(queryClient.getQueryData(coursesQueryKey)).toEqual(courses);
    expect(queryClient.getQueryData(courseUnitsQueryKey(2))).toEqual(
      unitsByCourse[2],
    );
    expect(queryClient.getQueryData(unitExercisesQueryKey(10, {}))).toEqual(
      listsByUnit[10],
    );
  });

  it("reuses fresh cache entries, and asks again on a re-scan", async () => {
    const { controller, queryClient } = setup();
    queryClient.setQueryData(coursesQueryKey, courses);
    queryClient.setQueryData(courseUnitsQueryKey(1), unitsByCourse[1]);
    queryClient.setQueryData(unitExercisesQueryKey(10, {}), listsByUnit[10]);

    controller.start();
    await settled(controller);

    expect(getCourses).not.toHaveBeenCalled();
    expect(getCourseUnits.mock.calls.map(([id]) => id)).toEqual([2]);
    expect(getUnitExercises.mock.calls.map(([id]) => id)).toEqual([11, 20]);

    controller.start({ refresh: true });
    expect(controller.getState().run?.refresh).toBe(true);
    await settled(controller);

    expect(getCourses).toHaveBeenCalledTimes(1);
    expect(getCourseUnits).toHaveBeenCalledTimes(3);
    expect(getUnitExercises).toHaveBeenCalledTimes(5);
  });

  it("ignores a second start while running", async () => {
    const { controller } = setup();

    controller.start();
    controller.start({ refresh: true });

    expect(controller.getState().run?.refresh).toBe(false);
    await settled(controller);
    expect(getCourses).toHaveBeenCalledTimes(1);
  });

  it("reports progress while running", async () => {
    const { controller } = setup();
    const phases = new Set<string>();
    controller.subscribe(() => {
      const phase = controller.getState().run?.progress?.phase;
      if (phase !== undefined) phases.add(phase);
    });

    controller.start();
    await settled(controller);

    expect([...phases]).toEqual(["courses", "units", "exercises"]);
  });

  it("keeps a partial result visible, names the failures and retries only them", async () => {
    const { controller } = setup();
    getCourseUnits.mockImplementation(async (courseId) => {
      if (courseId === 2) throw serverError;
      return unitsByCourse[courseId]!;
    });
    getUnitExercises.mockImplementation(async (unitId) => {
      if (unitId === 11) throw serverError;
      return listsByUnit[unitId]!;
    });

    controller.start();
    await settled(controller);

    expect(controller.getState().snapshot).toMatchObject({
      status: "partial",
      errors: [
        { kind: "course", courseId: 2, error: serverError },
        {
          kind: "unit",
          courseId: 1,
          unitId: 11,
          title: "Zaman",
          error: serverError,
        },
      ],
    });
    expect(controller.getState().lastOutcome?.status).toBe("partial");
    // A partial result is never "the last full scan".
    expect(controller.getState().lastFullScanAt).toBeNull();

    getCourses.mockClear();
    getCourseUnits
      .mockClear()
      .mockImplementation(async (id) => unitsByCourse[id]!);
    getUnitExercises
      .mockClear()
      .mockImplementation(async (id) => listsByUnit[id]!);

    controller.retryFailures();
    expect(controller.getState().run?.kind).toBe("retry");
    await settled(controller);

    expect(getCourses).not.toHaveBeenCalled();
    expect(getCourseUnits.mock.calls.map(([id]) => id)).toEqual([2]);
    expect(getUnitExercises.mock.calls.map(([id]) => id).sort()).toEqual([
      11, 20,
    ]);
    const state = controller.getState();
    expect(state.snapshot?.status).toBe("complete");
    expect(state.snapshot?.exercises.map((exercise) => exercise.id)).toEqual([
      100, 101, 200,
    ]);
    expect(state.lastOutcome).toMatchObject({
      kind: "retry",
      status: "complete",
    });
    expect(state.lastFullScanAt).toBe(state.snapshot?.generatedAt);
  });

  it("reports a failed course list without a snapshot, and retries the whole scan", async () => {
    const { controller } = setup();
    getCourses.mockRejectedValueOnce(serverError);

    controller.start();
    await settled(controller);

    expect(controller.getState()).toMatchObject({
      snapshot: null,
      lastOutcome: {
        status: "failed",
        failures: [{ kind: "courses", error: serverError }],
      },
    });

    controller.retryFailures();
    expect(controller.getState().run?.kind).toBe("full");
    await settled(controller);

    expect(controller.getState().snapshot?.status).toBe("complete");
  });

  it("does nothing on retry when nothing failed", async () => {
    const { controller } = setup();

    controller.start();
    await settled(controller);
    getCourses.mockClear();

    controller.retryFailures();

    expect(controller.getState().run).toBeNull();
    expect(getCourses).not.toHaveBeenCalled();
  });

  it("aborts the requests in flight on cancel and keeps the previous snapshot", async () => {
    const { controller } = setup();
    controller.start();
    await settled(controller);
    const previous = controller.getState().snapshot;

    const signals: AbortSignal[] = [];
    getUnitExercises.mockImplementation(
      (_unitId, _filters, signal) =>
        new Promise((_resolve, reject) => {
          signals.push(signal!);
          signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );

    controller.start({ refresh: true });
    await vi.waitFor(() => expect(signals.length).toBeGreaterThan(0));

    controller.cancel();
    expect(controller.getState().run?.isCancelling).toBe(true);

    await settled(controller);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(controller.getState().lastOutcome).toMatchObject({
      status: "cancelled",
      failures: [],
    });
    expect(controller.getState().snapshot).toBe(previous);
  });

  it("cancel is a no-op when nothing runs", () => {
    const { controller, changes } = setup();

    controller.cancel();

    expect(changes).not.toHaveBeenCalled();
  });

  it("stops on a rate limit and keeps the previous snapshot", async () => {
    const { controller } = setup();
    const limited: ApiError = {
      kind: "rate_limit",
      status: 429,
      message: "Çok fazla istek.",
      retryAfterSeconds: 30,
    };
    getCourseUnits.mockRejectedValue(limited);

    controller.start();
    await settled(controller);

    expect(controller.getState()).toMatchObject({
      snapshot: null,
      lastOutcome: { status: "halted", haltError: limited },
    });
  });

  it("stops notifying an unsubscribed listener", async () => {
    const { controller } = setup();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    unsubscribe();

    controller.start();
    await settled(controller);

    expect(listener).not.toHaveBeenCalled();
  });

  it("never writes the catalogue to web storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { controller } = setup();

    controller.start();
    await settled(controller);

    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
