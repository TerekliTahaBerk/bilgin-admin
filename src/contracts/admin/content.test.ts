import { describe, expect, it } from "vitest";

import {
  courseSchema,
  courseScopes,
  coursesResponseSchema,
  publishStatuses,
} from "@/contracts/admin/content";
import {
  emptyCoursesResponse,
  validCoursesResponse,
} from "@/test/fixtures/courses-api";

const baseCourse = {
  id: 1,
  code: "tyt_turkce",
  name: "TYT Türkçe",
  scope: "tyt",
  status: "published",
  unit_count: 2,
};

describe("coursesResponseSchema", () => {
  it("accepts a representative backend payload", () => {
    const result = coursesResponseSchema.safeParse(validCoursesResponse);

    expect(result.success).toBe(true);
    expect(result.success && result.data.data).toHaveLength(4);
  });

  it("accepts an empty catalogue", () => {
    expect(coursesResponseSchema.safeParse(emptyCoursesResponse).success).toBe(
      true,
    );
  });

  it("accepts and strips additive unknown fields", () => {
    const result = coursesResponseSchema.parse({
      ...validCoursesResponse,
      future_top_level: true,
      data: [{ ...baseCourse, short_name: "Türkçe", color: "#fff" }],
    });

    expect(result.data[0]).toEqual(baseCourse);
  });

  it("rejects a payload whose data is not an array", () => {
    expect(
      coursesResponseSchema.safeParse({
        data: baseCourse,
        meta: validCoursesResponse.meta,
      }).success,
    ).toBe(false);
  });

  it("rejects a payload without the response envelope", () => {
    expect(coursesResponseSchema.safeParse([baseCourse]).success).toBe(false);
  });
});

describe("courseSchema scope", () => {
  it("covers exactly the backend CourseScope enum", () => {
    expect([...courseScopes]).toEqual([
      "tyt",
      "ayt",
      "ydt",
      "lgs",
      "kpss",
      "ales",
      "yds",
    ]);
  });

  it.each(courseScopes)("accepts the %s scope", (scope) => {
    expect(courseSchema.safeParse({ ...baseCourse, scope }).success).toBe(true);
  });

  it.each(["tyt_ayt", "TYT", "", "lys"])(
    "rejects the unknown scope %s",
    (scope) => {
      expect(courseSchema.safeParse({ ...baseCourse, scope }).success).toBe(
        false,
      );
    },
  );
});

describe("courseSchema status", () => {
  it("covers exactly the backend PublishStatus enum", () => {
    expect([...publishStatuses]).toEqual([
      "draft",
      "review",
      "published",
      "archived",
    ]);
  });

  it.each(publishStatuses)("accepts the %s status", (status) => {
    expect(courseSchema.safeParse({ ...baseCourse, status }).success).toBe(
      true,
    );
  });

  it("accepts the review status the panel document omitted", () => {
    expect(
      courseSchema.safeParse({ ...baseCourse, status: "review" }).success,
    ).toBe(true);
  });

  it.each(["pending", "PUBLISHED", "", "live"])(
    "rejects the unknown status %s so it is never silently treated as published",
    (status) => {
      expect(courseSchema.safeParse({ ...baseCourse, status }).success).toBe(
        false,
      );
    },
  );
});

describe("courseSchema fields", () => {
  it("accepts unit_count of zero", () => {
    expect(
      courseSchema.safeParse({ ...baseCourse, unit_count: 0 }).success,
    ).toBe(true);
  });

  it.each([-1, 1.5, "2", null])(
    "rejects the invalid unit_count %s",
    (unit_count) => {
      expect(
        courseSchema.safeParse({ ...baseCourse, unit_count }).success,
      ).toBe(false);
    },
  );

  it.each([
    ["an empty code", { code: "" }],
    ["a blank name", { name: "   " }],
    ["a string id", { id: "1" }],
    ["a zero id", { id: 0 }],
    ["a fractional id", { id: 1.5 }],
  ])("rejects %s", (_label, override) => {
    expect(courseSchema.safeParse({ ...baseCourse, ...override }).success).toBe(
      false,
    );
  });
});
