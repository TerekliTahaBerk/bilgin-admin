/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import "@/test/dom-setup";

import { AdminsSubnav } from "@/features/workflows/admins-subnav";

describe("AdminsSubnav", () => {
  it("links both sections and marks the current one", () => {
    render(<AdminsSubnav current="security" />);

    const nav = screen.getByRole("navigation", { name: "Yönetici bölümleri" });
    const accounts = within(nav).getByRole("link", { name: "Hesaplar" });
    const security = within(nav).getByRole("link", { name: "Güvenlik" });

    expect(accounts.getAttribute("href")).toBe("/admins");
    expect(accounts.getAttribute("aria-current")).toBeNull();
    expect(security.getAttribute("href")).toBe("/admins/security");
    expect(security.getAttribute("aria-current")).toBe("page");
  });
});
