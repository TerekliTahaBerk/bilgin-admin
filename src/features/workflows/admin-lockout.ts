import type { AdminAccountsData } from "@/contracts/admin/workflows";

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
    roles.filter((role) => role.abilities.edit_curriculum).map((role) => role.value),
  );
}

function isActiveManager(admin: Admin, managerRoles: ReadonlySet<string>): boolean {
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
