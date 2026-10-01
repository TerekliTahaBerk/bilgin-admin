/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type {
  Course,
  Unit,
  UnitExercisesData,
} from "@/contracts/admin/content";
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

const { ContentScanProvider } =
  await import("@/features/content/content-scan-provider");
const { ContentScanCenter, formatScanTime } =
  await import("@/features/content/content-scan-center");

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

function renderCenter() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ContentScanProvider>
        <ContentScanCenter />
      </ContentScanProvider>
    </QueryClientProvider>,
  );
}

function stat(region: HTMLElement, label: string) {
  return within(region).getByText(label, { selector: "dt" }).nextElementSibling
    ?.textContent;
}

async function startAndFinish(
  user: ReturnType<typeof userEvent.setup>,
  done = "Tarama eksiksiz tamamlandı.",
) {
  await user.click(screen.getByRole("button", { name: "Taramayı başlat" }));
  expect(await screen.findByText(done, {}, { timeout: 5000 })).toBeDefined();
}

beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
  getCourses.mockReset().mockResolvedValue(courses);
  getCourseUnits
    .mockReset()
    .mockImplementation(async (courseId) => unitsByCourse[courseId]!);
  getUnitExercises
    .mockReset()
    .mockImplementation(async (unitId) => listsByUnit[unitId]!);
});

describe("ContentScanCenter", () => {
  it("starts with no result and sends nothing on its own", async () => {
    renderCenter();

    expect(
      screen.getByText("Bu oturumda henüz eksiksiz bir tarama yapılmadı."),
    ).toBeDefined();
    expect(screen.getByText("Henüz tarama sonucu yok.")).toBeDefined();
    expect(
      screen.getByText(/Sonuç yalnızca bu oturumun belleğinde/),
    ).toBeDefined();
    await new Promise((done) => setTimeout(done, 5));
    expect(getCourses).not.toHaveBeenCalled();
  });

  it("shows the phase, counts and completion while scanning", async () => {
    const user = userEvent.setup();
    const pending: (() => void)[] = [];
    getUnitExercises.mockImplementation(
      (unitId) =>
        new Promise((resolve) => {
          pending.push(() => resolve(listsByUnit[unitId]!));
        }),
    );

    renderCenter();
    await user.click(screen.getByRole("button", { name: "Taramayı başlat" }));

    const progress = await screen.findByRole("region", {
      name: "Tarama sürüyor",
    });
    await within(progress).findByText("Soru listeleri okunuyor");
    expect(stat(progress, "Toplam ders")).toBe("2");
    expect(stat(progress, "Taranan ders")).toBe("2");
    expect(stat(progress, "Toplam ünite")).toBe("3");
    expect(stat(progress, "Taranan ünite")).toBe("0");
    expect(stat(progress, "Bulunan soru")).toBe("0");
    // 1 course list + 2 unit lists done of 1 + 2 + 3 requests.
    expect(stat(progress, "Tamamlanma")).toBe("%50");
    const bar = within(progress).getByRole("progressbar", {
      name: "Tarama ilerlemesi",
    });
    expect(bar.getAttribute("aria-valuenow")).toBe("50");
    expect(
      screen.getByRole("button", { name: "Taramayı iptal et" }),
    ).toBeDefined();

    for (const release of pending.splice(0)) release();

    expect(
      await screen.findByText("Tarama eksiksiz tamamlandı."),
    ).toBeDefined();
  });

  it("shows the result, the last full scan time and a re-scan action", async () => {
    const user = userEvent.setup();
    renderCenter();

    await startAndFinish(user);

    const result = screen.getByRole("region", { name: "Tarama sonucu" });
    expect(stat(result, "Ders")).toBe("2");
    expect(stat(result, "Ünite")).toBe("3");
    expect(stat(result, "Soru")).toBe("3");
    expect(stat(result, "Okunamayan liste")).toBe("0");

    const table = within(result).getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      "TYT Tarih220",
      "AYT Fizik110",
    ]);
    expect(
      within(table)
        .getByRole("link", { name: "TYT Tarih" })
        .getAttribute("href"),
    ).toBe("/quality?course=1");

    const status = screen.getByRole("region", { name: "Son tam tarama" });
    const time = status.querySelector("time");
    expect(time?.textContent).toBe(
      formatScanTime(time?.getAttribute("dateTime") ?? ""),
    );

    getCourses.mockClear();
    await user.click(screen.getByRole("button", { name: "Yeniden tara" }));
    expect(
      await screen.findByText("Tarama eksiksiz tamamlandı."),
    ).toBeDefined();
    // A re-scan asks the backend again rather than reusing the cache.
    expect(getCourses).toHaveBeenCalledTimes(1);
  });

  it("names partial failures, marks the result incomplete and retries just them", async () => {
    const user = userEvent.setup();
    getCourseUnits.mockImplementation(async (courseId) => {
      if (courseId === 2) throw serverError;
      return unitsByCourse[courseId]!;
    });
    getUnitExercises.mockImplementation(async (unitId) => {
      if (unitId === 11) throw serverError;
      return listsByUnit[unitId]!;
    });

    renderCenter();
    await startAndFinish(
      user,
      "Tarama tamamlandı ama bazı listeler okunamadı; sonuçlar eksik.",
    );

    const failures = screen.getByRole("region", { name: "2 liste okunamadı" });
    expect(
      within(failures).getByText(
        "AYT Fizik — ünite listesi okunamadı: Sunucu hatası oluştu.",
      ),
    ).toBeDefined();
    expect(
      within(failures).getByText(
        "TYT Tarih › Zaman — soru listesi okunamadı: Sunucu hatası oluştu.",
      ),
    ).toBeDefined();
    expect(
      screen.getByText("Bu oturumda henüz eksiksiz bir tarama yapılmadı."),
    ).toBeDefined();
    expect(screen.getByText(/eksik tamamlandı\./)).toBeDefined();
    expect(
      stat(
        screen.getByRole("region", { name: "Tarama sonucu" }),
        "Okunamayan liste",
      ),
    ).toBe("2");

    getCourses.mockClear();
    getCourseUnits
      .mockClear()
      .mockImplementation(async (courseId) => unitsByCourse[courseId]!);
    getUnitExercises
      .mockClear()
      .mockImplementation(async (unitId) => listsByUnit[unitId]!);

    await user.click(
      within(failures).getByRole("button", {
        name: "Başarısız olanları tekrar dene",
      }),
    );

    expect(
      await screen.findByText(
        "Tekrar deneme tamamlandı; tarama artık eksiksiz.",
      ),
    ).toBeDefined();
    expect(getCourses).not.toHaveBeenCalled();
    expect(getCourseUnits.mock.calls.map(([id]) => id)).toEqual([2]);
    expect(
      screen.queryByRole("region", { name: /liste okunamadı/ }),
    ).toBeNull();
  });

  it("explains a failed course list and retries the whole scan", async () => {
    const user = userEvent.setup();
    getCourses.mockRejectedValueOnce(serverError);

    renderCenter();
    await startAndFinish(
      user,
      "Ders listesi okunamadığı için tarama yapılamadı.",
    );

    expect(
      screen.getByText("Ders listesi okunamadı: Sunucu hatası oluştu."),
    ).toBeDefined();

    await user.click(
      screen.getByRole("button", { name: "Başarısız olanları tekrar dene" }),
    );

    expect(
      await screen.findByText("Tarama eksiksiz tamamlandı."),
    ).toBeDefined();
  });

  it("cancels a running scan and keeps the earlier result", async () => {
    const user = userEvent.setup();
    renderCenter();
    await startAndFinish(user);

    getUnitExercises.mockImplementation(
      (_unitId, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );

    await user.click(screen.getByRole("button", { name: "Yeniden tara" }));
    await screen.findByText("Soru listeleri okunuyor");
    await user.click(screen.getByRole("button", { name: "Taramayı iptal et" }));

    expect(
      await screen.findByText(
        "Tarama iptal edildi. Önceki tarama sonucu (varsa) korunuyor.",
      ),
    ).toBeDefined();
    expect(
      stat(screen.getByRole("region", { name: "Tarama sonucu" }), "Soru"),
    ).toBe("3");
  });

  it("explains a rate-limit stop", async () => {
    const user = userEvent.setup();
    getCourseUnits.mockRejectedValue({
      kind: "rate_limit",
      status: 429,
      message: "Çok fazla istek.",
      retryAfterSeconds: 30,
    });

    renderCenter();
    await user.click(screen.getByRole("button", { name: "Taramayı başlat" }));

    expect(
      await screen.findByText(/30 saniye sonra yeniden tarayın\./),
    ).toBeDefined();
  });

  it("explains a rate-limit stop without a wait time", async () => {
    const user = userEvent.setup();
    getCourseUnits.mockRejectedValue({
      kind: "rate_limit",
      status: 429,
      message: "Çok fazla istek.",
    });

    renderCenter();
    await user.click(screen.getByRole("button", { name: "Taramayı başlat" }));

    expect(
      await screen.findByText(/Bir süre sonra yeniden tarayın\./),
    ).toBeDefined();
  });

  it("redirects to login when the session expires mid-scan", async () => {
    const user = userEvent.setup();
    getUnitExercises.mockRejectedValue({
      kind: "authentication",
      status: 401,
      message: "Oturum doğrulanamadı.",
    });

    renderCenter();
    await user.click(screen.getByRole("button", { name: "Taramayı başlat" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(refresh).toHaveBeenCalled();
  });
});
