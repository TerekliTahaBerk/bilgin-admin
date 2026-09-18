/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type { SafeAdmin } from "@/contracts/admin/session";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("@/features/auth/session-client", () => ({
  getSession: vi.fn(async () => ({
    ok: false as const,
    error: { kind: "network" as const, status: null, message: "offline" },
  })),
  logoutSession: vi.fn(async () => ({ ok: true as const })),
}));

const { AppShell } = await import("@/components/app-shell/app-shell");

const editor: SafeAdmin = {
  id: "admin-id",
  name: "Taha Berk",
  email: "editor@example.test",
  role: "content_editor",
  roleLabel: "İçerik Editörü",
  abilities: {
    edit_content: true,
    publish_content: false,
    edit_curriculum: false,
    view_users: false,
  },
};

function renderShell(admin: SafeAdmin = editor) {
  return render(
    <AppShell initialAdmin={admin}>
      <p>panel content</p>
    </AppShell>,
  );
}

describe("AppShell identity", () => {
  it("renders the admin name and roleLabel as display data", () => {
    renderShell();

    expect(screen.getAllByText("Taha Berk").length).toBeGreaterThan(0);
    expect(screen.getAllByText("İçerik Editörü").length).toBeGreaterThan(0);
  });

  it("renders the page content inside a main landmark", () => {
    renderShell();

    const main = screen.getByRole("main");
    expect(main.textContent).toContain("panel content");
  });
});

describe("AppShell navigation", () => {
  it("renders only the real production route as the active page", () => {
    renderShell();

    const links = screen.getAllByRole("link", { name: "Ana Sayfa" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe("/");
      expect(link.getAttribute("aria-current")).toBe("page");
    }
  });

  it("renders no navigation entry for a route that does not exist yet", () => {
    renderShell();

    for (const absent of [
      "Dersler",
      "Üniteler",
      "Sorular",
      "Müfredat",
      "Yöneticiler",
      "Kullanıcılar",
    ]) {
      expect(screen.queryByRole("link", { name: absent })).toBeNull();
    }
  });

  it("shows the same navigation to an admin with no abilities at all", () => {
    renderShell({
      ...editor,
      role: "analyst",
      roleLabel: "Analist",
      abilities: {
        edit_content: false,
        publish_content: false,
        edit_curriculum: false,
        view_users: false,
      },
    });

    expect(
      screen.getAllByRole("link", { name: "Ana Sayfa" }).length,
    ).toBeGreaterThan(0);
  });
});

describe("AppShell mobile navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function menuToggle() {
    return screen.getByRole("button", { name: "Menüyü aç" });
  }

  it("keeps the drawer closed until the toggle is pressed", () => {
    renderShell();

    expect(menuToggle().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the drawer with navigation and logout inside", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(menuToggle());

    const drawer = await screen.findByRole("dialog", { name: "Panel menüsü" });
    expect(menuToggle().getAttribute("aria-expanded")).toBe("true");
    expect(drawer.textContent).toContain("Ana Sayfa");
    expect(drawer.textContent).toContain("Çıkış");
    expect(drawer.textContent).toContain("Taha Berk");
  });

  it("closes the drawer on Escape", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(menuToggle());
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(menuToggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("closes the drawer after following a navigation link", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(menuToggle());
    const drawer = await screen.findByRole("dialog");

    await user.click(within(drawer).getByRole("link", { name: "Ana Sayfa" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
