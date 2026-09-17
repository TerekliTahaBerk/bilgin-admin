import { describe, expect, it } from "vitest";

import { adminAbilitiesSchema } from "@/contracts/admin/auth";
import { can, type Ability } from "@/lib/authz/abilities";
import { createSafeAdmin } from "@/test/fixtures/safe-admin";

const contractAbilityKeys = Object.keys(
  adminAbilitiesSchema.shape,
) as Ability[];

describe("can", () => {
  it("supports every ability key of the backend contract", () => {
    expect(contractAbilityKeys).toEqual([
      "edit_content",
      "publish_content",
      "edit_curriculum",
      "view_users",
    ]);

    const admin = createSafeAdmin({
      edit_content: true,
      publish_content: true,
      edit_curriculum: true,
      view_users: true,
    });

    for (const ability of contractAbilityKeys) {
      expect(can(admin, ability)).toBe(true);
    }
  });

  it("grants an ability the snapshot enables", () => {
    const admin = createSafeAdmin(
      { edit_content: true },
      { role: "content_editor" },
    );

    expect(can(admin, "edit_content")).toBe(true);
  });

  it("denies an ability the snapshot disables", () => {
    const admin = createSafeAdmin(
      { edit_content: true },
      { role: "content_editor" },
    );

    expect(can(admin, "publish_content")).toBe(false);
  });

  it("denies every ability of an empty snapshot", () => {
    const admin = createSafeAdmin();

    for (const ability of contractAbilityKeys) {
      expect(can(admin, ability)).toBe(false);
    }
  });

  it("follows the snapshot even when the role name suggests otherwise", () => {
    const admin = createSafeAdmin(
      { edit_content: false, edit_curriculum: true },
      { role: "super_admin", roleLabel: "Süper Yönetici" },
    );

    expect(can(admin, "edit_content")).toBe(false);
    expect(can(admin, "edit_curriculum")).toBe(true);
  });

  it("grants a snapshot ability the role name would not suggest", () => {
    const admin = createSafeAdmin(
      { publish_content: true },
      { role: "content_editor" },
    );

    expect(can(admin, "publish_content")).toBe(true);
  });

  it("is fail-closed for a truthy but non-boolean snapshot value", () => {
    const admin = {
      ...createSafeAdmin(),
      abilities: { edit_content: "true" },
    } as unknown as ReturnType<typeof createSafeAdmin>;

    expect(can(admin, "edit_content")).toBe(false);
  });

  it("is fail-closed for an unknown ability key at runtime", () => {
    const admin = createSafeAdmin({ edit_content: true });

    expect(can(admin, "delete_everything" as Ability)).toBe(false);
  });

  it("is fail-closed for a missing or malformed snapshot", () => {
    const withoutAbilities = {} as ReturnType<typeof createSafeAdmin>;
    const nullAbilities = { abilities: null } as unknown as ReturnType<
      typeof createSafeAdmin
    >;
    const missingSubject = null as unknown as ReturnType<
      typeof createSafeAdmin
    >;

    expect(can(withoutAbilities, "edit_content")).toBe(false);
    expect(can(nullAbilities, "edit_content")).toBe(false);
    expect(can(missingSubject, "edit_content")).toBe(false);
  });

  it("does not mutate the snapshot it reads", () => {
    const admin = createSafeAdmin({ edit_content: true });
    const snapshot = structuredClone(admin);

    can(admin, "publish_content");

    expect(admin).toEqual(snapshot);
  });
});
