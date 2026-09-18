/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type { SafeAdmin } from "@/contracts/admin/session";

const pathname = vi.fn<() => string>();

vi.mock("next/navigation", () => ({
  usePathname: () => pathname(),
}));

const { SidebarNav } = await import("@/components/app-shell/sidebar");

const admin: SafeAdmin = {
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

function currentPage() {
  return screen
    .queryAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page")
    .map((link) => link.getAttribute("href"));
}

describe("SidebarNav active state", () => {
  it("marks the home item only on the root path", () => {
    pathname.mockReturnValue("/");
    render(<SidebarNav admin={admin} />);

    expect(currentPage()).toEqual(["/"]);
  });

  it("marks the content item on /courses", () => {
    pathname.mockReturnValue("/courses");
    render(<SidebarNav admin={admin} />);

    expect(currentPage()).toEqual(["/courses"]);
  });

  it("keeps the content item active on a nested content route", () => {
    // Units land under /courses/<id> in a later step; the item must not go
    // inactive the moment that route exists.
    pathname.mockReturnValue("/courses/12");
    render(<SidebarNav admin={admin} />);

    expect(currentPage()).toEqual(["/courses"]);
  });

  it("does not mark home active on a nested route", () => {
    pathname.mockReturnValue("/courses/12");
    render(<SidebarNav admin={admin} />);

    expect(currentPage()).not.toContain("/");
  });
});
