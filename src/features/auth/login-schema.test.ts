import { describe, expect, it } from "vitest";

import { loginFormSchema } from "@/features/auth/login-schema";

describe("login form schema", () => {
  it("accepts a valid email and non-empty password", () => {
    expect(
      loginFormSchema.safeParse({
        email: "editor@example.test",
        password: "x",
      }).success,
    ).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(
      loginFormSchema.safeParse({ email: "not-an-email", password: "x" })
        .success,
    ).toBe(false);
  });

  it("rejects an empty password without inventing a minimum length", () => {
    expect(
      loginFormSchema.safeParse({
        email: "editor@example.test",
        password: "",
      }).success,
    ).toBe(false);
  });
});
