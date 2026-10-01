import type { AdminAccountsData } from "@/contracts/admin/workflows";
import {
  adminsByRole,
  SUPER_ADMIN_ROLE,
} from "@/features/workflows/admin-security";

type Admin = AdminAccountsData["admins"][number];
type RoleOption = AdminAccountsData["roles"][number];

/**
 * Every role value that grants edit_curriculum — the ability this admin
 * screen itself requires to be reachable at all. An admin holding one of
 * these roles is a "manager": someone who can create, deactivate or reassign
 * other admin accounts.
 */
export function managerRoleValues(roles: readonly RoleOption[]): Set<string> {
  return new Set(
    roles
      .filter((role) => role.abilities.edit_curriculum)
      .map((role) => role.value),
  );
}

function isActiveManager(
  admin: Admin,
  managerRoles: ReadonlySet<string>,
): boolean {
  return admin.is_active && managerRoles.has(admin.role);
}

/**
 * Active managers other than the two ids given (typically the actor and the
 * admin being acted on). Used to answer "if this action goes through, is
 * there anyone left besides the actor?".
 */
export function otherActiveManagerCount(
  admins: readonly Admin[],
  roles: readonly RoleOption[],
  excludeAdminIds: readonly string[],
): number {
  const managerRoles = managerRoleValues(roles);
  const excluded = new Set(excludeAdminIds);
  return admins.filter(
    (admin) => !excluded.has(admin.id) && isActiveManager(admin, managerRoles),
  ).length;
}

/**
 * True when deactivating `target` (who is currently an active manager) would
 * leave `actorId` as the only active manager left. Self-lockout (an admin
 * touching their own account) is prevented separately by hiding the controls
 * entirely — this guards a narrower but real risk: leaving the whole admin
 * roster down to a single person who can manage accounts, a bus-factor-one
 * state one resignation away from nobody being able to fix a lockout at all.
 */
export function wouldLeaveSoloManager(
  admins: readonly Admin[],
  roles: readonly RoleOption[],
  target: Admin,
  actorId: string,
): boolean {
  const managerRoles = managerRoleValues(roles);
  if (!isActiveManager(target, managerRoles)) return false;
  if (target.id === actorId) return false;

  return otherActiveManagerCount(admins, roles, [target.id, actorId]) === 0;
}

/**
 * True when changing `target`'s role away from a manager role would leave
 * `actorId` as the only active manager left.
 */
export function wouldDemoteSoloManager(
  admins: readonly Admin[],
  roles: readonly RoleOption[],
  target: Admin,
  nextRoleValue: string,
  actorId: string,
): boolean {
  const managerRoles = managerRoleValues(roles);
  if (!isActiveManager(target, managerRoles)) return false;
  if (managerRoles.has(nextRoleValue)) return false;
  if (target.id === actorId) return false;

  return otherActiveManagerCount(admins, roles, [target.id, actorId]) === 0;
}

/**
 * Mirrors the backend's `wouldRemoveLastSuperAdmin`: `target` is the only
 * active super admin, so the backend refuses to deactivate them or move
 * them off the role — whoever asks.
 */
export function isLastActiveSuperAdmin(
  admins: readonly Admin[],
  target: Admin,
): boolean {
  const activeSuperAdmins = (
    adminsByRole(admins).get(SUPER_ADMIN_ROLE) ?? []
  ).filter((admin) => admin.is_active);

  return (
    activeSuperAdmins.length === 1 && activeSuperAdmins[0]!.id === target.id
  );
}

export type AdminEditRules = Readonly<{
  /** Why "Pasif yap" is unavailable, or null when it is allowed. */
  deactivateBlocked: string | null;
  /** Why the role cannot change at all, or null. */
  roleBlocked: string | null;
  /** Role values the backend would refuse for this account. */
  forbiddenRoles: ReadonlySet<string>;
}>;

/**
 * What the backend's lockout rules forbid for `target` when `actorId` acts,
 * so the screen can disable it up front. The backend still enforces every
 * rule (ADMIN_LOCKOUT_PREVENTED) — this only spares a request bound to fail.
 */
export function adminEditRules(
  admins: readonly Admin[],
  roles: readonly RoleOption[],
  target: Admin,
  actorId: string,
): AdminEditRules {
  if (target.id === actorId) {
    return {
      deactivateBlocked:
        "Kendi hesabınızı pasif yapamazsınız (backend kuralı).",
      roleBlocked: "Kendi rolünüzü değiştiremezsiniz (backend kuralı).",
      forbiddenRoles: new Set(
        roles
          .map((role) => role.value)
          .filter((value) => value !== target.role),
      ),
    };
  }

  if (isLastActiveSuperAdmin(admins, target)) {
    return {
      deactivateBlocked:
        "Sistemdeki son aktif süper yönetici pasif yapılamaz (backend kuralı).",
      roleBlocked: null,
      forbiddenRoles: new Set(
        roles
          .map((role) => role.value)
          .filter((value) => value !== SUPER_ADMIN_ROLE),
      ),
    };
  }

  return {
    deactivateBlocked: null,
    roleBlocked: null,
    forbiddenRoles: new Set(),
  };
}
