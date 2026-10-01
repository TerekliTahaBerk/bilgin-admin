import type { AdminAccountsData } from "@/contracts/admin/workflows";

/*
 | Admin Security — a read of the admin list endpoint only (`GET /admins`:
 | roles with their abilities, and per admin name, email, role, role_label,
 | is_active, last_login_at). Accounts carry no abilities of their own; they
 | have their role's.
 |
 | Two kinds of statement are kept apart:
 | - facts read from the response (counts, "never logged in", days since the
 |   last login);
 | - local policy heuristics (how many super admins is "many", how many days
 |   make a login "stale"). These are this panel's conventions, labelled as
 |   such on screen — the backend has no such rule.
 */

export type AdminAccount = AdminAccountsData["admins"][number];
export type AdminRoleOption = AdminAccountsData["roles"][number];

/** The backend's `AdminRole::SuperAdmin` value; its lockout rule names it. */
export const SUPER_ADMIN_ROLE = "super_admin";

/** "Has not logged in for N days" buckets shown in the summary. */
export const STALE_LOGIN_THRESHOLDS = [30, 60, 90] as const;
export type StaleThreshold = (typeof STALE_LOGIN_THRESHOLDS)[number];
export const DEFAULT_STALE_THRESHOLD: StaleThreshold = 90;

/**
 * Local policy heuristic: more active super admins than this is flagged.
 * Not a backend rule — every super admin can manage every account, so the
 * fewer the better; three leaves room for absence without a lockout.
 */
export const SUPER_ADMIN_POLICY_MAX = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export type LoginAge =
  | Readonly<{ kind: "never" }>
  | Readonly<{ kind: "unknown"; raw: string }>
  | Readonly<{ kind: "logged_in"; days: number; at: Date }>;

/**
 * Whole days since the last login. A timestamp in the future (clock skew)
 * counts as today; one that cannot be parsed is reported as unknown rather
 * than guessed.
 */
export function loginAge(admin: AdminAccount, now: number): LoginAge {
  if (admin.last_login_at === null) return { kind: "never" };

  const at = new Date(admin.last_login_at);
  if (Number.isNaN(at.getTime())) {
    return { kind: "unknown", raw: admin.last_login_at };
  }

  return {
    kind: "logged_in",
    days: Math.max(0, Math.floor((now - at.getTime()) / DAY_MS)),
    at,
  };
}

export function formatLoginAge(age: LoginAge): string {
  switch (age.kind) {
    case "never":
      return "Hiç giriş yapmadı";
    case "unknown":
      return "Son giriş okunamadı";
    case "logged_in":
      return age.days === 0
        ? "Bugün"
        : age.days === 1
          ? "Dün"
          : `${age.days} gün önce`;
  }
}

/**
 * Accounts grouped by their role value. Role values are only ever used to
 * group accounts and to look up the role's own entry (label, abilities) —
 * never to decide what the current admin may do; that comes from abilities.
 */
export function adminsByRole(
  admins: readonly AdminAccount[],
): ReadonlyMap<string, readonly AdminAccount[]> {
  const groups = new Map<string, AdminAccount[]>();
  for (const admin of admins) {
    groups.set(admin.role, [...(groups.get(admin.role) ?? []), admin]);
  }
  return groups;
}

export function roleOf(
  admin: AdminAccount,
  roles: readonly AdminRoleOption[],
): AdminRoleOption | undefined {
  return roles.find((role) => role.value === admin.role);
}

/**
 * High privilege: the role can manage admin accounts and the curriculum
 * (`edit_curriculum`, the ability this screen itself requires).
 */
export function isHighPrivilege(
  admin: AdminAccount,
  roles: readonly AdminRoleOption[],
): boolean {
  return roleOf(admin, roles)?.abilities.edit_curriculum === true;
}

export type AdminSecuritySummary = Readonly<{
  total: number;
  active: number;
  inactive: number;
  /** Every account whose `last_login_at` is null. */
  neverLoggedIn: number;
  /**
   * Active accounts that have logged in, but not within N days (cumulative:
   * 90+ is also counted in 60+ and 30+).
   */
  staleActive: Readonly<Record<StaleThreshold, number>>;
  roleDistribution: readonly Readonly<{
    value: string;
    label: string;
    total: number;
    active: number;
  }>[];
  superAdmins: Readonly<{ total: number; active: number }>;
  highPrivilegeActive: number;
}>;

export function summarizeAdmins(
  data: AdminAccountsData,
  now: number,
): AdminSecuritySummary {
  const { admins, roles } = data;
  const active = admins.filter((admin) => admin.is_active);
  const staleActive = Object.fromEntries(
    STALE_LOGIN_THRESHOLDS.map((days) => [
      days,
      active.filter((admin) => {
        const age = loginAge(admin, now);
        return age.kind === "logged_in" && age.days >= days;
      }).length,
    ]),
  ) as Record<StaleThreshold, number>;

  const byRole = adminsByRole(admins);
  // Roles in the backend's own order; a role no one holds is still listed.
  // An account whose role is not in the list gets its own row.
  const known = new Set(roles.map((role) => role.value));
  const unknownRoles = [
    ...new Map(
      admins
        .filter((admin) => !known.has(admin.role))
        .map((admin) => [admin.role, admin.role_label]),
    ),
  ];
  const roleDistribution = [
    ...roles.map((role) => ({ value: role.value, label: role.label })),
    ...unknownRoles.map(([value, label]) => ({ value, label })),
  ].map((role) => {
    const members = byRole.get(role.value) ?? [];
    return {
      ...role,
      total: members.length,
      active: members.filter((admin) => admin.is_active).length,
    };
  });
  const superAdmins = byRole.get(SUPER_ADMIN_ROLE) ?? [];

  return {
    total: admins.length,
    active: active.length,
    inactive: admins.length - active.length,
    neverLoggedIn: admins.filter((admin) => admin.last_login_at === null)
      .length,
    staleActive,
    roleDistribution,
    superAdmins: {
      total: superAdmins.length,
      active: superAdmins.filter((admin) => admin.is_active).length,
    },
    highPrivilegeActive: active.filter((admin) => isHighPrivilege(admin, roles))
      .length,
  };
}

/* ---------------------------------------------------------- attention -- */

export const attentionKinds = [
  "never_logged_in",
  "stale_login",
  "high_privilege",
  "inactive",
] as const;
export type AttentionKind = (typeof attentionKinds)[number];

export const attentionKindLabels: Readonly<Record<AttentionKind, string>> = {
  never_logged_in: "Hiç giriş yapmamış",
  stale_login: "Uzun süredir giriş yok",
  high_privilege: "Yüksek yetkili",
  inactive: "Pasif hesap",
};

export type AttentionItem = Readonly<{
  id: string;
  adminId: string;
  kind: AttentionKind;
  severity: "warning" | "info";
  message: string;
}>;

/**
 * Accounts worth a look, one item per reason. Warnings are about active
 * accounts (they can sign in today); inactive accounts are listed as info —
 * they cannot sign in, but still exist.
 */
export function attentionItems(
  data: AdminAccountsData,
  now: number,
  staleDays: StaleThreshold = DEFAULT_STALE_THRESHOLD,
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const admin of data.admins) {
    const age = loginAge(admin, now);
    const high = isHighPrivilege(admin, data.roles);
    const stale = age.kind === "logged_in" && age.days >= staleDays;

    if (!admin.is_active) {
      items.push({
        id: `inactive-${admin.id}`,
        adminId: admin.id,
        kind: "inactive",
        severity: "info",
        message: "Pasif: giriş yapamaz. Artık gerekmiyorsa böyle kalabilir.",
      });
    }

    if (age.kind === "never") {
      items.push({
        id: `never-${admin.id}`,
        adminId: admin.id,
        kind: "never_logged_in",
        severity: admin.is_active ? "warning" : "info",
        message: admin.is_active
          ? "Hesap aktif ama hiç giriş yapılmamış; parolası kullanılmamış bir hesap olabilir."
          : "Hiç giriş yapılmamış.",
      });
    }

    if (admin.is_active && stale && age.kind === "logged_in") {
      items.push({
        id: `stale-${admin.id}`,
        adminId: admin.id,
        kind: "stale_login",
        severity: "warning",
        message: `Aktif hesap, son giriş ${age.days} gün önce (eşik: ${staleDays} gün).`,
      });
    }

    if (admin.is_active && high) {
      const unused = age.kind === "never" || stale;
      items.push({
        id: `high-${admin.id}`,
        adminId: admin.id,
        kind: "high_privilege",
        severity: unused ? "warning" : "info",
        message: unused
          ? "Yönetici ve müfredat yönetim yetkisi var ve hesap kullanılmıyor görünüyor."
          : "Yönetici ve müfredat yönetim yetkisi var.",
      });
    }
  }

  return items.sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === "warning" ? -1 : 1) ||
      attentionKinds.indexOf(a.kind) - attentionKinds.indexOf(b.kind),
  );
}

export type PolicyNote = Readonly<{
  id: "many_super_admins" | "single_super_admin" | "no_active_super_admin";
  message: string;
}>;

/** Local policy heuristics over the summary — never backend rules. */
export function policyNotes(summary: AdminSecuritySummary): PolicyNote[] {
  const notes: PolicyNote[] = [];
  const { active } = summary.superAdmins;

  if (active > SUPER_ADMIN_POLICY_MAX) {
    notes.push({
      id: "many_super_admins",
      message: `${active} aktif süper yönetici var; yerel politika en fazla ${SUPER_ADMIN_POLICY_MAX} öneriyor. Her süper yönetici tüm hesapları yönetebilir.`,
    });
  } else if (active === 1) {
    notes.push({
      id: "single_super_admin",
      message:
        "Tek aktif süper yönetici var. Backend bu hesabın pasifleştirilmesini veya rolünün düşürülmesini engeller; yine de bu kişiye erişim kaybolursa hesap yönetimi kimseye kalmaz.",
    });
  } else if (active === 0) {
    notes.push({
      id: "no_active_super_admin",
      message:
        "Listede aktif süper yönetici görünmüyor. Backend son aktif süper yöneticinin kaldırılmasını engellediği için bu beklenmeyen bir durum; listeyi yenileyin.",
    });
  }

  return notes;
}
