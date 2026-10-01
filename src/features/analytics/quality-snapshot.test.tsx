/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type {
  Course,
  Unit,
  UnitExercisesData,
} from "@/contracts/admin/content";
import { DEFAULT_QUALITY_SORT } from "@/features/analytics/quality-filters";
import {
  qualityCourse,
  qualityExercise,
  qualityUnit,
  qualityUnitExercises,
} from "@/test/fixtures/quality";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

const getCourses = vi.fn<() => Promise<Course[]>>();
const getCourseUnits = vi.fn<(courseId: number) => Promise<Unit[]>>();
const getUnitExercises =
  vi.fn<(unitId: number) => Promise<UnitExercisesData>>();

vi.mock("@/features/content/content-client", () => ({
  getCourses: () => getCourses(),
  getCourseUnits: (courseId: number) => getCourseUnits(courseId),
  getUnitExercises: (unitId: number) => getUnitExercises(unitId),
}));

const { QualityCenter } = await import("@/features/analytics/quality-center");
const { ContentScanProvider, useContentScan } =
  await import("@/features/content/content-scan-provider");

const courses = [qualityCourse(1, { name: "TYT Tarih", unit_count: 2 })];
const units = [
  qualityUnit(10, { title: "İlk Çağ", exercise_count: 2 }),
  qualityUnit(11, { title: "Zaman", exercise_count: 1 }),
];
const lists: Record<number, UnitExercisesData> = {
  10: qualityUnitExercises(
    10,
    [
      qualityExercise(100, { preview: "Orhun Yazıtları" }),
      qualityExercise(101, {
        preview: "Uygurlar",
        stats: { attempts: 30, correct_rate: 97, needs_review: true },
      }),
    ],
    "İlk Çağ",
  ),
  11: qualityUnitExercises(
    11,
    [qualityExercise(110, { preview: "Takvim" })],
    "Zaman",
  ),
};

/** Starts a full scan the way the /scan page does, through the provider. */
function ScanButton() {
  const { start, state } = useContentScan();

  return (
    <button onClick={() => start()} type="button">
      {state.snapshot?.status === "complete" ? "tarandı" : "tara"}
    </button>
  );
}

beforeEach(() => {
  getCourses.mockReset().mockResolvedValue(courses);
  getCourseUnits.mockReset().mockResolvedValue(units);
  getUnitExercises
    .mockReset()
    .mockImplementation(async (unitId) => lists[unitId]!);
});

describe("Quality Center with a full-scan snapshot", () => {
  it("shows the snapshot's questions once the live cache entries are gone", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ContentScanProvider>
          <ScanButton />
          <QualityCenter
            canEdit
            onChange={() => {}}
            state={{ filters: {}, sort: DEFAULT_QUALITY_SORT }}
          />
        </ContentScanProvider>
      </QueryClientProvider>,
    );

    act(() => screen.getByRole("button", { name: "tara" }).click());
    await screen.findByRole("button", { name: "tarandı" });

    // Drop every unit and exercise list from the live cache, as garbage
    // collection would after a while: the snapshot still holds them.
    act(() => {
      queryClient.removeQueries({
        queryKey: ["content", "courses", 1, "units"],
      });
      queryClient.removeQueries({ queryKey: ["content", "units"] });
    });
    const callsBefore = getUnitExercises.mock.calls.length;

    expect(
      await screen.findByText("2/2 ünite tarandı · 3 soru yüklendi"),
    ).toBeDefined();
    const list = screen.getByRole("list", { name: "Soru listesi" });
    expect(
      (await within(list).findAllByRole("listitem")).map(
        (item) => item.querySelector("a")?.textContent,
      ),
    ).toEqual(["Orhun Yazıtları", "Uygurlar", "Takvim"]);
    // The backend's needs_review flag survives the snapshot unchanged.
    expect(within(list).getByText("İnceleme gerekli")).toBeDefined();
    expect(getUnitExercises).toHaveBeenCalledTimes(callsBefore);
  });
});
