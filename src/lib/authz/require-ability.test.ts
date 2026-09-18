import { describe, expect, it } from "vitest";

import {
  AbilityDeniedError,
  requireAbility,
} from "@/lib/authz/require-ability";
import { createSafeAdmin } from "@/test/fixtures/safe-admin";

describe("requireAbility", () => {
  it("returns silently when the snapshot grants the ability", () => {
    const admin = createSafeAdmin({ publish_content: true });

    expect(requireAbility(admin, "publish_content")).toBeUndefined();
  });

  it("throws AbilityDeniedError when the snapshot denies the ability", () => {
    const admin = createSafeAdmin({ edit_content: true });

    expect(() => requireAbility(admin, "publish_content")).toThrow(
      AbilityDeniedError,
    );
  });

  it("throws even when the role name would suggest full access", () => {
    const admin = createSafeAdmin(
      { edit_content: false },
      { role: "super_admin", roleLabel: "Süper Yönetici" },
    );

    expect(() => requireAbility(admin, "edit_content")).toThrow(
      AbilityDeniedError,
    );
  });

  it("carries the FORBIDDEN code and the denied ability key", () => {
    const admin = createSafeAdmin();

    try {
      requireAbility(admin, "edit_curriculum");
      expect.unreachable("requireAbility should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AbilityDeniedError);
      const denied = error as AbilityDeniedError;
      expect(denied.code).toBe("FORBIDDEN");
      expect(denied.ability).toBe("edit_curriculum");
      expect(denied.name).toBe("AbilityDeniedError");
    }
  });

  it("leaks no identity, session or token data", () => {
    const admin = createSafeAdmin();
    let denied: AbilityDeniedError | undefined;

    try {
      requireAbility(admin, "view_users");
    } catch (error) {
      denied = error as AbilityDeniedError;
    }

    expect(denied).toBeDefined();
    const serialized = JSON.stringify({
      ...denied,
      message: denied?.message,
      stack: undefined,
    });

    for (const secret of [
      admin.id,
      admin.name,
      admin.email,
      admin.role,
      admin.roleLabel,
    ]) {
      expect(serialized).not.toContain(secret);
    }

    expect(Object.keys({ ...denied }).sort()).toEqual([
      "ability",
      "code",
      "name",
    ]);
  });
});
