import type { AdminAbilities } from "@/contracts/admin/auth";
import type { SafeAdmin } from "@/contracts/admin/session";

/**
 * Derived from the backend contract so the four ability keys keep a single
 * source of truth (`adminAbilitiesSchema`).
 */
export type Ability = keyof AdminAbilities;

/**
 * Anything carrying a backend ability snapshot. Deliberately narrower than
 * `SafeAdmin`: an authorization decision must not be able to read `role`.
 */
export type AbilitySubject = Pick<SafeAdmin, "abilities">;

/**
 * The only permission primitive. The backend ability snapshot decides, never
 * the role: a `super_admin` whose snapshot says `edit_content: false` cannot
 * edit content.
 *
 * Fail-closed: a missing subject, a missing snapshot or an unknown key at
 * runtime yields `false` instead of throwing or falling back to truthy.
 */
export function can(subject: AbilitySubject, ability: Ability): boolean {
  const abilities: unknown = (subject as { abilities?: unknown } | null)
    ?.abilities;

  if (typeof abilities !== "object" || abilities === null) {
    return false;
  }

  return (abilities as Record<string, unknown>)[ability] === true;
}
