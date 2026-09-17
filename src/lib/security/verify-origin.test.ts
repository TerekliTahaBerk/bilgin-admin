import { afterEach, describe, expect, it, vi } from "vitest";

async function loadOriginVerifier(appOrigin: string) {
  vi.stubEnv("APP_ORIGIN", appOrigin);
  vi.resetModules();

  return (await import("@/lib/security/verify-origin")).verifyOrigin;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("strict Origin verification", () => {
  it("accepts only the exact configured HTTPS origin", async () => {
    const verifyOrigin = await loadOriginVerifier("https://admin.example.com");

    expect(verifyOrigin("https://admin.example.com")).toBe(true);
  });

  it.each([
    ["missing", null],
    ["opaque null", "null"],
    ["HTTP downgrade", "http://admin.example.com"],
    ["wrong hostname", "https://other.example.com"],
    ["evil suffix", "https://admin.example.com.evil.test"],
    ["evil subdomain", "https://evil.admin.example.com"],
    ["wrong port", "https://admin.example.com:444"],
    ["path", "https://admin.example.com/path"],
    ["query", "https://admin.example.com?next=/admin"],
    ["hash", "https://admin.example.com#fragment"],
    ["credentials", "https://user:pass@admin.example.com"],
    ["multiple origins", "https://admin.example.com, https://evil.example.com"],
    ["wildcard", "*"],
    ["surrounding whitespace", " https://admin.example.com "],
    ["trailing slash", "https://admin.example.com/"],
  ])("rejects %s", async (_scenario, originHeader) => {
    const verifyOrigin = await loadOriginVerifier("https://admin.example.com");

    expect(verifyOrigin(originHeader)).toBe(false);
  });

  it("accepts the exact configured local HTTP origin", async () => {
    const verifyOrigin = await loadOriginVerifier("http://localhost:3000");

    expect(verifyOrigin("http://localhost:3000")).toBe(true);
    expect(verifyOrigin("http://localhost")).toBe(false);
    expect(verifyOrigin("https://localhost:3000")).toBe(false);
  });
});
