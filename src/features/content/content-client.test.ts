import { afterEach, describe, expect, it, vi } from "vitest";

import { getCourseUnits, getCourses } from "@/features/content/content-client";
import type { ApiError } from "@/lib/api/error";
import {
  validCoursesResponse,
  validUnitsResponse,
} from "@/test/fixtures/courses-api";

function jsonResponse(body: unknown, status = 200): Response {
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("getCourses request", () => {
  it("calls only the relative BFF path", async () => {
    const fetchMock = stubFetch(
      jsonResponse({ data: validCoursesResponse.data }),
    );

    await getCourses();

    const [path, init] = fetchMock.mock.calls[0]!;

    expect(path).toBe("/api/admin/courses");
    expect(init?.method).toBe("GET");
    expect(init?.credentials).toBe("same-origin");
    expect(init?.cache).toBe("no-store");
  });

  it("sends no Authorization header and knows no backend origin", async () => {
    const fetchMock = stubFetch(jsonResponse({ data: [] }));

    await getCourses();

    const [path, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init?.headers);

    expect(headers.get("authorization")).toBeNull();
    expect(String(path)).not.toContain("http");
    expect(String(path)).not.toContain("admin/v1");
  });
});

describe("getCourses responses", () => {
  it("returns the parsed course list", async () => {
    stubFetch(jsonResponse({ data: validCoursesResponse.data }));

    const courses = await getCourses();

    expect(courses).toHaveLength(4);
    expect(courses[0]?.code).toBe("tyt_turkce");
  });

  it("strips additive unknown course fields", async () => {
    stubFetch(
      jsonResponse({
        data: [{ ...validCoursesResponse.data[0], color: "#fff" }],
      }),
    );

    const [course] = await getCourses();

    expect(course).not.toHaveProperty("color");
  });

  it("rejects with a contract error when the BFF payload is malformed", async () => {
    stubFetch(jsonResponse({ data: [{ id: 1, code: "x" }] }));

    await expect(getCourses()).rejects.toMatchObject({ kind: "contract" });
  });

  it("rejects with a contract error when the body is not JSON", async () => {
    stubFetch(new Response("not json", { status: 200 }));

    await expect(getCourses()).rejects.toMatchObject({ kind: "contract" });
  });

  it.each([
    ["authentication", 401],
    ["authorization", 403],
    ["server", 502],
  ] as const)("passes a %s error through unchanged", async (kind, status) => {
    const error: ApiError = { kind, status, message: "Bir hata oluştu." };
    stubFetch(jsonResponse({ error }, status));

    await expect(getCourses()).rejects.toMatchObject({ kind, status });
  });

  it("rejects with a network error when the request cannot be made", async () => {
    stubFetch(new TypeError("fetch failed"));

    await expect(getCourses()).rejects.toMatchObject({ kind: "network" });
  });

  it("rejects with a contract error for an unparseable error body", async () => {
    stubFetch(new Response("<html>boom</html>", { status: 500 }));

    await expect(getCourses()).rejects.toMatchObject({ kind: "contract" });
  });
});

describe("getCourseUnits request", () => {
  it("builds the relative BFF path from the numeric course id", async () => {
    const fetchMock = stubFetch(
      jsonResponse({ data: validUnitsResponse.data }),
    );

    await getCourseUnits(42);

    const [path, init] = fetchMock.mock.calls[0]!;

    expect(path).toBe("/api/admin/courses/42/units");
    expect(init?.method).toBe("GET");
    expect(init?.credentials).toBe("same-origin");
    expect(init?.cache).toBe("no-store");
  });

  it("sends no Authorization header and knows no backend origin", async () => {
    const fetchMock = stubFetch(jsonResponse({ data: [] }));

    await getCourseUnits(1);

    const [path, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init?.headers);

    expect(headers.get("authorization")).toBeNull();
    expect(String(path)).not.toContain("http");
    expect(String(path)).not.toContain("admin/v1");
  });

  it.each([
    ["zero", 0],
    ["a negative id", -1],
    ["a fractional id", 1.5],
    ["a traversal string", "1/../../me" as unknown as number],
    ["a query string", "1?x=y" as unknown as number],
    ["a string id", "1" as unknown as number],
  ])("refuses %s without issuing a request", async (_label, courseId) => {
    const fetchMock = stubFetch(jsonResponse({ data: [] }));

    expect(() => getCourseUnits(courseId)).toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getCourseUnits responses", () => {
  it("returns the parsed unit list", async () => {
    stubFetch(jsonResponse({ data: validUnitsResponse.data }));

    const units = await getCourseUnits(1);

    expect(units).toHaveLength(3);
    expect(units[0]?.title).toBe("İlk ve Orta Çağlarda Türk Dünyası");
    expect(units[2]?.grade_level).toBeNull();
  });

  it("strips additive unknown unit fields", async () => {
    stubFetch(
      jsonResponse({
        data: [{ ...validUnitsResponse.data[0], estimated_minutes: 25 }],
      }),
    );

    const [unit] = await getCourseUnits(1);

    expect(unit).not.toHaveProperty("estimated_minutes");
  });

  it("passes a 404 through so the page can say the course is missing", async () => {
    const error: ApiError = {
      kind: "not_found",
      status: 404,
      message: "İstenen kaynak bulunamadı.",
    };
    stubFetch(jsonResponse({ error }, 404));

    await expect(getCourseUnits(1)).rejects.toMatchObject({
      kind: "not_found",
      status: 404,
    });
  });

  it("rejects with a contract error when the payload is malformed", async () => {
    stubFetch(jsonResponse({ data: [{ id: 1, title: "x" }] }));

    await expect(getCourseUnits(1)).rejects.toMatchObject({
      kind: "contract",
    });
  });

  it("rejects with a network error when the request cannot be made", async () => {
    stubFetch(new TypeError("fetch failed"));

    await expect(getCourseUnits(1)).rejects.toMatchObject({ kind: "network" });
  });
});
