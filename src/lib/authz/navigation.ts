import type { SafeAdmin } from "@/contracts/admin/session";
import { can, type Ability } from "@/lib/authz/abilities";

export type NavigationItem = {
  id: string;
  label: string;
  href: string;
  requiredAbility?: Ability;
};

/**
 * Production registry. It may only contain routes that actually exist, so it
 * never renders a dead link. Further items are added by the step that adds the
 * corresponding route.
 */
export const adminNavigation: readonly NavigationItem[] = [
  { id: "home", label: "Ana Sayfa", href: "/" },
];

/**
 * Pure visibility filter. An item without `requiredAbility` is always visible;
 * otherwise `can()` decides. The input array is never mutated.
 */
export function filterNavigation(
  items: readonly NavigationItem[],
  admin: SafeAdmin,
): NavigationItem[] {
  return items.filter(
    (item) =>
      item.requiredAbility === undefined || can(admin, item.requiredAbility),
  );
}
