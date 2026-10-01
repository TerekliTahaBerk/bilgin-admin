import { describe, expect, it } from "vitest";

import {
  courseHref,
  exerciseHref,
  unitHref,
} from "@/features/content/content-links";

describe("content links", () => {
  it("builds course and unit paths", () => {
    expect(courseHref(3)).toBe("/courses/3");
    expect(unitHref(3, 30)).toBe("/courses/3/units/30");
  });

  it("opens the editor for an editor and the unit list otherwise", () => {
    const target = {
      courseId: 3,
      unitId: 30,
      exerciseId: 7,
      type: "numeric_input" as const,
    };

    expect(exerciseHref(target, true)).toBe("/courses/3/units/30/exercises/7");
    expect(exerciseHref(target, false)).toBe("/courses/3/units/30");
  });
});
