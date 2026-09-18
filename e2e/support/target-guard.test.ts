import { describe, expect, it } from "vitest";

import { assertLocalE2eTarget, E2eTargetRejectedError } from "./target-guard";

const local = { E2E_TARGET_ENV: undefined };

describe("assertLocalE2eTarget", () => {
  it.each([
    "http://127.0.0.1:3100",
    "http://localhost:3100",
    "http://[::1]:3100",
    "http://127.0.0.1:3100/",
  ])("allows the loopback target %s", (target) => {
    expect(assertLocalE2eTarget(target, local)).toBe(target);
  });

  it.each([
    "https://admin.production.example",
    "https://admin.example.test",
    "http://192.168.1.10:3000",
    "http://127.0.0.1.evil.test:3000",
  ])("rejects the remote target %s", (target) => {
    expect(() => assertLocalE2eTarget(target, local)).toThrow(
      E2eTargetRejectedError,
    );
  });

  it("rejects a production target environment even on loopback", () => {
    expect(() =>
      assertLocalE2eTarget("http://127.0.0.1:3100", {
        E2E_TARGET_ENV: "production",
      }),
    ).toThrow(E2eTargetRejectedError);
  });

  it("rejects any non-local target environment", () => {
    expect(() =>
      assertLocalE2eTarget("http://127.0.0.1:3100", {
        E2E_TARGET_ENV: "staging",
      }),
    ).toThrow(E2eTargetRejectedError);
  });

  it("accepts an explicit local target environment", () => {
    expect(
      assertLocalE2eTarget("http://127.0.0.1:3100", {
        E2E_TARGET_ENV: "local",
      }),
    ).toBe("http://127.0.0.1:3100");
  });

  it.each([
    ["a malformed URL", "not a url"],
    ["an empty string", ""],
    ["a non-HTTP scheme", "file:///etc/passwd"],
  ])("rejects %s", (_label, target) => {
    expect(() => assertLocalE2eTarget(target, local)).toThrow(
      E2eTargetRejectedError,
    );
  });

  it("rejects a missing base URL", () => {
    expect(() => assertLocalE2eTarget(undefined, local)).toThrow(
      E2eTargetRejectedError,
    );
  });
});
