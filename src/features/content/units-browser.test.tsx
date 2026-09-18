/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type { Course, Unit } from "@/contracts/admin/content";
import type { ApiError } from "@/lib/api/error";
import {
  validCoursesResponse,
  validUnitsResponse,
} from "@/test/fixtures/courses-api";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

const getCourses = vi.fn<() => Promise<Course[]>>();
const getCourseUnits = vi.fn<(courseId: number) => Promise<Unit[]>>();

vi.mock("@/features/content/content-client", () => ({
  getCourses: () => getCourses(),
  getCourseUnits: (courseId: number) => getCourseUnits(courseId),
}));

const { UnitsBrowser } = await import("@/features/content/units-browser");

const courses = validCoursesResponse.data as Course[];
const units = validUnitsResponse.data as Unit[];
const COURSE_ID = courses[0]!.id;

function renderBrowser(courseId = COURSE_ID) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <UnitsBrowser courseId={courseId} />
    </QueryClientProvider>,
  );
}

function apiError(kind: ApiError["kind"], status: number | null): ApiError {
  return { kind, status, message: "Beklenmeyen bir hata oluştu." };
}

beforeEach(() => {
  getCourses.mockReset();
  getCourseUnits.mockReset();
  replace.mockReset();
  refresh.mockReset();
});

describe("UnitsBrowser data flow", () => {
  it("starts both queries without waiting for course metadata", async () => {
    let resolveCourses: ((value: Course[]) => void) | undefined;
    getCourses.mockImplementation(
      () =>
        new Promise<Course[]>((resolve) => {
          resolveCourses = resolve;
        }),
    );
    getCourseUnits.mockResolvedValue(units);

    renderBrowser();

    // The unit list renders while the course query is still in flight.
    expect(await screen.findByText("Tarih ve Zaman")).toBeDefined();
    expect(getCourseUnits).toHaveBeenCalledTimes(1);
    expect(getCourseUnits).toHaveBeenCalledWith(COURSE_ID);

    resolveCourses?.(courses);
    expect(await screen.findByText("TYT Türkçe")).toBeDefined();
  });

  it("requests the unit list exactly once for a course", async () => {
    getCourses.mockResolvedValue(courses);
    getCourseUnits.mockResolvedValue(units);

    renderBrowser();
    await screen.findByText("Tarih ve Zaman");

    expect(getCourseUnits).toHaveBeenCalledTimes(1);
    expect(getCourses).toHaveBeenCalledTimes(1);
  });
});

describe("UnitsBrowser loading", () => {
  it("announces loading before the units arrive", async () => {
    getCourses.mockImplementation(() => new Promise(() => {}));
    getCourseUnits.mockImplementation(() => new Promise(() => {}));

    renderBrowser();

    expect(await screen.findByText("Üniteler yükleniyor.")).toBeDefined();
  });
});

describe("UnitsBrowser success", () => {
  beforeEach(() => {
    getCourses.mockResolvedValue(courses);
    getCourseUnits.mockResolvedValue(units);
  });

  it("shows the course context from the courses cache", async () => {
    renderBrowser();

    expect(
      await screen.findByRole("heading", { name: "TYT Türkçe", level: 1 }),
    ).toBeDefined();
    expect(screen.getByText("tyt_turkce")).toBeDefined();
    expect(screen.getByText("TYT")).toBeDefined();
  });

  it("offers a way back to the course list", async () => {
    renderBrowser();

    const back = await screen.findByRole("link", { name: /derslere dön/i });

    expect(back.getAttribute("href")).toBe("/courses");
  });

  it("lists the units in backend order", async () => {
    const { container } = renderBrowser();

    await screen.findByText("Tarih ve Zaman");

    const titles = [...container.querySelectorAll("li p:first-child")].map(
      (node) => node.textContent,
    );

    expect(titles).toEqual([
      "İlk ve Orta Çağlarda Türk Dünyası",
      "Tarih ve Zaman",
      "Hazırlanıyor",
    ]);
  });

  it("labels status and access in Turkish", async () => {
    renderBrowser();

    await screen.findByText("Tarih ve Zaman");

    // "Yayında" appears on the course header badge too.
    expect(screen.getAllByText("Yayında").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("İncelemede")).toBeDefined();
    expect(screen.getByText("Taslak")).toBeDefined();
    expect(screen.getAllByText("Ücretsiz")).toHaveLength(2);
    expect(screen.getByText("Premium")).toBeDefined();
  });

  it("shows node and exercise counts", async () => {
    const { container } = renderBrowser();

    await screen.findByText("Tarih ve Zaman");

    const meta = [...container.querySelectorAll("li p:nth-child(2)")].map(
      (node) => node.textContent,
    );

    expect(meta[0]).toContain("6 adım");
    expect(meta[0]).toContain("44 soru");
    expect(meta[1]).toContain("4 adım");
    expect(meta[1]).toContain("12 soru");
  });

  it("shows a grade label only when the backend sent one", async () => {
    const { container } = renderBrowser();

    await screen.findByText("Tarih ve Zaman");

    const meta = [...container.querySelectorAll("li p:nth-child(2)")].map(
      (node) => node.textContent,
    );

    expect(meta[0]).toContain("9. sınıf");
    expect(meta[1]).toContain("12. sınıf");
    expect(meta[2]).not.toContain("sınıf");
    expect(meta[2]).not.toContain("—");
  });

  it("marks a unit with no exercises as awaiting questions", async () => {
    renderBrowser();

    await screen.findByText("Tarih ve Zaman");

    expect(screen.getByText(/Soru bekliyor/)).toBeDefined();
  });

  it("derives the summary from the units payload", async () => {
    const { container } = renderBrowser();

    await screen.findByText("Tarih ve Zaman");

    const summary = container.querySelector("dl")!;

    expect(summary.textContent).toContain("3");
    expect(summary.textContent).toContain("ünite");
    expect(summary.textContent).toContain("yayında");
    expect(summary.textContent).toContain("56");
    expect(summary.textContent).toContain("soru");
    expect(summary.textContent).toContain("10");
    expect(summary.textContent).toContain("adım");
  });

  it("makes no claim about whether a unit can be published", async () => {
    renderBrowser();

    await screen.findByText("Tarih ve Zaman");

    for (const claim of [
      /Yayınlanamaz/i,
      /Hazır değil/i,
      /Eksik \d+ soru/i,
      /yeterli soru/i,
    ]) {
      expect(document.body.textContent).not.toMatch(claim);
    }
  });
});

describe("UnitsBrowser has no write or next-step actions yet", () => {
  beforeEach(() => {
    getCourses.mockResolvedValue(courses);
    getCourseUnits.mockResolvedValue(units);
  });

  it("offers no publish, create or exercise navigation", async () => {
    renderBrowser();

    await screen.findByText("Tarih ve Zaman");

    for (const absent of [
      /Yayınla/,
      /Ünite Oluştur/,
      /Soruları gör/,
      /Yeni Soru/,
      /İçe Aktar/,
      /Düzenle/,
    ]) {
      expect(document.body.textContent).not.toMatch(absent);
    }
  });

  it("links each unit row to its exercise list without nesting a button", async () => {
    const { container } = renderBrowser();

    await screen.findByText("Tarih ve Zaman");

    const rows = [...container.querySelectorAll("li")];

    expect(rows).toHaveLength(units.length);
    for (const [index, row] of rows.entries()) {
      const link = row.querySelector("a");

      expect(link?.getAttribute("href")).toBe(
        `/courses/${COURSE_ID}/units/${units[index]!.id}`,
      );
      expect(row.querySelector("button")).toBeNull();
    }
  });

  it("gives each row link an accessible name carrying the unit title", async () => {
    renderBrowser();

    await screen.findByText("Tarih ve Zaman");

    const link = screen.getByRole("link", { name: /Tarih ve Zaman/ });

    expect(link.getAttribute("href")).toBe(
      `/courses/${COURSE_ID}/units/${units[1]!.id}`,
    );
  });

  it("links back to the course list and to each unit, nothing else", async () => {
    renderBrowser();

    await screen.findByText("Tarih ve Zaman");

    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual([
      "/courses",
      ...units.map((unit) => `/courses/${COURSE_ID}/units/${unit.id}`),
    ]);
  });
});

describe("UnitsBrowser empty", () => {
  it("shows a real empty state without a create action", async () => {
    getCourses.mockResolvedValue(courses);
    getCourseUnits.mockResolvedValue([]);

    renderBrowser();

    expect(
      await screen.findByText("Bu derste henüz ünite bulunmuyor."),
    ).toBeDefined();
    expect(document.body.textContent).not.toMatch(/Ünite Oluştur/);
  });
});

describe("UnitsBrowser errors", () => {
  it("says the course is missing when the backend answers 404", async () => {
    getCourses.mockResolvedValue(courses);
    getCourseUnits.mockRejectedValue(apiError("not_found", 404));

    renderBrowser();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Ders bulunamadı" }),
    ).toBeDefined();
    expect(screen.getByRole("status").textContent).toContain(
      "adres hatalı olabilir",
    );
    expect(replace).not.toHaveBeenCalled();
    // One back link, in the header — the state does not repeat it.
    expect(screen.getAllByRole("link", { name: /derslere dön/i })).toHaveLength(
      1,
    );
  });

  it("says the course is missing when it is absent from the course list", async () => {
    getCourses.mockResolvedValue(courses);
    getCourseUnits.mockResolvedValue([]);

    renderBrowser(999999);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Ders bulunamadı" }),
    ).toBeDefined();
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows a forbidden state without redirecting on 403", async () => {
    getCourses.mockResolvedValue(courses);
    getCourseUnits.mockRejectedValue(apiError("authorization", 403));

    renderBrowser();

    const alert = await screen.findByRole("alert");

    expect(alert.textContent).toContain("erişim yetkiniz yok");
    expect(screen.queryByRole("button", { name: "Tekrar dene" })).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows a safe error with a working retry action", async () => {
    getCourses.mockResolvedValue(courses);
    getCourseUnits.mockRejectedValueOnce(apiError("server", 502));
    getCourseUnits.mockResolvedValueOnce(units);
    const user = userEvent.setup();

    renderBrowser();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Üniteler yüklenemedi");
    expect(document.body.textContent).not.toMatch(/SQLSTATE|stack|TypeError/i);

    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));

    expect(await screen.findByText("Tarih ve Zaman")).toBeDefined();
  });

  it("redirects to the login page on 401", async () => {
    getCourses.mockResolvedValue(courses);
    getCourseUnits.mockRejectedValue(apiError("authentication", 401));

    renderBrowser();

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/login");
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
