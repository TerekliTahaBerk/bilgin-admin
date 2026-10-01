import { describe, expect, it } from "vitest";

import {
  attentionItems,
  formatLoginAge,
  isHighPrivilege,
  loginAge,
  policyNotes,
  summarizeAdmins,
  SUPER_ADMIN_POLICY_MAX,
} from "@/features/workflows/admin-security";
import {
  ADMIN_NOW,
  adminAccount,
  adminRoles,
  daysAgo,
} from "@/test/fixtures/admins";

const roster = () => {
  const admins = [
    adminAccount({ id: "a", role: "super_admin", last_login_at: daysAgo(2) }),
    adminAccount({ id: "b", role: "super_admin", last_login_at: daysAgo(95) }),
    adminAccount({ id: "c", role: "content_editor", last_login_at: null }),
    adminAccount({
      id: "d",
      role: "content_reviewer",
      last_login_at: daysAgo(45),
    }),
    adminAccount({
      id: "e",
      role: "content_editor",
      is_active: false,
      last_login_at: daysAgo(400),
    }),
    adminAccount({
      id: "f",
      role: "analyst",
      is_active: false,
      last_login_at: null,
    }),
  ];
  return { roles: adminRoles, admins };
};

describe("loginAge", () => {
  it("reads never, unknown and whole days, never in the future", () => {
    expect(loginAge(adminAccount({ last_login_at: null }), ADMIN_NOW)).toEqual({
      kind: "never",
    });
    expect(loginAge(adminAccount({ last_login_at: "dün" }), ADMIN_NOW)).toEqual(
      { kind: "unknown", raw: "dün" },
    );
    expect(
      loginAge(adminAccount({ last_login_at: daysAgo(3.5) }), ADMIN_NOW),
    ).toMatchObject({ kind: "logged_in", days: 3 });
    expect(
      loginAge(
        adminAccount({ last_login_at: "2026-10-02T00:00:00+00:00" }),
        ADMIN_NOW,
      ),
    ).toMatchObject({ kind: "logged_in", days: 0 });
  });

  it("formats each case", () => {
    expect(formatLoginAge({ kind: "never" })).toBe("Hiç giriş yapmadı");
    expect(formatLoginAge({ kind: "unknown", raw: "x" })).toBe(
      "Son giriş okunamadı",
    );
    const at = new Date(ADMIN_NOW);
    expect(formatLoginAge({ kind: "logged_in", days: 0, at })).toBe("Bugün");
    expect(formatLoginAge({ kind: "logged_in", days: 1, at })).toBe("Dün");
    expect(formatLoginAge({ kind: "logged_in", days: 12, at })).toBe(
      "12 gün önce",
    );
  });
});

describe("summarizeAdmins", () => {
  it("counts accounts, logins, roles and super admins", () => {
    const summary = summarizeAdmins(roster(), ADMIN_NOW);

    expect(summary).toMatchObject({
      total: 6,
      active: 4,
      inactive: 2,
      neverLoggedIn: 2,
      // Active and logged in: a (2), b (95), d (45); inactive e is not counted.
      staleActive: { 30: 2, 60: 1, 90: 1 },
      superAdmins: { total: 2, active: 2 },
      highPrivilegeActive: 2,
    });
    expect(
      summary.roleDistribution.map((role) => [
        role.value,
        role.total,
        role.active,
      ]),
    ).toEqual([
      ["super_admin", 2, 2],
      ["content_editor", 2, 1],
      ["content_reviewer", 1, 1],
      ["support", 0, 0],
      ["analyst", 1, 0],
    ]);
  });

  it("lists a role missing from the role list separately", () => {
    const summary = summarizeAdmins(
      {
        roles: adminRoles,
        admins: [adminAccount({ role: "auditor", role_label: "Denetim" })],
      },
      ADMIN_NOW,
    );

    expect(summary.roleDistribution.at(-1)).toEqual({
      value: "auditor",
      label: "Denetim",
      total: 1,
      active: 1,
    });
  });
});

describe("isHighPrivilege", () => {
  it("follows the role's edit_curriculum ability", () => {
    expect(
      isHighPrivilege(adminAccount({ role: "super_admin" }), adminRoles),
    ).toBe(true);
    expect(
      isHighPrivilege(adminAccount({ role: "content_reviewer" }), adminRoles),
    ).toBe(false);
    expect(isHighPrivilege(adminAccount({ role: "ghost" }), adminRoles)).toBe(
      false,
    );
  });
});

describe("attentionItems", () => {
  it("lists one item per reason, warnings first", () => {
    const items = attentionItems(roster(), ADMIN_NOW, 90);

    expect(
      items.map((item) => [item.adminId, item.kind, item.severity]),
    ).toEqual([
      ["c", "never_logged_in", "warning"],
      ["b", "stale_login", "warning"],
      ["b", "high_privilege", "warning"],
      ["f", "never_logged_in", "info"],
      ["a", "high_privilege", "info"],
      ["e", "inactive", "info"],
      ["f", "inactive", "info"],
    ]);
    expect(items[1]!.message).toMatch(/95 gün önce \(eşik: 90 gün\)/);
  });

  it("follows the chosen stale threshold", () => {
    const stale = (days: 30 | 60 | 90) =>
      attentionItems(roster(), ADMIN_NOW, days)
        .filter((item) => item.kind === "stale_login")
        .map((item) => item.adminId);

    expect(stale(30)).toEqual(["b", "d"]);
    expect(stale(60)).toEqual(["b"]);
    expect(stale(90)).toEqual(["b"]);
  });

  it("is empty for a healthy roster", () => {
    expect(
      attentionItems(
        {
          roles: adminRoles,
          admins: [
            adminAccount({ role: "content_editor", last_login_at: daysAgo(1) }),
          ],
        },
        ADMIN_NOW,
      ),
    ).toEqual([]);
  });
});

describe("policyNotes", () => {
  const withSupers = (active: number) =>
    summarizeAdmins(
      {
        roles: adminRoles,
        admins: Array.from({ length: active }, () =>
          adminAccount({ role: "super_admin", last_login_at: daysAgo(1) }),
        ),
      },
      ADMIN_NOW,
    );

  it("flags more super admins than the local policy allows", () => {
    expect(policyNotes(withSupers(SUPER_ADMIN_POLICY_MAX + 1))).toEqual([
      expect.objectContaining({ id: "many_super_admins" }),
    ]);
    expect(policyNotes(withSupers(SUPER_ADMIN_POLICY_MAX))).toEqual([]);
    expect(policyNotes(withSupers(2))).toEqual([]);
  });

  it("notes a single or missing active super admin", () => {
    expect(policyNotes(withSupers(1))[0]?.id).toBe("single_super_admin");
    expect(policyNotes(withSupers(0))[0]?.id).toBe("no_active_super_admin");
  });
});
