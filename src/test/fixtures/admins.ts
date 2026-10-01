import type { AdminAccountsData } from "@/contracts/admin/workflows";

type Abilities = AdminAccountsData["roles"][number]["abilities"];

const none: Abilities = {
  edit_content: false,
  publish_content: false,
  edit_curriculum: false,
  view_users: false,
};

/** The backend's five roles, in its own order, with its abilities. */
export const adminRoles: AdminAccountsData["roles"] = [
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
    abilities: { ...none, edit_content: true },
  },
  {
    value: "content_reviewer",
    label: "İçerik Denetçisi",
    abilities: { ...none, edit_content: true, publish_content: true },
  },
  {
    value: "support",
    label: "Destek",
    abilities: { ...none, view_users: true },
  },
  {
    value: "analyst",
    label: "Analist",
    abilities: { ...none, view_users: true },
  },
];

export type AdminAccount = AdminAccountsData["admins"][number];

let sequence = 0;

export function adminAccount(
  overrides: Partial<AdminAccount> = {},
): AdminAccount {
  sequence += 1;
  const role = overrides.role ?? "content_editor";

  return {
    id: `01a0ab9b-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    name: `Yönetici ${sequence}`,
    email: `admin${sequence}@bilgin.test`,
    role,
    role_label: adminRoles.find((item) => item.value === role)?.label ?? role,
    is_active: true,
    last_login_at: null,
    ...overrides,
  };
}

/** 2026-10-01T12:00:00Z — "now" for every age computed in tests. */
export const ADMIN_NOW = Date.UTC(2026, 9, 1, 12, 0, 0);

export function daysAgo(days: number): string {
  return new Date(ADMIN_NOW - days * 24 * 60 * 60 * 1000).toISOString();
}
