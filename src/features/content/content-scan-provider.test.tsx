/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type {
  Course,
  Unit,
  UnitExercisesData,
} from "@/contracts/admin/content";
import {
  qualityCourse,
  qualityUnit,
  qualityUnitExercises,
} from "@/test/fixtures/quality";

const getCourses = vi.fn<() => Promise<Course[]>>();
const getCourseUnits = vi.fn<(courseId: number) => Promise<Unit[]>>();
const getUnitExercises =
  vi.fn<(unitId: number, signal?: AbortSignal) => Promise<UnitExercisesData>>();

vi.mock("@/features/content/content-client", () => ({
  getCourses: () => getCourses(),
  getCourseUnits: (courseId: number) => getCourseUnits(courseId),
  getUnitExercises: (
    unitId: number,
    _filters: unknown,
    options: { signal?: AbortSignal } = {},
  ) => getUnitExercises(unitId, options.signal),
}));

const {
  ContentScanProvider,
  useContentScan,
  useContentSnapshot,
  useContentSnapshotIndex,
} = await import("@/features/content/content-scan-provider");

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ContentScanProvider>{children}</ContentScanProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  getCourses.mockReset().mockResolvedValue([qualityCourse(1)]);
  getCourseUnits.mockReset().mockResolvedValue([qualityUnit(10)]);
  getUnitExercises
    .mockReset()
    .mockImplementation(async (unitId) => qualityUnitExercises(unitId, []));
});

describe("content scan hooks", () => {
  it("returns no snapshot outside the panel shell", () => {
    const { result } = renderHook(() => useContentSnapshot());

    expect(result.current).toBeNull();
  });

  it("refuses scan actions outside the panel shell", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderHook(() => useContentScan())).toThrow(
      "useContentScan must be used inside ContentScanProvider.",
    );
  });

  it("runs a scan and shares its snapshot and index", async () => {
    const { result } = renderHook(
      () => ({
        scan: useContentScan(),
        snapshot: useContentSnapshot(),
        indexed: useContentSnapshotIndex(),
      }),
      { wrapper },
    );

    expect(result.current.snapshot).toBeNull();
    expect(result.current.indexed).toBeNull();

    act(() => result.current.scan.start());
    expect(result.current.scan.state.run).not.toBeNull();

    await waitFor(() => expect(result.current.scan.state.run).toBeNull());
    expect(result.current.snapshot?.status).toBe("complete");
    expect(result.current.indexed?.index.scannedUnitIds.has(10)).toBe(true);
  });

  it("does not re-render snapshot readers on every progress tick", async () => {
    const renders = vi.fn();

    function SnapshotReader() {
      const snapshot = useContentSnapshot();
      renders(snapshot);
      return <p>{snapshot === null ? "yok" : snapshot.status}</p>;
    }

    function Starter() {
      const { start } = useContentScan();
      return (
        <button onClick={() => start()} type="button">
          başlat
        </button>
      );
    }

    getCourseUnits.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => qualityUnit(index + 1)),
    );

    render(
      <>
        <SnapshotReader />
        <Starter />
      </>,
      { wrapper },
    );

    act(() => screen.getByRole("button", { name: "başlat" }).click());
    expect(await screen.findByText("complete")).toBeDefined();

    // One render before, one after — not one per unit read.
    expect(renders).toHaveBeenCalledTimes(2);
  });

  it("aborts a running scan when the shell unmounts", async () => {
    const signals: AbortSignal[] = [];
    getUnitExercises.mockImplementation(
      (_unitId, signal) =>
        new Promise(() => {
          if (signal !== undefined) signals.push(signal);
        }),
    );

    const { result, unmount } = renderHook(() => useContentScan(), { wrapper });

    act(() => result.current.start());
    await waitFor(() => expect(signals.length).toBeGreaterThan(0));

    unmount();

    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
