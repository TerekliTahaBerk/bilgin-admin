/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type { Course } from "@/contracts/admin/content";
import type { ApiError } from "@/lib/api/error";
import { validCoursesResponse } from "@/test/fixtures/courses-api";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

const getCourses = vi.fn<() => Promise<Course[]>>();

vi.mock("@/features/content/content-client", () => ({
  getCourses: () => getCourses(),
}));

const { CoursesBrowser } = await import("@/features/content/courses-browser");

const courses = validCoursesResponse.data as Course[];

function renderBrowser() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <CoursesBrowser />
    </QueryClientProvider>,
  );
}

function apiError(kind: ApiError["kind"], status: number | null): ApiError {
  return { kind, status, message: "Beklenmeyen bir hata oluştu." };
}

beforeEach(() => {
  getCourses.mockReset();
  replace.mockReset();
  refresh.mockReset();
});

describe("CoursesBrowser loading", () => {
  it("announces loading before the data arrives", async () => {
    getCourses.mockImplementation(() => new Promise(() => {}));

    renderBrowser();

    expect(await screen.findByText("Dersler yükleniyor.")).toBeDefined();
  });
});

describe("CoursesBrowser success", () => {
  beforeEach(() => {
    getCourses.mockResolvedValue(courses);
  });

  it("groups courses under their scope headings in backend order", async () => {
    renderBrowser();

    await screen.findByRole("heading", { name: /TYT/ });

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);

    expect(headings[0]).toContain("TYT");
    expect(headings[1]).toContain("AYT");
    expect(headings[2]).toContain("YDT");
    expect(headings).toHaveLength(3);
  });

  it("renders no group for a scope with no courses", async () => {
    renderBrowser();

    await screen.findByRole("heading", { name: /TYT/ });

    for (const absent of ["LGS", "KPSS", "ALES", "YDS"]) {
      expect(screen.queryByRole("heading", { name: absent })).toBeNull();
    }
  });

  it("shows the course name, code and unit count", async () => {
    renderBrowser();

    expect(await screen.findByText("TYT Türkçe")).toBeDefined();
    expect(screen.getByText("tyt_turkce")).toBeDefined();
    expect(screen.getByText("2 ünite")).toBeDefined();
  });

  it("labels every backend status in Turkish, review included", async () => {
    renderBrowser();

    expect(await screen.findByText("Yayında")).toBeDefined();
    expect(screen.getByText("Taslak")).toBeDefined();
    expect(screen.getByText("İncelemede")).toBeDefined();
    expect(screen.getByText("Arşiv")).toBeDefined();
  });

  it("marks a course with no units as awaiting content", async () => {
    renderBrowser();

    await screen.findByText("TYT Türkçe");

    expect(screen.getAllByText("İçerik bekliyor")).toHaveLength(2);
  });

  it("derives the summary from the payload", async () => {
    const { container } = renderBrowser();

    await screen.findByText("TYT Türkçe");

    const summary = container.querySelector("dl")!;

    expect(within(summary).getByText("4")).toBeDefined();
    expect(within(summary).getByText("1")).toBeDefined();
    expect(within(summary).getByText("3")).toBeDefined();
    expect(summary.textContent).toContain("ders");
    expect(summary.textContent).toContain("yayında");
    expect(summary.textContent).toContain("ünite");
  });

  it("shows no exercise total, which the endpoint does not report", async () => {
    renderBrowser();

    await screen.findByText("TYT Türkçe");

    expect(document.body.textContent).not.toMatch(/soru/i);
  });

  it("links each course row to its unit list", async () => {
    renderBrowser();

    await screen.findByText("TYT Türkçe");

    const links = screen.getAllByRole("link");

    expect(links).toHaveLength(courses.length);
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      courses.map((course) => `/courses/${course.id}`),
    );
  });

  it("gives each row link an accessible name carrying the course", async () => {
    renderBrowser();

    await screen.findByText("TYT Türkçe");

    const [first] = screen.getAllByRole("link");

    expect(first.textContent).toContain("TYT Türkçe");
    expect(first.tagName).toBe("A");
  });

  it("nests no button inside a row link and offers no write action", async () => {
    renderBrowser();

    await screen.findByText("TYT Türkçe");

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    for (const absent of [/Yayınla/, /Ünite Oluştur/, /Düzenle/, /Yeni/]) {
      expect(document.body.textContent).not.toMatch(absent);
    }
  });
});

describe("CoursesBrowser empty", () => {
  it("shows a real empty state rather than invented courses", async () => {
    getCourses.mockResolvedValue([]);

    renderBrowser();

    expect(await screen.findByText("Henüz ders bulunmuyor.")).toBeDefined();
    expect(screen.queryByRole("heading", { name: /TYT/ })).toBeNull();
  });
});

describe("CoursesBrowser errors", () => {
  it("shows a safe error with a working retry action", async () => {
    getCourses.mockRejectedValueOnce(apiError("server", 502));
    getCourses.mockResolvedValueOnce(courses);
    const user = userEvent.setup();

    renderBrowser();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Dersler yüklenemedi");
    expect(document.body.textContent).not.toMatch(/SQLSTATE|stack|TypeError/i);

    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));

    expect(await screen.findByText("TYT Türkçe")).toBeDefined();
  });

  it("shows a forbidden state without redirecting on 403", async () => {
    getCourses.mockRejectedValue(apiError("authorization", 403));

    renderBrowser();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("erişim yetkiniz yok");
    expect(screen.queryByRole("button", { name: "Tekrar dene" })).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects to the login page on 401 instead of rendering an error", async () => {
    getCourses.mockRejectedValue(apiError("authentication", 401));

    renderBrowser();

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/login");
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
