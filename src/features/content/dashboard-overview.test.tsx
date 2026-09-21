/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type { Course } from "@/contracts/admin/content";
import type { ApiError } from "@/lib/api/error";
import { createSafeAdmin } from "@/test/fixtures/safe-admin";
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

const { DashboardOverview } =
  await import("@/features/content/dashboard-overview");

const courses = validCoursesResponse.data as Course[];

function renderDashboard(
  admin = createSafeAdmin({ edit_content: true, edit_curriculum: true }),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardOverview admin={admin} />
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

describe("DashboardOverview loading", () => {
  it("announces loading before the data arrives", async () => {
    getCourses.mockImplementation(() => new Promise(() => {}));

    renderDashboard();

    expect(await screen.findByText("Panel özeti yükleniyor.")).toBeDefined();
  });
});

describe("DashboardOverview success", () => {
  beforeEach(() => {
    getCourses.mockResolvedValue(courses);
  });

  it("derives every stat from the courses payload alone", async () => {
    renderDashboard();

    const summary = await screen.findByLabelText("Panel özeti");

    // 4 courses, 1 published, 3 total units (2 + 0 + 1 + 0), 2 awaiting content.
    expect(summary.textContent).toContain("4");
    expect(summary.textContent).toContain("Ders");
    expect(summary.textContent).toContain("1");
    expect(summary.textContent).toContain("Yayında");
    expect(summary.textContent).toContain("3");
    expect(summary.textContent).toContain("Ünite");
    expect(summary.textContent).toContain("2");
    expect(summary.textContent).toContain("İçerik bekleyen ders");
  });

  it("lists courses awaiting content or sitting in review as attention items", async () => {
    renderDashboard();

    await screen.findByText("Dikkat gerektirenler");

    // tyt_matematik (0 units) and ydt_ingilizce (0 units) await content;
    // ayt_fizik is in review. Published tyt_turkce is not attention-worthy.
    expect(screen.getByText("TYT Temel Matematik")).toBeDefined();
    expect(screen.getByText("YDT İngilizce")).toBeDefined();
    expect(screen.getByText("AYT Fizik")).toBeDefined();
    expect(screen.queryByText("TYT Türkçe")).toBeNull();
    expect(screen.getByText("(3)")).toBeDefined();
  });

  it("shows no attention section when nothing needs it", async () => {
    getCourses.mockResolvedValue([
      { ...courses[0], status: "published", unit_count: 2 },
    ]);

    renderDashboard();

    await screen.findByLabelText("Panel özeti");

    expect(screen.getByText("Dikkat gerektiren ders yok")).toBeDefined();
    expect(screen.queryByText("Dikkat gerektirenler")).toBeNull();
  });

  it("shows only the quick links the admin's abilities allow", async () => {
    renderDashboard(createSafeAdmin({}));

    await screen.findByLabelText("Panel özeti");

    const quickLinks = screen.getByLabelText("Hızlı erişim");

    expect(quickLinks.textContent).toContain("İçerik");
    expect(quickLinks.textContent).not.toContain("JSON İçe Aktar");
    expect(quickLinks.textContent).not.toContain("Müfredat");
    expect(quickLinks.textContent).not.toContain("Yöneticiler");
  });

  it("shows every gated quick link once the admin can use it", async () => {
    renderDashboard(
      createSafeAdmin({ edit_content: true, edit_curriculum: true }),
    );

    const quickLinks = await screen.findByLabelText("Hızlı erişim");

    expect(quickLinks.textContent).toContain("JSON İçe Aktar");
    expect(quickLinks.textContent).toContain("Müfredat");
    expect(quickLinks.textContent).toContain("Yöneticiler");
  });
});

describe("DashboardOverview empty", () => {
  it("shows a real empty state rather than invented stats", async () => {
    getCourses.mockResolvedValue([]);

    renderDashboard();

    expect(await screen.findByText("Henüz ders bulunmuyor.")).toBeDefined();
    expect(screen.queryByLabelText("Panel özeti")).toBeNull();
  });
});

describe("DashboardOverview errors", () => {
  it("shows a safe error with a working retry action", async () => {
    getCourses.mockRejectedValueOnce(apiError("server", 502));
    getCourses.mockResolvedValueOnce(courses);
    const user = userEvent.setup();

    renderDashboard();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Özet yüklenemedi");
    expect(document.body.textContent).not.toMatch(/SQLSTATE|stack|TypeError/i);

    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));

    await screen.findByLabelText("Panel özeti");
  });

  it("shows a forbidden state without redirecting on 403", async () => {
    getCourses.mockRejectedValue(apiError("authorization", 403));

    renderDashboard();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("erişim yetkiniz yok");
    expect(screen.queryByRole("button", { name: "Tekrar dene" })).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects to the login page on 401 instead of rendering an error", async () => {
    getCourses.mockRejectedValue(apiError("authentication", 401));

    renderDashboard();

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/login");
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
