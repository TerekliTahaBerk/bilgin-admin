/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type { AdminAccountsData } from "@/contracts/admin/workflows";
import {
  ADMIN_NOW,
  adminAccount,
  adminRoles,
  daysAgo,
} from "@/test/fixtures/admins";

const replace = vi.fn();
const refresh = vi.fn();
const getAdminAccounts = vi.fn<() => Promise<AdminAccountsData>>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));
vi.mock("@/features/workflows/workflow-client", () => ({
  getAdminAccounts: () => getAdminAccounts(),
}));

const { AdminSecurityCenter } =
  await import("@/features/workflows/admin-security-center");

function data(admins: AdminAccountsData["admins"]): AdminAccountsData {
  return { roles: adminRoles, admins };
}

const roster = data([
  adminAccount({
    id: "a",
    name: "Ayşe",
    role: "super_admin",
    last_login_at: daysAgo(2),
  }),
  adminAccount({
    id: "b",
    name: "Burak",
    role: "super_admin",
    last_login_at: daysAgo(95),
  }),
  adminAccount({ id: "c", name: "Cem", role: "content_editor" }),
  adminAccount({
    id: "d",
    name: "Deniz",
    role: "content_reviewer",
    last_login_at: daysAgo(45),
  }),
  adminAccount({
    id: "e",
    name: "Ece",
    is_active: false,
    last_login_at: daysAgo(400),
  }),
]);

function renderCenter() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AdminSecurityCenter />
    </QueryClientProvider>,
  );
}

function stat(label: string) {
  return screen.getByText(label, { selector: "dt" }).nextElementSibling!
    .textContent;
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(ADMIN_NOW);
  replace.mockReset();
  refresh.mockReset();
  getAdminAccounts.mockReset().mockResolvedValue(roster);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AdminSecurityCenter", () => {
  it("summarises accounts, logins and super admins", async () => {
    renderCenter();

    expect(await screen.findByText("Toplam yönetici")).toBeDefined();
    expect(stat("Toplam yönetici")).toBe("5");
    expect(stat("Aktif")).toBe("4");
    expect(stat("Pasif")).toBe("1");
    expect(stat("Hiç giriş yapmamış")).toBe("1");
    expect(stat("30+ gündür giriş yok")).toBe("2");
    expect(stat("60+ gündür giriş yok")).toBe("1");
    expect(stat("90+ gündür giriş yok")).toBe("1");
    expect(stat("Aktif süper yönetici")).toBe("2");
  });

  it("charts the role distribution with abilities", async () => {
    renderCenter();

    const chart = (await screen.findByRole("heading", { name: "Rol dağılımı" }))
      .parentElement!;
    expect(
      within(chart).getByLabelText("Süper Yönetici: 2 yönetici"),
    ).toBeDefined();
    expect(within(chart).getByText(/2 aktif · İçerik düzenleme/)).toBeDefined();
  });

  it("lists attention items, filtered by reason and threshold, linked to the account", async () => {
    const user = userEvent.setup();
    renderCenter();

    const section = (
      await screen.findByRole("heading", { name: "Dikkat gerektiren hesaplar" })
    ).closest("section")!;
    const reasons = () =>
      within(section)
        .getAllByRole("listitem")
        .map((item) => item.querySelector("p")!.textContent);

    expect(reasons()[0]).toMatch(/Cem · Hiç giriş yapmamış · uyarı/);
    expect(
      within(section)
        .getAllByRole("link", { name: "Hesabı düzenle" })[0]!
        .getAttribute("href"),
    ).toBe("/admins#admin-c");

    await user.click(
      within(section).getByRole("button", { name: /^Uzun süredir giriş yok/ }),
    );
    expect(reasons()).toEqual([expect.stringMatching(/^Burak/)]);

    await user.selectOptions(
      within(section).getByLabelText("Uzun süre eşiği"),
      "30",
    );
    expect(reasons()).toEqual([
      expect.stringMatching(/^Burak/),
      expect.stringMatching(/^Deniz/),
    ]);
  });

  it("labels policy notes as a local heuristic", async () => {
    getAdminAccounts.mockResolvedValue(
      data(
        Array.from({ length: 4 }, () =>
          adminAccount({ role: "super_admin", last_login_at: daysAgo(1) }),
        ),
      ),
    );
    renderCenter();

    const note = await screen.findByText(/4 aktif süper yönetici var/);
    expect(note.textContent).toMatch(/Yerel politika sezgiseli/);
    expect(screen.getByText(/backend'in bir kuralı değildir/)).toBeDefined();
  });

  it("shows no policy notes when none apply", async () => {
    getAdminAccounts.mockResolvedValue(
      data([
        adminAccount({ role: "super_admin", last_login_at: daysAgo(1) }),
        adminAccount({ role: "super_admin", last_login_at: daysAgo(1) }),
      ]),
    );
    renderCenter();

    await screen.findByText("Toplam yönetici");
    expect(
      screen.queryByRole("heading", { name: "Politika notları" }),
    ).toBeNull();
    // Two healthy super admins: listed for their privilege, never warned.
    expect(screen.queryByText(/· uyarı/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Yüksek yetkili (2)" }),
    ).toBeDefined();
  });

  it("shows a loading state, then an error with a retry", async () => {
    const user = userEvent.setup();
    getAdminAccounts.mockRejectedValueOnce({
      kind: "server",
      status: 500,
      message: "Sunucu hatası.",
    });
    renderCenter();

    expect(screen.getByText("Yönetici hesapları yükleniyor…")).toBeDefined();
    expect(
      await screen.findByText("Yönetici hesapları yüklenemedi"),
    ).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(await screen.findByText("Toplam yönetici")).toBeDefined();
  });

  it("shows a forbidden state without a retry", async () => {
    getAdminAccounts.mockRejectedValue({
      kind: "authorization",
      status: 403,
      message: "Yetki yok.",
    });
    renderCenter();

    expect(
      await screen.findByText("Bu bölüme erişim yetkiniz yok"),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: "Tekrar dene" })).toBeNull();
  });

  it("redirects to login when the session expires", async () => {
    getAdminAccounts.mockRejectedValue({
      kind: "authentication",
      status: 401,
      message: "Oturum doğrulanamadı.",
    });
    renderCenter();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
