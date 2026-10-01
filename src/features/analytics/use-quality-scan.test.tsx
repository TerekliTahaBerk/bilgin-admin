/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type { Unit, UnitExercisesData } from "@/contracts/admin/content";
import {
  courseUnitsQueryKey,
  unitExercisesQueryKey,
} from "@/features/content/content-queries";
import type { ExerciseServerFilters } from "@/features/content/exercise-filters";
import { CONTENT_SCAN_CONCURRENCY } from "@/features/content/content-scan";
import { qualityUnit, qualityUnitExercises } from "@/test/fixtures/quality";

const getCourseUnits = vi.fn<(courseId: number) => Promise<Unit[]>>();
const getUnitExercises =
  vi.fn<
    (
      unitId: number,
      filters: ExerciseServerFilters,
    ) => Promise<UnitExercisesData>
  >();

vi.mock("@/features/content/content-client", () => ({
  getCourseUnits: (courseId: number) => getCourseUnits(courseId),
  getUnitExercises: (unitId: number, filters: ExerciseServerFilters) =>
    getUnitExercises(unitId, filters),
}));

const { useQualityScan } =
  await import("@/features/analytics/use-quality-scan");

function setup(
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  const view = renderHook(() => useQualityScan(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });

  return { ...view, client };
}

const units = Array.from({ length: 8 }, (_, index) =>
  qualityUnit(index + 1, { exercise_count: 1 }),
);

beforeEach(() => {
  getCourseUnits.mockReset();
  getUnitExercises.mockReset();
  getCourseUnits.mockResolvedValue(units);
  getUnitExercises.mockImplementation(async (unitId) =>
    qualityUnitExercises(unitId, []),
  );
});

describe("useQualityScan", () => {
  it("starts idle", () => {
    const { result } = setup();

    expect(result.current.state).toEqual({
      status: "idle",
      progress: null,
      failures: [],
      haltError: null,
      isCancelling: false,
    });
  });

  it("writes what it reads into the shared cache under the browsers' keys", async () => {
    const { result, client } = setup();

    act(() => result.current.start({ courseIds: [1], units: [] }));

    await waitFor(() => expect(result.current.state.status).toBe("completed"));
    expect(client.getQueryData(courseUnitsQueryKey(1))).toEqual(units);
    expect(client.getQueryData(unitExercisesQueryKey(3, {}))).toEqual(
      qualityUnitExercises(3, []),
    );
    expect(result.current.state.progress).toEqual({
      phase: "exercises",
      completed: 8,
      total: 8,
    });
  });

  it("ignores a second start while a scan is running", async () => {
    const { result } = setup();

    act(() => {
      result.current.start({ courseIds: [1], units: [] });
      result.current.start({ courseIds: [1], units: [] });
    });

    await waitFor(() => expect(result.current.state.status).toBe("completed"));
    expect(getCourseUnits).toHaveBeenCalledTimes(1);
    expect(getUnitExercises).toHaveBeenCalledTimes(8);
  });

  it("serves fresh cached lists without a request, and refetches them on refresh", async () => {
    const { result, client } = setup();
    client.setQueryData(courseUnitsQueryKey(1), units.slice(0, 1));
    client.setQueryData(
      unitExercisesQueryKey(1, {}),
      qualityUnitExercises(1, []),
    );

    act(() => result.current.start({ courseIds: [1], units: [] }));
    await waitFor(() => expect(result.current.state.status).toBe("completed"));
    expect(getCourseUnits).not.toHaveBeenCalled();
    expect(getUnitExercises).not.toHaveBeenCalled();

    act(() =>
      result.current.start({ courseIds: [1], units: [] }, { refresh: true }),
    );
    await waitFor(() => expect(getUnitExercises).toHaveBeenCalledTimes(8));
    await waitFor(() => expect(result.current.state.status).toBe("completed"));
    expect(getCourseUnits).toHaveBeenCalledTimes(1);
  });

  it("stops scheduling after the page unmounts", async () => {
    const pending: (() => void)[] = [];
    getUnitExercises.mockImplementation(
      (unitId) =>
        new Promise((resolve) => {
          pending.push(() => resolve(qualityUnitExercises(unitId, [])));
        }),
    );
    const { result, unmount } = setup();

    act(() => result.current.start({ courseIds: [1], units: [] }));
    await waitFor(() =>
      expect(getUnitExercises).toHaveBeenCalledTimes(CONTENT_SCAN_CONCURRENCY),
    );

    unmount();
    for (const release of pending.splice(0)) release();
    await new Promise((done) => setTimeout(done, 10));

    expect(getUnitExercises).toHaveBeenCalledTimes(CONTENT_SCAN_CONCURRENCY);
  });

  it("cancels on request and reports it", async () => {
    const pending: (() => void)[] = [];
    getUnitExercises.mockImplementation(
      (unitId) =>
        new Promise((resolve) => {
          pending.push(() => resolve(qualityUnitExercises(unitId, [])));
        }),
    );
    const { result } = setup();

    act(() => result.current.start({ courseIds: [1], units: [] }));
    await waitFor(() =>
      expect(getUnitExercises).toHaveBeenCalledTimes(CONTENT_SCAN_CONCURRENCY),
    );

    // Cancelling aborts the requests in flight rather than waiting for them.
    act(() => result.current.cancel());

    await waitFor(() => expect(result.current.state.status).toBe("cancelled"));
    expect(result.current.state.isCancelling).toBe(false);

    await act(async () => {
      for (const release of pending.splice(0)) release();
    });
    expect(getUnitExercises).toHaveBeenCalledTimes(CONTENT_SCAN_CONCURRENCY);
  });

  it("cancel is a no-op when nothing is running", () => {
    const { result } = setup();

    act(() => result.current.cancel());

    expect(result.current.state.status).toBe("idle");
    expect(result.current.state.isCancelling).toBe(false);
  });

  it("retries only what failed", async () => {
    getUnitExercises.mockImplementation(async (unitId) => {
      if (unitId === 5) {
        throw { kind: "server", status: 500, message: "Sunucu hatası." };
      }
      return qualityUnitExercises(unitId, []);
    });
    const { result } = setup();

    act(() => result.current.start({ courseIds: [1], units: [] }));
    await waitFor(() => expect(result.current.state.status).toBe("completed"));
    expect(result.current.state.failures).toHaveLength(1);

    getUnitExercises.mockClear();
    getUnitExercises.mockImplementation(async (unitId) =>
      qualityUnitExercises(unitId, []),
    );

    act(() => result.current.retryFailures());
    await waitFor(() => expect(result.current.state.failures).toHaveLength(0));
    expect(getUnitExercises.mock.calls).toEqual([[5, {}]]);
  });

  it("does nothing on retry with no failures", () => {
    const { result } = setup();

    act(() => result.current.retryFailures());

    expect(result.current.state.status).toBe("idle");
    expect(getCourseUnits).not.toHaveBeenCalled();
  });
});
