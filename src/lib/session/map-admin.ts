import "server-only";

import type {
  AdminLoginIdentity,
  AdminMeIdentity,
} from "@/contracts/admin/auth";
import { safeAdminSchema, type SafeAdmin } from "@/contracts/admin/session";

export function mapLoginAdminToSafeAdmin(admin: AdminLoginIdentity): SafeAdmin {
  return safeAdminSchema.parse({
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    roleLabel: admin.role_label,
    abilities: admin.abilities,
  });
}

export function refreshSafeAdminIdentity(
  currentAdmin: SafeAdmin,
  identity: AdminMeIdentity,
): SafeAdmin {
  return safeAdminSchema.parse({
    id: currentAdmin.id,
    name: identity.name,
    email: identity.email,
    role: currentAdmin.role,
    roleLabel: identity.role_label,
    abilities: currentAdmin.abilities,
  });
}
