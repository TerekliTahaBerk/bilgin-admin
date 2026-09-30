import { describe, expect, it } from "vitest";

import { toApiError, type ApiError } from "@/lib/api/error";

describe("toApiError", () => {
  it("passes an ApiError through", () => {
    const error: ApiError = { kind: "server", status: 500, message: "x" };
    expect(toApiError(error)).toBe(error);
  });

  it("normalises anything else to an unknown error", () => {
    for (const raw of [
      new Error("x"),
      "boom",
      null,
      undefined,
      { kind: "weird", message: "x" },
      { kind: "server" },
    ]) {
      expect(toApiError(raw)).toEqual({
        kind: "unknown",
        status: null,
        message: "İstek tamamlanamadı.",
      });
    }
  });
});
