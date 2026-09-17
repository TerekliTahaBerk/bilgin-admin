import type { AdminAbilities } from "@/contracts/admin/auth";
import type { SafeAdmin } from "@/contracts/admin/session";

const noAbilities: AdminAbilities = {
  edit_content: false,
  publish_content: false,
  edit_curriculum: false,
  view_users: false,
};

/**
 * Minimal `SafeAdmin` fixture for authorization tests. `role` and `roleLabel`
 * are identity/display data only — no expectation may be built on them.
 */
export function createSafeAdmin(
  abilities: Partial<AdminAbilities> = {},
  identity: Partial<Pick<SafeAdmin, "role" | "roleLabel">> = {},
): SafeAdmin {
  return {
    id: "3eaa9588-9307-43d7-9021-6f6a330ce50d",
    name: "Test Yönetici",
    email: "admin@example.test",
    role: identity.role ?? "content_editor",
    roleLabel: identity.roleLabel ?? "İçerik Editörü",
    abilities: { ...noAbilities, ...abilities },
  };
}
