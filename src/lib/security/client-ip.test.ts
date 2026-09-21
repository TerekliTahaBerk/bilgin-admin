import { afterEach, describe, expect, it, vi } from "vitest";

const ipAddress = vi.fn();

vi.mock("@vercel/functions", () => ({
  ipAddress: (...args: unknown[]) => ipAddress(...args),
}));

const { getVerifiedClientIp } = await import("@/lib/security/client-ip");

afterEach(() => {
  ipAddress.mockReset();
});

describe("getVerifiedClientIp", () => {
  it("returns the IPv4 address Vercel's edge proxy calculated", () => {
    ipAddress.mockReturnValue("203.0.113.42");

    const request = new Request("http://localhost:3000/api/session/login");

    expect(getVerifiedClientIp(request)).toBe("203.0.113.42");
    expect(ipAddress).toHaveBeenCalledWith(request);
  });

  it("returns the IPv6 address Vercel's edge proxy calculated", () => {
    ipAddress.mockReturnValue("2001:db8::1");

    const request = new Request("http://localhost:3000/api/session/login");

    expect(getVerifiedClientIp(request)).toBe("2001:db8::1");
  });

  it("returns null off Vercel, where there is no header to read", () => {
    ipAddress.mockReturnValue(undefined);

    const request = new Request("http://localhost:3000/api/session/login");

    expect(getVerifiedClientIp(request)).toBeNull();
  });

  it("returns null instead of forwarding an implausible value", () => {
    ipAddress.mockReturnValue("203.0.113.42\r\nX-Injected: yes");

    const request = new Request("http://localhost:3000/api/session/login");

    expect(getVerifiedClientIp(request)).toBeNull();
  });
});
