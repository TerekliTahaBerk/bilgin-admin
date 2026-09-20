import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SafeAdmin } from "@/contracts/admin/session";
import { config, proxy } from "@/proxy";
import {
  sessionCookiePolicy,
  sessionMaxAgeSeconds,
} from "@/lib/session/config";
import {
  createAdminSessionPayload,
  sealAdminSession,
} from "@/lib/session/write";

const NOW = 1_800_000_000_000;
const admin: SafeAdmin = {
  id: "3eaa9588-9307-43d7-9021-6f6a330ce50d",
  name: "Test Editör",
  email: "editor@example.test",
  role: "content_editor",
  roleLabel: "İçerik Editörü",
  abilities: {
    edit_content: true,
    publish_content: false,
    edit_curriculum: false,
    view_users: false,
  },
};

function rootRequest(seal?: string) {
  const headers = new Headers();

  if (seal !== undefined) {
    headers.set("Cookie", `${sessionCookiePolicy.name}=${seal}`);
  }

  return new NextRequest("http://localhost:3000/", { headers });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("optimistic root proxy", () => {
  it("matches exactly the protected routes that exist today", () => {
    expect(config).toEqual({
      matcher: [
        "/",
        "/courses",
        "/courses/:path*",
        "/content/:path*",
        "/curriculum",
        "/admins",
      ],
    });
  });

  it("declares no matcher for a route that does not exist yet", () => {
    const matchers = config.matcher as string[];

    for (const absent of ["/units", "/exercises", "/analytics", "/users"]) {
      expect(matchers.some((pattern) => pattern.startsWith(absent))).toBe(
        false,
      );
    }
  });

  it.each([
    ["missing", undefined],
    ["malformed", "not-a-seal"],
  ])("redirects a %s local session to /login", async (_case, seal) => {
    const response = await proxy(rootRequest(seal));

    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe(
      "http://localhost:3000/login",
    );
  });

  it("redirects an expired local session", async () => {
    const session = createAdminSessionPayload(
      { backendToken: "test-admin-token", admin },
      NOW - sessionMaxAgeSeconds * 1000,
    );

    const response = await proxy(rootRequest(await sealAdminSession(session)));

    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe(
      "http://localhost:3000/login",
    );
  });

  it("allows a valid but stale local session without backend access", async () => {
    const session = createAdminSessionPayload(
      { backendToken: "test-admin-token", admin },
      NOW - 6 * 60 * 1000,
    );
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxy(rootRequest(await sealAdminSession(session)));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
