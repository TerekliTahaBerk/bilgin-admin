import { describe, expect, it } from "vitest";

import {
  adminNavigation,
  filterNavigation,
  type NavigationItem,
} from "@/lib/authz/navigation";
import { createSafeAdmin } from "@/test/fixtures/safe-admin";

// Fixtures only — these routes are intentionally absent from the production
// registry, which may list existing routes alone.
const fixtureItems: readonly NavigationItem[] = [
  { id: "always", label: "Her Zaman", href: "/always-test" },
  {
    id: "edit",
    label: "Düzenle",
    href: "/edit-test",
    requiredAbility: "edit_content",
  },
  {
    id: "publish",
    label: "Yayınla",
    href: "/publish-test",
    requiredAbility: "publish_content",
  },
];

const productionNavigation = [
  { id: "home", label: "Ana Sayfa", href: "/" },
  { id: "content", label: "İçerik", href: "/courses" },
];

describe("adminNavigation", () => {
  it("lists only routes that exist today", () => {
    expect(adminNavigation).toEqual(productionNavigation);
  });

  it("requires no ability for any production item", () => {
    expect(
      adminNavigation.every((item) => item.requiredAbility === undefined),
    ).toBe(true);
  });

  it("stays fully visible to an admin with no abilities at all", () => {
    const admin = createSafeAdmin({
      edit_content: false,
      publish_content: false,
      edit_curriculum: false,
      view_users: false,
    });

    expect(filterNavigation(adminNavigation, admin)).toEqual(
      productionNavigation,
    );
  });

  it("shows the content item regardless of the role name", () => {
    for (const role of ["content_editor", "content_reviewer", "analyst"]) {
      const visible = filterNavigation(
        adminNavigation,
        createSafeAdmin({}, { role }),
      );

      expect(visible.map((item) => item.href)).toContain("/courses");
    }
  });
});

describe("filterNavigation", () => {
  it("keeps items without a required ability", () => {
    const visible = filterNavigation(fixtureItems, createSafeAdmin());

    expect(visible.map((item) => item.id)).toEqual(["always"]);
  });

  it("keeps an item whose required ability is granted", () => {
    const admin = createSafeAdmin(
      { edit_content: true },
      { role: "content_editor" },
    );

    expect(
      filterNavigation(fixtureItems, admin).map((item) => item.id),
    ).toEqual(["always", "edit"]);
  });

  it("hides an item whose required ability is denied", () => {
    const admin = createSafeAdmin(
      { publish_content: true },
      { role: "content_reviewer" },
    );

    expect(
      filterNavigation(fixtureItems, admin).map((item) => item.id),
    ).toEqual(["always", "publish"]);
  });

  it("follows the snapshot even when the role name suggests full access", () => {
    const admin = createSafeAdmin(
      { edit_content: false, publish_content: false },
      { role: "super_admin", roleLabel: "Süper Yönetici" },
    );

    expect(
      filterNavigation(fixtureItems, admin).map((item) => item.id),
    ).toEqual(["always"]);
  });

  it("does not mutate the input array", () => {
    const admin = createSafeAdmin({ edit_content: true });
    const snapshot = structuredClone(fixtureItems);

    const visible = filterNavigation(fixtureItems, admin);

    expect(fixtureItems).toEqual(snapshot);
    expect(visible).not.toBe(fixtureItems);
  });

  it("returns an empty list for an empty registry", () => {
    expect(filterNavigation([], createSafeAdmin())).toEqual([]);
  });
});
