import { describe, expect, it } from "vitest";

import { coursesResponseSchema, type Course } from "@/contracts/admin/content";
import {
  groupCoursesByScope,
  isAwaitingContent,
  publishStatusLabels,
  summarizeCourses,
} from "@/features/content/courses-summary";
import { validCoursesResponse } from "@/test/fixtures/courses-api";

const courses: Course[] =
  coursesResponseSchema.parse(validCoursesResponse).data;

describe("summarizeCourses", () => {
  it("derives every figure from the payload rather than a constant", () => {
    const summary = summarizeCourses(courses);

    expect(summary.totalCourses).toBe(courses.length);
    expect(summary.publishedCourses).toBe(
      courses.filter((course) => course.status === "published").length,
    );
    expect(summary.totalUnits).toBe(
      courses.reduce((total, course) => total + course.unit_count, 0),
    );
  });

  it("counts only the published status, not review or archived", () => {
    expect(summarizeCourses(courses).publishedCourses).toBe(1);
  });

  it("returns zeroes for an empty catalogue", () => {
    expect(summarizeCourses([])).toEqual({
      totalCourses: 0,
      publishedCourses: 0,
      totalUnits: 0,
    });
  });

  it("exposes no exercise total, which /courses does not report", () => {
    expect(Object.keys(summarizeCourses(courses)).sort()).toEqual([
      "publishedCourses",
      "totalCourses",
      "totalUnits",
    ]);
  });
});

describe("groupCoursesByScope", () => {
  it("groups by scope in the order the backend sent them", () => {
    const groups = groupCoursesByScope(courses);

    expect(groups.map((group) => group.scope)).toEqual(["tyt", "ayt", "ydt"]);
    expect(groups.map((group) => group.label)).toEqual(["TYT", "AYT", "YDT"]);
  });

  it("preserves the backend ordering inside a group", () => {
    const [tyt] = groupCoursesByScope(courses);

    expect(tyt.courses.map((course) => course.code)).toEqual([
      "tyt_turkce",
      "tyt_matematik",
    ]);
  });

  it("produces no group for a scope with no courses", () => {
    const groups = groupCoursesByScope(courses);

    expect(groups.every((group) => group.courses.length > 0)).toBe(true);
    expect(groups.map((group) => group.scope)).not.toContain("lgs");
  });

  it("does not mutate the input", () => {
    const snapshot = structuredClone(courses);

    groupCoursesByScope(courses);

    expect(courses).toEqual(snapshot);
  });

  it("returns no groups for an empty catalogue", () => {
    expect(groupCoursesByScope([])).toEqual([]);
  });

  it("keeps every course exactly once", () => {
    const grouped = groupCoursesByScope(courses).flatMap(
      (group) => group.courses,
    );

    expect(grouped).toHaveLength(courses.length);
  });
});

describe("isAwaitingContent", () => {
  it("flags a course with no units", () => {
    expect(isAwaitingContent(courses.find((c) => c.unit_count === 0)!)).toBe(
      true,
    );
  });

  it("does not flag a course that has units", () => {
    expect(isAwaitingContent(courses.find((c) => c.unit_count > 0)!)).toBe(
      false,
    );
  });
});

describe("publishStatusLabels", () => {
  it("labels every backend status, review included", () => {
    expect(publishStatusLabels).toEqual({
      draft: "Taslak",
      review: "İncelemede",
      published: "Yayında",
      archived: "Arşiv",
    });
  });
});
