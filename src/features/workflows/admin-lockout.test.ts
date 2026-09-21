import { describe, expect, it } from "vitest";

import type { AdminAccountsData } from "@/contracts/admin/workflows";
import {
  otherActiveManagerCount,
  wouldDemoteSoloManager,
  wouldLeaveSoloManager,
} from "@/features/workflows/admin-lockout";

const roles: AdminAccountsData["roles"] = [
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
];

function admin(overrides: Partial<AdminAccountsData["admins"][number]>) {
  return {
    id: "id-1",
    name: "Ad Soyad",
    email: "a@example.test",
    role: "super_admin",
    role_label: "Süper Yönetici",
    is_active: true,
    last_login_at: null,
    ...overrides,
  } as AdminAccountsData["admins"][number];
}

describe("otherActiveManagerCount", () => {
  it("counts active managers excluding the given ids", () => {
    const admins = [
      admin({ id: "a", role: "super_admin" }),
      admin({ id: "b", role: "super_admin" }),
      admin({ id: "c", role: "content_editor" }),
    ];

    expect(otherActiveManagerCount(admins, roles, ["a"])).toBe(1);
    expect(otherActiveManagerCount(admins, roles, ["a", "b"])).toBe(0);
  });

  it("does not count an inactive manager", () => {
    const admins = [
      admin({ id: "a", role: "super_admin" }),
      admin({ id: "b", role: "super_admin", is_active: false }),
    ];

    expect(otherActiveManagerCount(admins, roles, ["a"])).toBe(0);
  });
});

describe("wouldLeaveSoloManager", () => {
  it("is true when deactivating the target leaves only the actor", () => {
    const admins = [
      admin({ id: "actor", role: "super_admin" }),
      admin({ id: "target", role: "super_admin" }),
    ];

    expect(
      wouldLeaveSoloManager(
        admins,
        roles,
        admin({ id: "target", role: "super_admin" }),
        "actor",
      ),
    ).toBe(true);
  });

  it("is false when a third manager remains", () => {
    const admins = [
      admin({ id: "actor", role: "super_admin" }),
      admin({ id: "target", role: "super_admin" }),
      admin({ id: "third", role: "super_admin" }),
    ];

    expect(
      wouldLeaveSoloManager(
        admins,
        roles,
        admin({ id: "target", role: "super_admin" }),
        "actor",
      ),
    ).toBe(false);
  });

  it("is false for a non-manager target", () => {
    const admins = [
      admin({ id: "actor", role: "super_admin" }),
      admin({ id: "target", role: "content_editor" }),
    ];

    expect(
      wouldLeaveSoloManager(
        admins,
        roles,
        admin({ id: "target", role: "content_editor" }),
        "actor",
      ),
    ).toBe(false);
  });
});

describe("wouldDemoteSoloManager", () => {
  it("is true when demoting the last other manager away from a manager role", () => {
    const admins = [
      admin({ id: "actor", role: "super_admin" }),
      admin({ id: "target", role: "super_admin" }),
    ];

    expect(
      wouldDemoteSoloManager(
        admins,
        roles,
        admin({ id: "target", role: "super_admin" }),
        "content_editor",
        "actor",
      ),
    ).toBe(true);
  });

  it("is false when the new role is still a manager role", () => {
    const admins = [
      admin({ id: "actor", role: "super_admin" }),
      admin({ id: "target", role: "super_admin" }),
    ];

    expect(
      wouldDemoteSoloManager(
        admins,
        roles,
        admin({ id: "target", role: "super_admin" }),
        "super_admin",
        "actor",
      ),
    ).toBe(false);
  });
});
