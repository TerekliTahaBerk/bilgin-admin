/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reportError } from "@/lib/observability/report-error";

const originalEndpoint = process.env.NEXT_PUBLIC_ERROR_REPORTING_URL;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalEndpoint === undefined) {
    delete process.env.NEXT_PUBLIC_ERROR_REPORTING_URL;
  } else {
    process.env.NEXT_PUBLIC_ERROR_REPORTING_URL = originalEndpoint;
  }
});

describe("reportError console sink", () => {
  it("always logs a structured report, even with no endpoint configured", () => {
    delete process.env.NEXT_PUBLIC_ERROR_REPORTING_URL;

    reportError(new Error("boom"), "test-context");

    expect(console.error).toHaveBeenCalledTimes(1);
    const [, report] = vi.mocked(console.error).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(report.message).toBe("boom");
    expect(report.context).toBe("test-context");
    expect(typeof report.stack).toBe("string");
    expect(typeof report.timestamp).toBe("string");
  });

  it("normalizes a non-Error thrown value instead of losing it", () => {
    reportError("plain string failure", "test-context");

    const [, report] = vi.mocked(console.error).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(report.message).toBe("plain string failure");
  });

  it("carries the digest an error boundary hands it", () => {
    reportError(new Error("boom"), "panel-error-boundary", {
      digest: "abc123",
    });

    const [, report] = vi.mocked(console.error).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(report.digest).toBe("abc123");
  });
});

describe("reportError network sink", () => {
  it("never calls fetch when no endpoint is configured", () => {
    delete process.env.NEXT_PUBLIC_ERROR_REPORTING_URL;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    reportError(new Error("boom"), "test-context");

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts the same report to the configured endpoint", async () => {
    process.env.NEXT_PUBLIC_ERROR_REPORTING_URL =
      "https://logs.example.test/errors";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    reportError(new Error("boom"), "test-context");
    await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://logs.example.test/errors");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.message).toBe("boom");
    expect(body.context).toBe("test-context");
  });

  it("swallows a reporting endpoint failure instead of throwing", async () => {
    process.env.NEXT_PUBLIC_ERROR_REPORTING_URL =
      "https://logs.example.test/errors";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    expect(() => reportError(new Error("boom"), "test-context")).not.toThrow();
    await Promise.resolve();
  });
});
