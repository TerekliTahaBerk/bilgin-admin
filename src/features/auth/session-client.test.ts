import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getSession,
  loginSession,
  logoutSession,
} from "@/features/auth/session-client";

const safeAdmin = {
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn<typeof fetch>();

  if (response instanceof Error) {
    fetchMock.mockRejectedValue(response);
  } else {
    fetchMock.mockResolvedValue(response);
  }

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser session client", () => {
  it("posts login only to the relative session endpoint without Authorization", async () => {
    const input = {
      email: "editor@example.test",
      password: "test-password",
    };
    const fetchMock = stubFetch(jsonResponse({ data: { admin: safeAdmin } }));

    await expect(loginSession(input)).resolves.toEqual({
      ok: true,
      admin: safeAdmin,
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);

    expect(url).toBe("/api/session/login");
    expect(String(url)).not.toContain("/api/admin/v1/");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("same-origin");
    expect(init?.cache).toBe("no-store");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.has("Authorization")).toBe(false);
    expect(JSON.parse(String(init?.body))).toEqual(input);
  });

  it("gets the session through the relative endpoint without Authorization", async () => {
    const fetchMock = stubFetch(jsonResponse({ data: { admin: safeAdmin } }));

    await expect(getSession()).resolves.toEqual({
      ok: true,
      admin: safeAdmin,
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];

    expect(url).toBe("/api/session/me");
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
  });

  it("posts local logout through the relative endpoint", async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));

    await expect(logoutSession()).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0] ?? [];

    expect(url).toBe("/api/session/logout");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("same-origin");
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
  });

  it("returns safe validation fields for the login form", async () => {
    stubFetch(
      jsonResponse(
        {
          error: {
            kind: "validation",
            status: 422,
            message: "The given data was invalid.",
            fields: { email: ["E-posta veya şifre hatalı."] },
          },
        },
        422,
      ),
    );

    await expect(
      loginSession({
        email: "editor@example.test",
        password: "wrong-password",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { fields: { email: ["E-posta veya şifre hatalı."] } },
    });
  });

  it("preserves a safe 429 result", async () => {
    stubFetch(
      jsonResponse(
        {
          error: {
            kind: "rate_limit",
            status: 429,
            message: "Çok fazla istek gönderildi.",
            retryAfterSeconds: 30,
          },
        },
        429,
      ),
    );

    await expect(
      loginSession({
        email: "editor@example.test",
        password: "test-password",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { kind: "rate_limit", retryAfterSeconds: 30 },
    });
  });

  it("does not expose malformed raw response content", async () => {
    stubFetch(
      new Response("<html>private backend stack and token</html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const result = await getSession();

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "protocol", status: 502 },
    });
    expect(JSON.stringify(result)).not.toContain("private backend stack");
  });

  it("normalizes browser network failures without raw exception leakage", async () => {
    stubFetch(new TypeError("private browser network exception"));

    const result = await getSession();

    expect(result).toMatchObject({ ok: false, error: { kind: "network" } });
    expect(JSON.stringify(result)).not.toContain("private browser network");
  });
});
