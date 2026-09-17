import { describe, expect, it } from "vitest";

import {
  adminLoginRequestSchema,
  adminLoginResponseSchema,
  adminMeResponseSchema,
} from "@/contracts/admin/auth";
import { safeAdminSchema } from "@/contracts/admin/session";
import {
  validAdminMeResponse,
  validEditorLoginResponse,
} from "@/test/fixtures/admin-api";

describe("admin auth contracts", () => {
  it("accepts a backend-compatible login request", () => {
    expect(
      adminLoginRequestSchema.safeParse({
        email: "editor@example.test",
        password: "test-password",
      }).success,
    ).toBe(true);
  });

  it("rejects an empty login password", () => {
    expect(
      adminLoginRequestSchema.safeParse({
        email: "editor@example.test",
        password: "",
      }).success,
    ).toBe(false);
  });

  it("parses the real login response shape", () => {
    expect(adminLoginResponseSchema.parse(validEditorLoginResponse)).toEqual(
      validEditorLoginResponse,
    );
  });

  it("rejects a login response without token", () => {
    expect(
      adminLoginResponseSchema.safeParse({
        ...validEditorLoginResponse,
        data: { admin: validEditorLoginResponse.data.admin },
      }).success,
    ).toBe(false);
  });

  it("rejects a login response without abilities", () => {
    expect(
      adminLoginResponseSchema.safeParse({
        ...validEditorLoginResponse,
        data: {
          ...validEditorLoginResponse.data,
          admin: {
            ...validEditorLoginResponse.data.admin,
            abilities: undefined,
          },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects an ability with the wrong type", () => {
    expect(
      adminLoginResponseSchema.safeParse({
        ...validEditorLoginResponse,
        data: {
          ...validEditorLoginResponse.data,
          admin: {
            ...validEditorLoginResponse.data.admin,
            abilities: {
              ...validEditorLoginResponse.data.admin.abilities,
              edit_content: "yes",
            },
          },
        },
      }).success,
    ).toBe(false);
  });

  it("accepts /me without abilities", () => {
    expect(adminMeResponseSchema.parse(validAdminMeResponse)).toEqual(
      validAdminMeResponse,
    );
  });

  it("rejects /me when a required field is missing", () => {
    expect(
      adminMeResponseSchema.safeParse({
        ...validAdminMeResponse,
        data: { ...validAdminMeResponse.data, role_label: undefined },
      }).success,
    ).toBe(false);
  });

  it("keeps role forward-compatible instead of hardcoding an enum", () => {
    expect(
      adminMeResponseSchema.safeParse({
        ...validAdminMeResponse,
        data: { ...validAdminMeResponse.data, role: "future_role" },
      }).success,
    ).toBe(true);
  });

  it("strips token from the frontend-safe admin contract", () => {
    const result = safeAdminSchema.parse({
      id: validEditorLoginResponse.data.admin.id,
      name: validEditorLoginResponse.data.admin.name,
      email: validEditorLoginResponse.data.admin.email,
      role: validEditorLoginResponse.data.admin.role,
      roleLabel: validEditorLoginResponse.data.admin.role_label,
      abilities: validEditorLoginResponse.data.admin.abilities,
      token: validEditorLoginResponse.data.token,
    });

    expect(result).not.toHaveProperty("token");
  });
});
