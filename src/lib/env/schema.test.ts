import { describe, expect, it } from "vitest";

import {
  SESSION_DEFAULT_MAX_AGE_SECONDS,
  parseServerEnv,
} from "@/lib/env/schema";

const validEnvironment = {
  BILGIN_API_URL: "http://localhost:8000",
  APP_ORIGIN: "http://localhost:3000",
  SESSION_SECRET: "test-session-secret-that-is-at-least-32-characters-long",
};

describe("session environment contract", () => {
  it("accepts a secret with at least 32 characters", () => {
    expect(parseServerEnv(validEnvironment, "development").SESSION_SECRET).toBe(
      validEnvironment.SESSION_SECRET,
    );
  });

  it("rejects a short secret", () => {
    expect(() =>
      parseServerEnv(
        { ...validEnvironment, SESSION_SECRET: "too-short" },
        "development",
      ),
    ).toThrow(/SESSION_SECRET/);
  });

  it("rejects a whitespace-only secret", () => {
    expect(() =>
      parseServerEnv(
        { ...validEnvironment, SESSION_SECRET: " ".repeat(40) },
        "development",
      ),
    ).toThrow(/SESSION_SECRET/);
  });

  it("defaults max age to eight hours", () => {
    expect(
      parseServerEnv(validEnvironment, "development").SESSION_MAX_AGE_SECONDS,
    ).toBe(SESSION_DEFAULT_MAX_AGE_SECONDS);
  });

  it("accepts a shorter custom max age", () => {
    expect(
      parseServerEnv(
        { ...validEnvironment, SESSION_MAX_AGE_SECONDS: "3600" },
        "development",
      ).SESSION_MAX_AGE_SECONDS,
    ).toBe(3600);
  });

  it("rejects a max age over eight hours", () => {
    expect(() =>
      parseServerEnv(
        { ...validEnvironment, SESSION_MAX_AGE_SECONDS: "28801" },
        "development",
      ),
    ).toThrow(/SESSION_MAX_AGE_SECONDS/);
  });

  it("rejects a max age below five minutes", () => {
    expect(() =>
      parseServerEnv(
        { ...validEnvironment, SESSION_MAX_AGE_SECONDS: "299" },
        "development",
      ),
    ).toThrow(/SESSION_MAX_AGE_SECONDS/);
  });

  it("rejects a non-integer max age", () => {
    expect(() =>
      parseServerEnv(
        { ...validEnvironment, SESSION_MAX_AGE_SECONDS: "300.5" },
        "development",
      ),
    ).toThrow(/SESSION_MAX_AGE_SECONDS/);
  });
});
