import { describe, expect, it } from "vitest";

import type { ApiError } from "@/lib/api/error";
import {
  QUERY_MAX_RETRIES,
  shouldHaltBatch,
  shouldRetryQuery,
} from "@/lib/api/retry-policy";

function error(kind: ApiError["kind"], status: number | null): ApiError {
  return { kind, status, message: "test" };
}

describe("shouldRetryQuery", () => {
  it.each([
    ["authentication", 401],
    ["authorization", 403],
    ["not_found", 404],
    ["validation", 422],
    ["rate_limit", 429],
    ["contract", 200],
    ["protocol", 200],
  ] as const)("never retries a %s failure", (kind, status) => {
    expect(shouldRetryQuery(0, error(kind, status))).toBe(false);
  });

  it.each(["network", "server", "unknown"] as const)(
    "retries a %s failure at most once",
    (kind) => {
      expect(shouldRetryQuery(0, error(kind, null))).toBe(true);
      expect(shouldRetryQuery(QUERY_MAX_RETRIES, error(kind, null))).toBe(
        false,
      );
    },
  );

  it("caps retries at one", () => {
    expect(QUERY_MAX_RETRIES).toBe(1);
  });

  it("does not retry an unrecognised error shape", () => {
    expect(shouldRetryQuery(0, new Error("boom"))).toBe(false);
    expect(shouldRetryQuery(0, undefined)).toBe(false);
  });
});

describe("shouldHaltBatch", () => {
  it("halts only on authentication and rate limit", () => {
    const error = (kind: ApiError["kind"]): ApiError => ({
      kind,
      status: null,
      message: "x",
    });

    expect(shouldHaltBatch(error("authentication"))).toBe(true);
    expect(shouldHaltBatch(error("rate_limit"))).toBe(true);
    for (const kind of [
      "authorization",
      "not_found",
      "server",
      "network",
      "contract",
      "unknown",
    ] as const) {
      expect(shouldHaltBatch(error(kind))).toBe(false);
    }
  });
});
