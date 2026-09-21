/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type { Course, Unit } from "@/contracts/admin/content";
import type { AdminAccountsData } from "@/contracts/admin/workflows";
import type { ApiError } from "@/lib/api/error";
import {
  validCoursesResponse,
  validUnitsResponse,
} from "@/test/fixtures/courses-api";
import { createSafeAdmin } from "@/test/fixtures/safe-admin";

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

const getAdminAccounts = vi.fn<() => Promise<AdminAccountsData>>();

vi.mock("@/features/workflows/workflow-client", () => ({
  getAdminAccounts: () => getAdminAccounts(),
}));

const { AnalyticsDashboard } =
  await import("@/features/analytics/analytics-dashboard");

const courses = validCoursesResponse.data as Course[];
const units = validUnitsResponse.data as Unit[];

const adminRoster: AdminAccountsData = {
  roles: [
    {
      value: "super_admin",
      label: "Süper Yönetici",
      abilities: {
        edit_content: true,
        publish_content: true,
        edit_curriculum: true,
        view_users: true,
      },
    },
    {
      value: "content_editor",
      label: "İçerik Editörü",
      abilities: {
        edit_content: true,
        publish_content: false,
        edit_curriculum: false,
        view_users: false,
      },
    },
  ],
  admins: [
    {
      id: "1",
      name: "Ada",
      email: "ada@test.com",
      role: "super_admin",
      role_label: "Süper Yönetici",
      is_active: true,
      last_login_at: null,
    },
    {
      id: "2",
      name: "Beril",
      email: "beril@test.com",
      role: "content_editor",
      role_label: "İçerik Editörü",
      is_active: false,
      last_login_at: null,
    },
  ],
};

function renderDashboard(admin = createSafeAdmin({ edit_curriculum: true })) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AnalyticsDashboard admin={admin} />
    </QueryClientProvider>,
  );
}

function apiError(kind: ApiError["kind"], status: number | null): ApiError {
  return { kind, status, message: "Beklenmeyen bir hata oluştu." };
}

beforeEach(() => {
  getCourses.mockReset();
  getCourseUnits.mockReset();
  getAdminAccounts.mockReset();
  replace.mockReset();
  refresh.mockReset();
});

describe("AnalyticsDashboard loading and empty states", () => {
  it("shows a loading placeholder before the courses arrive", () => {
    getCourses.mockImplementation(() => new Promise(() => {}));

    renderDashboard();

    expect(screen.getByText("Yükleniyor.")).toBeDefined();
  });

  it("shows a real empty state with no courses, never invented charts", async () => {
    getCourses.mockResolvedValue([]);

    renderDashboard();

    expect(await screen.findByText("Henüz ders bulunmuyor.")).toBeDefined();
  });

  it("redirects to login on an expired session instead of rendering an error", async () => {
    getCourses.mockRejectedValue(apiError("authentication", 401));

    renderDashboard();

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/login");
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows a safe error with a working retry action", async () => {
    getCourses.mockRejectedValueOnce(apiError("server", 502));
    getCourses.mockResolvedValueOnce(courses);
    getCourseUnits.mockResolvedValue(units);
    const user = userEvent.setup();

    renderDashboard();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Veri yüklenemedi");

    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));

    await screen.findByText("İçerik genel bakış");
  });
});

describe("AnalyticsDashboard content overview", () => {
  beforeEach(() => {
    getCourses.mockResolvedValue(courses);
    getCourseUnits.mockResolvedValue(units);
  });

  it("charts scope, publish status and unit counts from the courses payload alone", async () => {
    renderDashboard();

    await screen.findByText("İçerik genel bakış");

    expect(screen.getByText("Scope'a göre ders sayısı")).toBeDefined();
    expect(screen.getByText("Ders yayın durumu dağılımı")).toBeDefined();
    expect(screen.getByText("Derse göre ünite sayısı")).toBeDefined();
  });

  it("does not fetch admin data when the admin cannot manage curriculum", async () => {
    renderDashboard(createSafeAdmin({}));

    await screen.findByText("İçerik genel bakış");

    expect(screen.queryByText("Yönetici özeti")).toBeNull();
    expect(getAdminAccounts).not.toHaveBeenCalled();
  });
});

describe("AnalyticsDashboard course drilldown", () => {
  beforeEach(() => {
    getCourses.mockResolvedValue(courses);
  });

  it("fetches units only for the first course by default, not every course", async () => {
    getCourseUnits.mockResolvedValue(units);

    renderDashboard();

    await screen.findByText("Üniteye göre soru sayısı");

    expect(getCourseUnits).toHaveBeenCalledTimes(1);
    expect(getCourseUnits).toHaveBeenCalledWith(courses[0]!.id);
  });

  it("refetches units for the newly selected course only", async () => {
    getCourseUnits.mockResolvedValue(units);
    const user = userEvent.setup();

    renderDashboard();

    await screen.findByText("Üniteye göre soru sayısı");
    getCourseUnits.mockClear();

    const select = screen.getByLabelText("Ders seç");
    await user.selectOptions(select, String(courses[2]!.id));

    await waitFor(() => {
      expect(getCourseUnits).toHaveBeenCalledWith(courses[2]!.id);
    });
  });

  it("shows a no-units message instead of empty charts", async () => {
    getCourseUnits.mockResolvedValue([]);

    renderDashboard();

    expect(await screen.findByText("Bu derste henüz ünite yok.")).toBeDefined();
  });
});

describe("AnalyticsDashboard admin roster", () => {
  beforeEach(() => {
    getCourses.mockResolvedValue(courses);
    getCourseUnits.mockResolvedValue(units);
  });

  it("shows role and active/inactive counts when the admin can manage curriculum", async () => {
    getAdminAccounts.mockResolvedValue(adminRoster);

    renderDashboard(createSafeAdmin({ edit_curriculum: true }));

    const rosterTitle = await screen.findByText("Role göre yönetici sayısı");
    const section = rosterTitle.closest("section")!;

    expect(within(section).getByText("2")).toBeDefined(); // total
    expect(
      within(section).getByText("Role göre yönetici sayısı"),
    ).toBeDefined();
  });

  it("shows a forbidden state for the roster section without redirecting", async () => {
    getAdminAccounts.mockRejectedValue(apiError("authorization", 403));

    renderDashboard(createSafeAdmin({ edit_curriculum: true }));

    await screen.findByText("İçerik genel bakış");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("erişim yetkiniz yok");
    expect(replace).not.toHaveBeenCalled();
  });
});
