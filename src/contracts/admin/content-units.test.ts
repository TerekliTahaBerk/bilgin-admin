import { describe, expect, it } from "vitest";

import {
  accessLevels,
  publishStatuses,
  unitSchema,
  unitsResponseSchema,
} from "@/contracts/admin/content";
import {
  emptyUnitsResponse,
  validUnitsResponse,
} from "@/test/fixtures/courses-api";

const baseUnit = {
  id: 1,
  title: "İlk ve Orta Çağlarda Türk Dünyası",
  sort_order: 1,
  grade_level: 9,
  status: "published",
  access: "free",
  node_count: 6,
  exercise_count: 44,
};

describe("unitsResponseSchema", () => {
  it("accepts a representative backend payload", () => {
    const result = unitsResponseSchema.safeParse(validUnitsResponse);

    expect(result.success).toBe(true);
    expect(result.success && result.data.data).toHaveLength(3);
  });

  it("accepts a course with no units", () => {
    expect(unitsResponseSchema.safeParse(emptyUnitsResponse).success).toBe(
      true,
    );
  });

  it("accepts and strips additive unknown fields", () => {
    const result = unitsResponseSchema.parse({
      ...validUnitsResponse,
      data: [
        {
          ...baseUnit,
          description: "ileride eklenebilir",
          estimated_minutes: 25,
          difficulty_band: "orta",
        },
      ],
    });

    expect(result.data[0]).toEqual(baseUnit);
  });

  it("rejects a payload without the response envelope", () => {
    expect(unitsResponseSchema.safeParse([baseUnit]).success).toBe(false);
  });
});

describe("unitSchema identity and ordering", () => {
  it.each([
    ["a string id", { id: "1" }],
    ["a zero id", { id: 0 }],
    ["a negative id", { id: -3 }],
    ["an empty title", { title: "" }],
    ["a blank title", { title: "   " }],
  ])("rejects %s", (_label, override) => {
    expect(unitSchema.safeParse({ ...baseUnit, ...override }).success).toBe(
      false,
    );
  });

  it("accepts sort_order of zero", () => {
    expect(unitSchema.safeParse({ ...baseUnit, sort_order: 0 }).success).toBe(
      true,
    );
  });

  it.each([-1, 1.5, "2", null])(
    "rejects the invalid sort_order %s",
    (sort_order) => {
      expect(unitSchema.safeParse({ ...baseUnit, sort_order }).success).toBe(
        false,
      );
    },
  );
});

describe("unitSchema grade_level", () => {
  it("accepts a null grade level", () => {
    expect(
      unitSchema.safeParse({ ...baseUnit, grade_level: null }).success,
    ).toBe(true);
  });

  it.each([8, 9, 10, 11, 12])("accepts grade level %i", (grade_level) => {
    expect(unitSchema.safeParse({ ...baseUnit, grade_level }).success).toBe(
      true,
    );
  });

  it.each([5, 13, 0])(
    "accepts the stored grade level %i rather than narrowing to the creation range",
    (grade_level) => {
      expect(unitSchema.safeParse({ ...baseUnit, grade_level }).success).toBe(
        true,
      );
    },
  );

  it.each([9.5, "9", undefined])(
    "rejects the non-integer grade level %s",
    (grade_level) => {
      expect(unitSchema.safeParse({ ...baseUnit, grade_level }).success).toBe(
        false,
      );
    },
  );
});

describe("unitSchema status and access", () => {
  it.each(publishStatuses)("accepts the %s status", (status) => {
    expect(unitSchema.safeParse({ ...baseUnit, status }).success).toBe(true);
  });

  it("covers exactly the backend AccessLevel enum", () => {
    expect([...accessLevels]).toEqual(["free", "premium"]);
  });

  it.each(accessLevels)("accepts the %s access level", (access) => {
    expect(unitSchema.safeParse({ ...baseUnit, access }).success).toBe(true);
  });

  it.each(["paid", "FREE", "", "trial", null])(
    "rejects the unknown access level %s",
    (access) => {
      expect(unitSchema.safeParse({ ...baseUnit, access }).success).toBe(false);
    },
  );

  it.each(["live", "PUBLISHED", ""])(
    "rejects the unknown status %s",
    (status) => {
      expect(unitSchema.safeParse({ ...baseUnit, status }).success).toBe(false);
    },
  );
});

describe("unitSchema counts", () => {
  it("accepts zero counts", () => {
    expect(
      unitSchema.safeParse({ ...baseUnit, node_count: 0, exercise_count: 0 })
        .success,
    ).toBe(true);
  });

  it.each([
    ["a negative node_count", { node_count: -1 }],
    ["a negative exercise_count", { exercise_count: -1 }],
    ["a fractional node_count", { node_count: 1.5 }],
    ["a string exercise_count", { exercise_count: "44" }],
    ["a null node_count", { node_count: null }],
  ])("rejects %s", (_label, override) => {
    expect(unitSchema.safeParse({ ...baseUnit, ...override }).success).toBe(
      false,
    );
  });
});
