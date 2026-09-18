import type { SafeAdmin } from "@/contracts/admin/session";
import { can, type Ability } from "@/lib/authz/abilities";

/**
 * Typed authorization failure. Carries the denied ability key only — never the
 * admin identity, session payload or backend token.
 */
export class AbilityDeniedError extends Error {
  readonly code = "FORBIDDEN" as const;
  readonly ability: Ability;

  constructor(ability: Ability) {
    super("Bu işlem için yetkin yok.");
    this.name = "AbilityDeniedError";
    this.ability = ability;
  }
}

/**
 * Guard primitive for future server guards and page checks. Framework
 * independent on purpose: it reads no cookie, performs no backend request and
 * refreshes no session — it only judges an already authenticated `SafeAdmin`.
 */
export function requireAbility(admin: SafeAdmin, ability: Ability): void {
  if (!can(admin, ability)) {
    throw new AbilityDeniedError(ability);
  }
}
