import { afterEach, describe, expect, it, vi } from "vitest";

import { adminContent } from "@/lib/backend/admin-content";
import {
  ADMIN_COURSES_TIMEOUT_MS,
  ADMIN_UNITS_TIMEOUT_MS,
} from "@/lib/backend/client";
import {
  validCoursesResponse,
  validUnitsResponse,
} from "@/test/fixtures/courses-api";

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

describe("adminContent.courses request", () => {
  it("calls the fixed courses endpoint with the session token", async () => {
    const fetchMock = stubFetch(jsonResponse(validCoursesResponse));

    await adminContent.courses(BACKEND_TOKEN);

    const request = requestFrom(fetchMock);

    expect(request.url).toBe("http://localhost:8000/api/admin/v1/courses");
    expect(request.init.method).toBe("GET");
    expect(request.headers.get("authorization")).toBe(
      `Bearer ${BACKEND_TOKEN}`,
    );
    expect(request.headers.get("accept")).toBe("application/json");
    expect(request.init.cache).toBe("no-store");
    expect(request.init.body).toBeUndefined();
  });

  it("forwards no browser-controlled header to the backend", async () => {
    const fetchMock = stubFetch(jsonResponse(validCoursesResponse));

    await adminContent.courses(BACKEND_TOKEN);

    const { headers } = requestFrom(fetchMock);

    for (const header of [
      "cookie",
      "origin",
      "host",
      "referer",
      "x-forwarded-for",
      "x-real-ip",
      "forwarded",
    ]) {
      expect(headers.get(header)).toBeNull();
    }
    expect([...headers.keys()].sort()).toEqual(["accept", "authorization"]);
  });

  it("applies a ten second timeout signal", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = stubFetch(jsonResponse(validCoursesResponse));

    await adminContent.courses(BACKEND_TOKEN);

    expect(ADMIN_COURSES_TIMEOUT_MS).toBe(10_000);
    expect(timeoutSpy).toHaveBeenCalledWith(ADMIN_COURSES_TIMEOUT_MS);
    expect(requestFrom(fetchMock).init.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects an empty backend token before making a request", async () => {
    const fetchMock = stubFetch(jsonResponse(validCoursesResponse));

    expect(() => adminContent.courses("   ")).toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("adminContent.courses responses", () => {
  it("parses a valid payload against the contract", async () => {
    stubFetch(jsonResponse(validCoursesResponse));

    const result = await adminContent.courses(BACKEND_TOKEN);

    expect(result.ok).toBe(true);
    expect(result.ok && result.data.data).toHaveLength(4);
    expect(result.ok && result.data.data[0]?.code).toBe("tyt_turkce");
  });

  it("returns a contract error for a payload that breaks the schema", async () => {
    stubFetch(
      jsonResponse({
        data: [{ id: 1, code: "x", name: "X", scope: "lys", status: "live" }],
        meta: { server_time: "2026-09-16T19:05:20+00:00" },
      }),
    );

    const result = await adminContent.courses(BACKEND_TOKEN);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe("contract");
  });

  it.each([
    [401, "authentication"],
    [403, "authorization"],
    [500, "server"],
  ] as const)("maps a backend %i to a %s error", async (status, kind) => {
    stubFetch(jsonResponse({ error: { code: "X", message: "y" } }, status));

    const result = await adminContent.courses(BACKEND_TOKEN);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe(kind);
  });

  it("returns a network error without retrying", async () => {
    const fetchMock = stubFetch(new TypeError("fetch failed"));

    const result = await adminContent.courses(BACKEND_TOKEN);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe("network");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("issues exactly one request for an error response", async () => {
    const fetchMock = stubFetch(jsonResponse({ message: "nope" }, 500));

    await adminContent.courses(BACKEND_TOKEN);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns a protocol error for an HTML error page", async () => {
    stubFetch(
      new Response("<html>SQLSTATE[HY000] /var/www/app.php</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const result = await adminContent.courses(BACKEND_TOKEN);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe("protocol");
    expect(!result.ok && JSON.stringify(result.error)).not.toContain(
      "SQLSTATE",
    );
  });
});

describe("adminContent.units request", () => {
  it("builds the backend path from the numeric course id", async () => {
    const fetchMock = stubFetch(jsonResponse(validUnitsResponse));

    await adminContent.units(42, BACKEND_TOKEN);

    const request = requestFrom(fetchMock);

    expect(request.url).toBe(
      "http://localhost:8000/api/admin/v1/courses/42/units",
    );
    expect(request.init.method).toBe("GET");
    expect(request.headers.get("authorization")).toBe(
      `Bearer ${BACKEND_TOKEN}`,
    );
    expect(request.headers.get("accept")).toBe("application/json");
    expect(request.init.cache).toBe("no-store");
    expect(request.init.body).toBeUndefined();
  });

  it("forwards no browser-controlled header to the backend", async () => {
    const fetchMock = stubFetch(jsonResponse(validUnitsResponse));

    await adminContent.units(1, BACKEND_TOKEN);

    const { headers } = requestFrom(fetchMock);

    for (const header of [
      "cookie",
      "origin",
      "host",
      "referer",
      "x-forwarded-for",
      "x-real-ip",
      "forwarded",
    ]) {
      expect(headers.get(header)).toBeNull();
    }
    expect([...headers.keys()].sort()).toEqual(["accept", "authorization"]);
  });

  it("applies a ten second timeout signal", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    stubFetch(jsonResponse(validUnitsResponse));

    await adminContent.units(1, BACKEND_TOKEN);

    expect(ADMIN_UNITS_TIMEOUT_MS).toBe(10_000);
    expect(timeoutSpy).toHaveBeenCalledWith(ADMIN_UNITS_TIMEOUT_MS);
  });
});

describe("adminContent.units path safety", () => {
  it.each([
    ["zero", 0],
    ["a negative id", -1],
    ["a fractional id", 1.5],
    ["a string id", "1" as unknown as number],
    ["a traversal string", "1/../../me" as unknown as number],
    ["a query string", "1?x=y" as unknown as number],
    ["a word", "abc" as unknown as number],
    ["an unsafe integer", 999999999999999999999],
    ["NaN", Number.NaN],
  ])("refuses %s before any request", async (_label, courseId) => {
    const fetchMock = stubFetch(jsonResponse(validUnitsResponse));

    expect(() => adminContent.units(courseId, BACKEND_TOKEN)).toThrow(
      TypeError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty backend token before making a request", async () => {
    const fetchMock = stubFetch(jsonResponse(validUnitsResponse));

    expect(() => adminContent.units(1, "   ")).toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("adminContent.units responses", () => {
  it("parses a valid payload against the contract", async () => {
    stubFetch(jsonResponse(validUnitsResponse));

    const result = await adminContent.units(1, BACKEND_TOKEN);

    expect(result.ok).toBe(true);
    expect(result.ok && result.data.data).toHaveLength(3);
    expect(result.ok && result.data.data[0]?.title).toBe(
      "İlk ve Orta Çağlarda Türk Dünyası",
    );
  });

  it("returns a contract error for a payload that breaks the schema", async () => {
    stubFetch(
      jsonResponse({
        data: [{ id: 1, title: "X", status: "live", access: "paid" }],
        meta: { server_time: "2026-09-16T19:05:20+00:00" },
      }),
    );

    const result = await adminContent.units(1, BACKEND_TOKEN);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe("contract");
  });

  it.each([
    [401, "authentication"],
    [403, "authorization"],
    [404, "not_found"],
    [500, "server"],
  ] as const)("maps a backend %i to a %s error", async (status, kind) => {
    stubFetch(jsonResponse({ error: { code: "X", message: "y" } }, status));

    const result = await adminContent.units(1, BACKEND_TOKEN);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe(kind);
  });

  it("returns a network error with exactly one attempt", async () => {
    const fetchMock = stubFetch(new TypeError("fetch failed"));

    const result = await adminContent.units(1, BACKEND_TOKEN);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe("network");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("issues exactly one request for an error response", async () => {
    const fetchMock = stubFetch(jsonResponse({ message: "nope" }, 500));

    await adminContent.units(1, BACKEND_TOKEN);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
