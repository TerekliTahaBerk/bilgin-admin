import { afterEach, describe, expect, it, vi } from "vitest";

import {
  customDomainValidationError,
  customForbiddenError,
  laravelCredentialValidationError,
  malformedAdminResponse,
  validAdminMeResponse,
  validEditorLoginResponse,
} from "@/test/fixtures/admin-api";
import { adminBackend } from "@/lib/backend/admin-auth";
import {
  ADMIN_LOGIN_TIMEOUT_MS,
  ADMIN_ME_TIMEOUT_MS,
} from "@/lib/backend/client";

const LOGIN_INPUT = {
  email: "editor@example.test",
  password: "test-password-must-not-leak",
};

const BACKEND_TOKEN = "test-explicit-backend-token";

function jsonResponse(
  body: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
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

function requestFrom(fetchMock: ReturnType<typeof stubFetch>) {
  const call = fetchMock.mock.calls[0];

  if (!call) {
    throw new Error("Expected fetch to be called.");
  }

  const [input, init] = call;

  return {
    url: String(input),
    init: init ?? {},
    headers: new Headers(init?.headers),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("admin backend request safety", () => {
  it("sends login only to the fixed admin endpoint with explicit headers", async () => {
    const fetchMock = stubFetch(jsonResponse(validEditorLoginResponse));

    await adminBackend.login(LOGIN_INPUT);

    const request = requestFrom(fetchMock);

    expect(request.url).toBe("http://localhost:8000/api/admin/v1/auth/login");
    expect(request.url).not.toContain("/api/v1/");
    expect(request.init.method).toBe("POST");
    expect(request.init.cache).toBe("no-store");
    expect(request.headers.get("Accept")).toBe("application/json");
    expect(request.headers.get("Content-Type")).toBe("application/json");
    expect(request.headers.has("Authorization")).toBe(false);
    expect(JSON.parse(String(request.init.body))).toEqual(LOGIN_INPUT);
  });

  it("sends /me only to the fixed admin endpoint with the explicit token", async () => {
    const fetchMock = stubFetch(jsonResponse(validAdminMeResponse));

    await adminBackend.me(BACKEND_TOKEN);

    const request = requestFrom(fetchMock);

    expect(request.url).toBe("http://localhost:8000/api/admin/v1/me");
    expect(request.url).not.toContain("/api/v1/me");
    expect(request.init.method).toBe("GET");
    expect(request.init.cache).toBe("no-store");
    expect(request.init.body).toBeUndefined();
    expect(request.headers.get("Accept")).toBe("application/json");
    expect(request.headers.has("Content-Type")).toBe(false);
    expect(request.headers.get("Authorization")).toBe(
      `Bearer ${BACKEND_TOKEN}`,
    );
  });

  it("does not provide an arbitrary header forwarding surface", async () => {
    const fetchMock = stubFetch(jsonResponse(validAdminMeResponse));

    await adminBackend.me(BACKEND_TOKEN);

    const { headers } = requestFrom(fetchMock);
    const forbiddenHeaders = [
      "Cookie",
      "Host",
      "Origin",
      "X-Forwarded-For",
      "Forwarded",
      "X-Real-IP",
      "Connection",
    ];

    for (const header of forbiddenHeaders) {
      expect(headers.has(header), header).toBe(false);
    }
  });

  it("rejects an empty explicit backend token before fetch", async () => {
    const fetchMock = stubFetch(jsonResponse(validAdminMeResponse));

    expect(() => adminBackend.me("   ")).toThrow(
      "A backend token is required.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("admin backend success contracts", () => {
  it("returns a typed login response and preserves the backend token", async () => {
    stubFetch(jsonResponse(validEditorLoginResponse));

    await expect(adminBackend.login(LOGIN_INPUT)).resolves.toEqual({
      ok: true,
      data: validEditorLoginResponse,
    });
  });

  it("returns a typed /me response without inventing abilities", async () => {
    stubFetch(
      new Response(JSON.stringify(validAdminMeResponse), {
        status: 200,
        headers: { "Content-Type": "application/vnd.api+json; charset=utf-8" },
      }),
    );

    const result = await adminBackend.me(BACKEND_TOKEN);

    expect(result).toEqual({ ok: true, data: validAdminMeResponse });
    expect(result.ok && result.data.data).not.toHaveProperty("abilities");
  });
});

describe("admin backend HTTP error normalization", () => {
  it("preserves Laravel 422 field errors", async () => {
    stubFetch(jsonResponse(laravelCredentialValidationError, 422));

    await expect(adminBackend.login(LOGIN_INPUT)).resolves.toEqual({
      ok: false,
      error: {
        kind: "validation",
        status: 422,
        message: laravelCredentialValidationError.message,
        fields: laravelCredentialValidationError.errors,
      },
    });
  });

  it("preserves custom domain error codes and details", async () => {
    stubFetch(jsonResponse(customDomainValidationError, 422));

    await expect(adminBackend.login(LOGIN_INPUT)).resolves.toMatchObject({
      ok: false,
      error: {
        kind: "validation",
        code: "TOPIC_MISMATCH",
        details: customDomainValidationError.error.details,
      },
    });
  });

  it("maps a non-JSON 401 to authentication", async () => {
    stubFetch(
      new Response("private authentication detail", {
        status: 401,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    const result = await adminBackend.me(BACKEND_TOKEN);

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "authentication", status: 401 },
    });
    expect(JSON.stringify(result)).not.toContain(
      "private authentication detail",
    );
  });

  it("preserves a valid 403 code", async () => {
    stubFetch(jsonResponse(customForbiddenError, 403));

    await expect(adminBackend.me(BACKEND_TOKEN)).resolves.toMatchObject({
      ok: false,
      error: { kind: "authorization", status: 403, code: "FORBIDDEN" },
    });
  });

  it("maps 429 and integer Retry-After", async () => {
    stubFetch(jsonResponse({}, 429, { "Retry-After": "30" }));

    await expect(adminBackend.login(LOGIN_INPUT)).resolves.toMatchObject({
      ok: false,
      error: { kind: "rate_limit", retryAfterSeconds: 30 },
    });
  });

  it("redacts an HTML 5xx response", async () => {
    stubFetch(
      new Response("<html>SQLSTATE private stack trace</html>", {
        status: 500,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const result = await adminBackend.login(LOGIN_INPUT);

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "server", status: 500 },
    });
    expect(JSON.stringify(result)).not.toContain("SQLSTATE");
    expect(JSON.stringify(result)).not.toContain(LOGIN_INPUT.password);
  });
});

describe("admin backend protocol and contract handling", () => {
  it("rejects a non-JSON 2xx response as a protocol error", async () => {
    stubFetch(
      new Response("ok", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    await expect(adminBackend.login(LOGIN_INPUT)).resolves.toMatchObject({
      ok: false,
      error: { kind: "protocol", status: 200 },
    });
  });

  it("rejects malformed or empty JSON 2xx responses as protocol errors", async () => {
    for (const body of ["{broken", ""]) {
      stubFetch(
        new Response(body, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await expect(adminBackend.login(LOGIN_INPUT)).resolves.toMatchObject({
        ok: false,
        error: { kind: "protocol", status: 200 },
      });
    }
  });

  it("rejects a schema mismatch without exposing raw values", async () => {
    stubFetch(jsonResponse(malformedAdminResponse));

    const result = await adminBackend.login(LOGIN_INPUT);

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "contract", status: 200 },
    });
    expect(JSON.stringify(result)).not.toContain("raw-token-must-not-leak");
    expect(JSON.stringify(result)).not.toContain("raw-password-must-not-leak");
    expect(JSON.stringify(result)).not.toContain(LOGIN_INPUT.password);
  });
});

describe("admin backend network, timeout and retry policy", () => {
  it("normalizes a network rejection and does not retry login", async () => {
    const fetchMock = stubFetch(new TypeError("private network failure"));

    const result = await adminBackend.login(LOGIN_INPUT);

    expect(result).toMatchObject({ ok: false, error: { kind: "network" } });
    expect(JSON.stringify(result)).not.toContain("private network failure");
    expect(JSON.stringify(result)).not.toContain(LOGIN_INPUT.password);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry /me after a network rejection", async () => {
    const fetchMock = stubFetch(new TypeError("private network failure"));

    const result = await adminBackend.me(BACKEND_TOKEN);

    expect(result).toMatchObject({ ok: false, error: { kind: "network" } });
    expect(JSON.stringify(result)).not.toContain(BACKEND_TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["login", ADMIN_LOGIN_TIMEOUT_MS],
    ["me", ADMIN_ME_TIMEOUT_MS],
  ] as const)(
    "applies the %s timeout as a network-safe abort",
    async (operation, timeoutMs) => {
      const timeoutController = new AbortController();
      timeoutController.abort();
      const timeoutSpy = vi
        .spyOn(AbortSignal, "timeout")
        .mockReturnValue(timeoutController.signal);
      const fetchMock = vi.fn<typeof fetch>((_input, init) => {
        expect(init?.signal?.aborted).toBe(true);
        return Promise.reject(
          new DOMException("private timeout", "AbortError"),
        );
      });
      vi.stubGlobal("fetch", fetchMock);

      const result =
        operation === "login"
          ? await adminBackend.login(LOGIN_INPUT)
          : await adminBackend.me(BACKEND_TOKEN);

      expect(timeoutSpy).toHaveBeenCalledWith(timeoutMs);
      expect(result).toMatchObject({ ok: false, error: { kind: "network" } });
      expect(JSON.stringify(result)).not.toContain("private timeout");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("combines caller abort with the timeout signal", async () => {
    const callerController = new AbortController();
    callerController.abort();
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      expect(init?.signal).not.toBe(callerController.signal);
      expect(init?.signal?.aborted).toBe(true);
      return Promise.reject(new DOMException("caller aborted", "AbortError"));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await adminBackend.me(BACKEND_TOKEN, {
      signal: callerController.signal,
    });

    expect(result).toMatchObject({ ok: false, error: { kind: "network" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
