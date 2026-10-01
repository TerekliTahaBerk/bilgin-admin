/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type {
  Course,
  Unit,
  UnitExercisesData,
} from "@/contracts/admin/content";
import {
  DEFAULT_QUALITY_SORT,
  type QualityViewState,
} from "@/features/analytics/quality-filters";
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

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

const getCourses = vi.fn<() => Promise<Course[]>>();
const getCourseUnits = vi.fn<(courseId: number) => Promise<Unit[]>>();
const getUnitExercises =
  vi.fn<
    (
      unitId: number,
      filters: ExerciseServerFilters,
    ) => Promise<UnitExercisesData>
  >();

vi.mock("@/features/content/content-client", () => ({
  getCourses: () => getCourses(),
  getCourseUnits: (courseId: number) => getCourseUnits(courseId),
  getUnitExercises: (unitId: number, filters: ExerciseServerFilters) =>
    getUnitExercises(unitId, filters),
}));

const { QualityCenter } = await import("@/features/analytics/quality-center");

const courses = [
  qualityCourse(1, { name: "TYT Tarih", unit_count: 2 }),
  qualityCourse(2, { name: "AYT Fizik", unit_count: 1 }),
];
const unitsByCourse: Record<number, Unit[]> = {
  1: [
    qualityUnit(10, { title: "İlk Çağ", exercise_count: 2 }),
    qualityUnit(11, { title: "Boş Ünite", exercise_count: 0 }),
  ],
  2: [qualityUnit(20, { title: "Kuvvet", exercise_count: 2 })],
};
const exercisesByUnit: Record<number, UnitExercisesData> = {
  10: qualityUnitExercises(
    10,
    [
      qualityExercise(101, { preview: "Orhun Yazıtları kime aittir?" }),
      qualityExercise(102, {
        preview: "Uygurlar yerleşik hayata geçti.",
        status: "draft",
        version: 2,
        stats: {
          attempts: 34,
          correct_rate: 97,
          avg_seconds: 8,
          needs_review: true,
        },
      }),
    ],
    "İlk Çağ",
  ),
  20: qualityUnitExercises(
    20,
    [
      qualityExercise(201, {
        preview: "Net kuvvet sıfırsa cisim ne yapar?",
        status: "review",
        // A 0% rate the backend did NOT flag: it must stay unflagged here.
        stats: { attempts: 5, correct_rate: 0, avg_seconds: 30 },
      }),
      qualityExercise(202, {
        preview: "Newton'un ikinci yasası",
        stats: {
          attempts: 25,
          correct_rate: 8,
          avg_seconds: 45,
          needs_review: true,
        },
      }),
    ],
    "Kuvvet",
  ),
};

function apiError(kind: ApiError["kind"], status: number | null): ApiError {
  return { kind, status, message: "Beklenmeyen bir hata oluştu." };
}

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

let lastState: QualityViewState;

function Harness({
  initial,
  canEdit,
}: {
  initial: QualityViewState;
  canEdit: boolean;
}) {
  const [state, setState] = useState(initial);

  return (
    <QualityCenter
      canEdit={canEdit}
      onChange={(next) => {
        lastState = next;
        setState(next);
      }}
      state={state}
    />
  );
}

function renderCenter({
  client = createClient(),
  initial = { filters: {}, sort: DEFAULT_QUALITY_SORT },
  canEdit = true,
}: {
  client?: QueryClient;
  initial?: QualityViewState;
  canEdit?: boolean;
} = {}) {
  render(
    <QueryClientProvider client={client}>
      <Harness canEdit={canEdit} initial={initial} />
    </QueryClientProvider>,
  );

  return client;
}

function seed(client: QueryClient, { units = [1, 2], lists = [10, 20] } = {}) {
  client.setQueryData(coursesQueryKey, courses);
  for (const courseId of units) {
    client.setQueryData(courseUnitsQueryKey(courseId), unitsByCourse[courseId]);
  }
  for (const unitId of lists) {
    client.setQueryData(
      unitExercisesQueryKey(unitId, {}),
      exercisesByUnit[unitId],
    );
  }
}

async function listItems() {
  return within(await screen.findByRole("list", { name: "Soru listesi" }))
    .getAllByRole("listitem")
    .map((item) => item.querySelector("a")?.textContent);
}

function tileValue(name: RegExp) {
  return screen.getByRole("button", { name }).firstElementChild?.textContent;
}

beforeEach(() => {
  getCourses.mockReset();
  getCourseUnits.mockReset();
  getUnitExercises.mockReset();
  replace.mockReset();
  refresh.mockReset();

  getCourses.mockResolvedValue(courses);
  getCourseUnits.mockImplementation(
    async (courseId) => unitsByCourse[courseId]!,
  );
  getUnitExercises.mockImplementation(
    async (unitId) => exercisesByUnit[unitId]!,
  );
});

describe("QualityCenter states", () => {
  it("shows a loading state while courses load", () => {
    getCourses.mockImplementation(() => new Promise(() => {}));

    renderCenter();

    expect(screen.getByText("Soru kalite verileri yükleniyor.")).toBeDefined();
  });

  it("shows a retryable error", async () => {
    const user = userEvent.setup();
    getCourses.mockRejectedValueOnce(apiError("server", 500));

    renderCenter();

    expect(
      within(await screen.findByRole("alert")).getByText("Dersler yüklenemedi"),
    ).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(
      await screen.findByRole("heading", { name: /Veri kapsamı/ }),
    ).toBeDefined();
  });

  it("shows a forbidden state without a retry", async () => {
    getCourses.mockRejectedValue(apiError("authorization", 403));

    renderCenter();

    expect(
      await screen.findByText("Bu bölüme erişim yetkiniz yok"),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: "Tekrar dene" })).toBeNull();
  });

  it("redirects to login when the session has expired", async () => {
    getCourses.mockRejectedValue(apiError("authentication", 401));

    renderCenter();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(refresh).toHaveBeenCalled();
  });

  it("shows an empty state with no courses", async () => {
    getCourses.mockResolvedValue([]);

    renderCenter();

    expect(await screen.findByText("Henüz ders bulunmuyor.")).toBeDefined();
  });

  it("asks for a scan before anything is loaded — and sends no list request on its own", async () => {
    renderCenter();

    expect(
      await screen.findByText("Bu kapsamda henüz yüklenmiş soru yok."),
    ).toBeDefined();
    expect(
      screen.getByText("Soruları görmek için yukarıdan taramayı başlatın."),
    ).toBeDefined();
    expect(getCourseUnits).not.toHaveBeenCalled();
    expect(getUnitExercises).not.toHaveBeenCalled();
  });
});

describe("QualityCenter cached data", () => {
  it("shows lists already in the cache without requesting them again", async () => {
    const client = createClient();
    seed(client);

    renderCenter({ client });

    expect(
      await screen.findByText("3/3 ünite tarandı · 4 soru yüklendi"),
    ).toBeDefined();
    expect(await listItems()).toEqual([
      "Orhun Yazıtları kime aittir?",
      "Uygurlar yerleşik hayata geçti.",
      "Net kuvvet sıfırsa cisim ne yapar?",
      "Newton'un ikinci yasası",
    ]);
    expect(getCourses).not.toHaveBeenCalled();
    expect(getCourseUnits).not.toHaveBeenCalled();
    expect(getUnitExercises).not.toHaveBeenCalled();
  });

  it("ignores a type/status-filtered cache entry — it is not the whole unit", async () => {
    const client = createClient();
    seed(client, { lists: [] });
    client.setQueryData(
      unitExercisesQueryKey(10, { status: "draft" }),
      qualityUnitExercises(10, [exercisesByUnit[10]!.exercises[1]!], "İlk Çağ"),
    );

    renderCenter({ client });

    expect(
      await screen.findByText("1/3 ünite tarandı · 0 soru yüklendi"),
    ).toBeDefined();
  });

  it("summarises the loaded questions from backend fields", async () => {
    const client = createClient();
    seed(client);

    renderCenter({ client });

    await screen.findByRole("list", { name: "Soru listesi" });
    expect(tileValue(/^\d+Taranan soru$/)).toBe("4");
    expect(tileValue(/^\d+İnceleme gerekli/)).toBe("2");
    expect(tileValue(/^\d+Hiç çözülmemiş/)).toBe("1");
    expect(tileValue(/^\d+Yüksek doğru oranı/)).toBe("1");
    expect(tileValue(/^\d+Düşük doğru oranı/)).toBe("2");
    expect(tileValue(/^\d+Düzenlenmiş/)).toBe("1");
    expect(tileValue(/^\d+Taslak$/)).toBe("1");
    expect(tileValue(/^\d+İncelemede$/)).toBe("1");
    expect(tileValue(/^\d+Yayında$/)).toBe("2");
    expect(tileValue(/^\d+Arşiv$/)).toBe("0");
  });

  it("'İnceleme gerekli' shows exactly the backend-flagged questions", async () => {
    const user = userEvent.setup();
    const client = createClient();
    seed(client);

    renderCenter({ client });

    await user.click(
      await screen.findByRole("button", { name: "İnceleme gerekli" }),
    );

    expect(await listItems()).toEqual([
      "Uygurlar yerleşik hayata geçti.",
      "Newton'un ikinci yasası",
    ]);
    expect(lastState).toEqual({
      filters: { needsReview: true },
      sort: { key: "attempts", direction: "desc" },
    });
  });

  it("orders the low-rate view by rate and leaves unsolved questions out", async () => {
    const user = userEvent.setup();
    const client = createClient();
    seed(client);

    renderCenter({ client });

    await user.click(
      await screen.findByRole("button", { name: "Çok düşük doğru oranı" }),
    );

    expect(await listItems()).toEqual([
      "Net kuvvet sıfırsa cisim ne yapar?",
      "Newton'un ikinci yasası",
    ]);
  });

  it("links rows to the editor", async () => {
    const client = createClient();
    seed(client);

    renderCenter({ client });

    expect(
      (
        await screen.findByRole("link", {
          name: "Soruyu düzenle: Newton'un ikinci yasası",
        })
      ).getAttribute("href"),
    ).toBe("/courses/2/units/20/exercises/202");
  });

  it("links a read-only admin to the unit page", async () => {
    const client = createClient();
    seed(client);

    renderCenter({ client, canEdit: false });

    expect(
      (
        await screen.findByRole("link", {
          name: "Soruyu ünitede görüntüle: Newton'un ikinci yasası",
        })
      ).getAttribute("href"),
    ).toBe("/courses/2/units/20");
  });

  it("narrows summary and list to the selected course, loading its unit list once", async () => {
    const client = createClient();
    seed(client, { units: [2], lists: [20] });

    renderCenter({
      client,
      initial: { filters: { courseId: 2 }, sort: DEFAULT_QUALITY_SORT },
    });

    expect(
      await screen.findByRole("heading", { name: "Veri kapsamı: AYT Fizik" }),
    ).toBeDefined();
    expect(tileValue(/^\d+Taranan soru$/)).toBe("2");
    expect(await listItems()).toHaveLength(2);
    // Course 2's unit list was already cached and fresh: no request.
    expect(getCourseUnits).not.toHaveBeenCalled();
  });

  it("ignores a course id the backend does not list", async () => {
    const client = createClient();
    seed(client);

    renderCenter({
      client,
      initial: {
        filters: { courseId: 99, unitId: 5 },
        sort: DEFAULT_QUALITY_SORT,
      },
    });

    expect(
      await screen.findByRole("heading", { name: "Veri kapsamı: Tüm dersler" }),
    ).toBeDefined();
    expect(await listItems()).toHaveLength(4);
    expect(getCourseUnits).not.toHaveBeenCalled();
  });

  it("ignores a unit id that is not in the selected course", async () => {
    const client = createClient();
    seed(client);

    renderCenter({
      client,
      initial: {
        filters: { courseId: 1, unitId: 999 },
        sort: DEFAULT_QUALITY_SORT,
      },
    });

    expect(
      await screen.findByRole("heading", { name: "Veri kapsamı: TYT Tarih" }),
    ).toBeDefined();
    expect(await listItems()).toHaveLength(2);
  });

  it("labels the scope with course and unit", async () => {
    const client = createClient();
    seed(client);

    renderCenter({
      client,
      initial: {
        filters: { courseId: 1, unitId: 10 },
        sort: DEFAULT_QUALITY_SORT,
      },
    });

    expect(
      await screen.findByRole("heading", {
        name: "Veri kapsamı: TYT Tarih › İlk Çağ",
      }),
    ).toBeDefined();
  });

  it("fetches the selected course's unit list for the unit filter", async () => {
    const client = createClient();
    client.setQueryData(coursesQueryKey, courses);

    renderCenter({
      client,
      initial: { filters: { courseId: 1 }, sort: DEFAULT_QUALITY_SORT },
    });

    const unitSelect = screen.getByLabelText("Ünite") as HTMLSelectElement;
    await waitFor(() => expect(unitSelect.disabled).toBe(false));
    expect(getCourseUnits).toHaveBeenCalledTimes(1);
    expect(getCourseUnits).toHaveBeenCalledWith(1);
    expect(
      within(unitSelect)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Tüm üniteler", "İlk Çağ", "Boş Ünite"]);
  });

  it("offers to clear list filters when nothing matches, keeping the scope", async () => {
    const user = userEvent.setup();
    const client = createClient();
    seed(client);

    renderCenter({
      client,
      initial: {
        filters: { courseId: 1, difficulty: 1 },
        sort: DEFAULT_QUALITY_SORT,
      },
    });

    expect(
      await screen.findByText("Bu filtrelerle eşleşen soru bulunmuyor."),
    ).toBeDefined();

    await user.click(
      screen.getByRole("button", { name: "Liste filtrelerini temizle" }),
    );

    expect(lastState.filters).toEqual({ courseId: 1 });
    expect(await listItems()).toHaveLength(2);
  });

  it("shows the empty-scope message for a fully scanned scope with no questions", async () => {
    const client = createClient();
    seed(client, { units: [1], lists: [] });
    client.setQueryData(courseUnitsQueryKey(1), [
      qualityUnit(11, { exercise_count: 0 }),
    ]);

    renderCenter({
      client,
      initial: { filters: { courseId: 1 }, sort: DEFAULT_QUALITY_SORT },
    });

    expect(
      await screen.findByText("Taranan ünitelerde soru bulunmuyor."),
    ).toBeDefined();
  });
});

describe("QualityCenter scan", () => {
  it("reads course → unit → unfiltered exercise lists, skipping empty units", async () => {
    const user = userEvent.setup();

    renderCenter();

    await user.click(
      await screen.findByRole("button", { name: "Tara (3 ünite)" }),
    );

    expect(
      await screen.findByText("Tarama tamamlandı.", {}, { timeout: 5000 }),
    ).toBeDefined();
    expect(getCourseUnits.mock.calls.map(([id]) => id).sort()).toEqual([1, 2]);
    expect(getUnitExercises.mock.calls).toEqual([
      [10, {}],
      [20, {}],
    ]);
    expect(
      screen.getByText("3/3 ünite tarandı · 4 soru yüklendi"),
    ).toBeDefined();
    expect(await listItems()).toHaveLength(4);
  });

  it("does not re-request lists that are already fresh in the cache", async () => {
    const user = userEvent.setup();
    const client = createClient();
    seed(client, { units: [1], lists: [10] });

    renderCenter({ client });

    await user.click(
      await screen.findByRole("button", { name: "Kalanları tara (1 ünite)" }),
    );

    expect(
      await screen.findByText("Tarama tamamlandı.", {}, { timeout: 5000 }),
    ).toBeDefined();
    expect(getCourseUnits.mock.calls.map(([id]) => id)).toEqual([2]);
    expect(getUnitExercises.mock.calls).toEqual([[20, {}]]);
  });

  it("re-requests everything in scope when asked for current data", async () => {
    const user = userEvent.setup();
    const client = createClient();
    seed(client);

    renderCenter({
      client,
      initial: { filters: { courseId: 2 }, sort: DEFAULT_QUALITY_SORT },
    });

    await user.click(
      await screen.findByRole("button", {
        name: "Güncel verilerle yeniden tara",
      }),
    );

    expect(
      await screen.findByText("Tarama tamamlandı.", {}, { timeout: 5000 }),
    ).toBeDefined();
    expect(getCourseUnits.mock.calls).toEqual([[2]]);
    expect(getUnitExercises.mock.calls).toEqual([[20, {}]]);
  });

  it("scans only the selected unit", async () => {
    const user = userEvent.setup();
    const client = createClient();
    seed(client, { units: [1], lists: [] });

    renderCenter({
      client,
      initial: {
        filters: { courseId: 1, unitId: 10 },
        sort: DEFAULT_QUALITY_SORT,
      },
    });

    await user.click(
      await screen.findByRole("button", { name: "Tara (1 ünite)" }),
    );

    expect(
      await screen.findByText("Tarama tamamlandı.", {}, { timeout: 5000 }),
    ).toBeDefined();
    expect(getCourseUnits).not.toHaveBeenCalled();
    expect(getUnitExercises.mock.calls).toEqual([[10, {}]]);
    expect(await listItems()).toHaveLength(2);
  });

  it("reports a failed unit, keeps the rest and retries only the failure", async () => {
    const user = userEvent.setup();
    getUnitExercises.mockImplementation(async (unitId) => {
      if (unitId === 20) throw apiError("server", 500);
      return exercisesByUnit[unitId]!;
    });

    renderCenter();

    await user.click(
      await screen.findByRole("button", { name: "Tara (3 ünite)" }),
    );

    expect(
      await screen.findByText("1 liste okunamadı. Diğer sonuçlar listede."),
    ).toBeDefined();
    expect(await listItems()).toHaveLength(2);

    getUnitExercises.mockClear();
    getCourseUnits.mockClear();
    getUnitExercises.mockImplementation(
      async (unitId) => exercisesByUnit[unitId]!,
    );

    await user.click(
      screen.getByRole("button", { name: "Okunamayanları tekrar dene" }),
    );

    expect(
      await screen.findByText("Tarama tamamlandı.", {}, { timeout: 5000 }),
    ).toBeDefined();
    expect(getCourseUnits).not.toHaveBeenCalled();
    expect(getUnitExercises.mock.calls).toEqual([[20, {}]]);
    expect(await listItems()).toHaveLength(4);
  });

  it("redirects to login when the session expires mid-scan", async () => {
    const user = userEvent.setup();
    getUnitExercises.mockRejectedValue(apiError("authentication", 401));

    renderCenter();

    await user.click(
      await screen.findByRole("button", { name: "Tara (3 ünite)" }),
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("stops a running scan on request", async () => {
    const user = userEvent.setup();
    const pending: (() => void)[] = [];
    getUnitExercises.mockImplementation(
      (unitId) =>
        new Promise((resolve) => {
          pending.push(() => resolve(exercisesByUnit[unitId]!));
        }),
    );

    renderCenter();

    await user.click(
      await screen.findByRole("button", { name: "Tara (3 ünite)" }),
    );
    await screen.findByText(/Soru listeleri okunuyor/);
    const started = getUnitExercises.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Taramayı durdur" }));

    // The in-flight requests are aborted, not waited for.
    expect(
      await screen.findByText(
        "Tarama durduruldu. O ana kadar okunan sorular listede.",
      ),
    ).toBeDefined();

    for (const release of pending) release();
    await new Promise((done) => setTimeout(done, 10));
    expect(getUnitExercises).toHaveBeenCalledTimes(started);
  });
});
