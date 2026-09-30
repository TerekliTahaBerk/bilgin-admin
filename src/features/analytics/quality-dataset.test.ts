import { describe, expect, it } from "vitest";

import {
  buildQualityRows,
  hasHighCorrectRate,
  hasLowCorrectRate,
  HIGH_CORRECT_RATE_MIN,
  isUnsolved,
  LOW_CORRECT_RATE_MAX,
  qualityTopicOptions,
  scanCoverage,
  summarizeQuality,
} from "@/features/analytics/quality-dataset";
import {
  qualityCourse,
  qualityExercise,
  qualityRow,
  qualityUnit,
  qualityUnitExercises,
} from "@/test/fixtures/quality";

describe("buildQualityRows", () => {
  const courses = [
    qualityCourse(1, { name: "TYT Tarih" }),
    qualityCourse(2, { name: "AYT Fizik" }),
  ];
  const units = [
    { courseId: 1, unit: qualityUnit(10) },
    { courseId: 2, unit: qualityUnit(20) },
  ];

  it("places each exercise in its course and unit, keeping backend fields verbatim", () => {
    const exercise = qualityExercise(5, {
      stats: { attempts: 40, correct_rate: 97, needs_review: true },
    });
    const rows = buildQualityRows(courses, units, [
      { unitId: 20, data: qualityUnitExercises(20, [exercise], "Kuvvet") },
    ]);

    expect(rows).toEqual([
      {
        ...exercise,
        course: { id: 2, name: "AYT Fizik" },
        unit: { id: 20, title: "Kuvvet" },
      },
    ]);
  });

  it("drops a list whose unit is not in any known course-unit list", () => {
    const rows = buildQualityRows(courses, units, [
      { unitId: 99, data: qualityUnitExercises(99, [qualityExercise(1)]) },
    ]);

    expect(rows).toEqual([]);
  });

  it("drops a list whose course is missing from the courses payload", () => {
    const rows = buildQualityRows([courses[0]!], units, [
      { unitId: 20, data: qualityUnitExercises(20, [qualityExercise(1)]) },
    ]);

    expect(rows).toEqual([]);
  });

  it("drops a list the backend returned for a different unit", () => {
    const rows = buildQualityRows(courses, units, [
      { unitId: 10, data: qualityUnitExercises(20, [qualityExercise(1)]) },
    ]);

    expect(rows).toEqual([]);
  });

  it("keeps rows from several units in list order", () => {
    const rows = buildQualityRows(courses, units, [
      { unitId: 10, data: qualityUnitExercises(10, [qualityExercise(1)]) },
      {
        unitId: 20,
        data: qualityUnitExercises(20, [
          qualityExercise(2),
          qualityExercise(3),
        ]),
      },
    ]);

    expect(rows.map((row) => [row.id, row.course.id, row.unit.id])).toEqual([
      [1, 1, 10],
      [2, 2, 20],
      [3, 2, 20],
    ]);
  });
});

describe("rate bands", () => {
  it("never treats an unsolved question as a low rate", () => {
    const unsolved = qualityRow(1);

    expect(isUnsolved(unsolved)).toBe(true);
    expect(hasLowCorrectRate(unsolved)).toBe(false);
    expect(hasHighCorrectRate(unsolved)).toBe(false);
  });

  it("includes the band edges", () => {
    expect(
      hasLowCorrectRate(
        qualityRow(1, {
          stats: { attempts: 5, correct_rate: LOW_CORRECT_RATE_MAX },
        }),
      ),
    ).toBe(true);
    expect(
      hasLowCorrectRate(
        qualityRow(1, {
          stats: { attempts: 5, correct_rate: LOW_CORRECT_RATE_MAX + 1 },
        }),
      ),
    ).toBe(false);
    expect(
      hasHighCorrectRate(
        qualityRow(1, {
          stats: { attempts: 5, correct_rate: HIGH_CORRECT_RATE_MIN },
        }),
      ),
    ).toBe(true);
    expect(
      hasHighCorrectRate(
        qualityRow(1, {
          stats: { attempts: 5, correct_rate: HIGH_CORRECT_RATE_MIN - 1 },
        }),
      ),
    ).toBe(false);
  });

  it("counts a 0% rate as low — it is a real, attempted result", () => {
    expect(
      hasLowCorrectRate(
        qualityRow(1, { stats: { attempts: 3, correct_rate: 0 } }),
      ),
    ).toBe(true);
  });
});

describe("summarizeQuality", () => {
  it("returns zeros for an empty dataset, keeping every status", () => {
    expect(summarizeQuality([])).toEqual({
      total: 0,
      needsReview: 0,
      unsolved: 0,
      highRate: 0,
      lowRate: 0,
      edited: 0,
      byStatus: { draft: 0, review: 0, published: 0, archived: 0 },
    });
  });

  it("counts needs_review from the backend flag only", () => {
    const rows = [
      // Would look "problematic" by rate, but the backend did not flag it.
      qualityRow(1, { stats: { attempts: 5, correct_rate: 100 } }),
      qualityRow(2, {
        stats: { attempts: 30, correct_rate: 50, needs_review: true },
      }),
    ];

    expect(summarizeQuality(rows).needsReview).toBe(1);
  });

  it("counts every metric and status", () => {
    const rows = [
      qualityRow(1, { status: "draft" }),
      qualityRow(2, {
        status: "review",
        version: 2,
        stats: { attempts: 20, correct_rate: 95, needs_review: true },
      }),
      qualityRow(3, {
        status: "published",
        stats: { attempts: 25, correct_rate: 8, needs_review: true },
      }),
      qualityRow(4, {
        status: "archived",
        version: 4,
        stats: { attempts: 3, correct_rate: 60 },
      }),
    ];

    expect(summarizeQuality(rows)).toEqual({
      total: 4,
      needsReview: 2,
      unsolved: 1,
      highRate: 1,
      lowRate: 1,
      edited: 2,
      byStatus: { draft: 1, review: 1, published: 1, archived: 1 },
    });
  });
});

describe("qualityTopicOptions", () => {
  it("lists each topic once, sorted in Turkish order", () => {
    const rows = [
      qualityRow(1, { topic: { id: 3, name: "Çağdaş Tarih" } }),
      qualityRow(2, { topic: { id: 1, name: "İlk Çağ" } }),
      qualityRow(3, { topic: { id: 3, name: "Çağdaş Tarih" } }),
      qualityRow(4, { topic: { id: 2, name: "Coğrafya" } }),
    ];

    expect(qualityTopicOptions(rows)).toEqual([
      { id: 2, name: "Coğrafya" },
      { id: 3, name: "Çağdaş Tarih" },
      { id: 1, name: "İlk Çağ" },
    ]);
  });
});

describe("scanCoverage", () => {
  const courses = [
    qualityCourse(1, { unit_count: 3 }),
    qualityCourse(2, { unit_count: 4 }),
  ];
  const unitsByCourse = new Map([
    [
      1,
      [
        qualityUnit(10, { exercise_count: 5 }),
        qualityUnit(11, { exercise_count: 0 }),
        qualityUnit(12, { exercise_count: 2 }),
      ],
    ],
  ]);

  it("counts loaded units and units the backend says are empty", () => {
    expect(scanCoverage(courses, unitsByCourse, new Set([10]))).toEqual({
      totalUnits: 7,
      scannedUnits: 2,
      unlistedCourses: 1,
    });
  });

  it("narrows to one course", () => {
    expect(
      scanCoverage(courses, unitsByCourse, new Set([10, 12]), { courseId: 1 }),
    ).toEqual({ totalUnits: 3, scannedUnits: 3, unlistedCourses: 0 });
    expect(
      scanCoverage(courses, unitsByCourse, new Set(), { courseId: 2 }),
    ).toEqual({ totalUnits: 4, scannedUnits: 0, unlistedCourses: 1 });
  });

  it("narrows to one unit", () => {
    expect(
      scanCoverage(courses, unitsByCourse, new Set(), {
        courseId: 1,
        unitId: 12,
      }),
    ).toEqual({ totalUnits: 1, scannedUnits: 0, unlistedCourses: 0 });
    expect(
      scanCoverage(courses, unitsByCourse, new Set([12]), {
        courseId: 1,
        unitId: 12,
      }),
    ).toEqual({ totalUnits: 1, scannedUnits: 1, unlistedCourses: 0 });
    expect(
      scanCoverage(courses, unitsByCourse, new Set(), {
        courseId: 2,
        unitId: 40,
      }),
    ).toEqual({ totalUnits: 1, scannedUnits: 0, unlistedCourses: 1 });
  });

  it("is zero for no courses", () => {
    expect(scanCoverage([], new Map(), new Set())).toEqual({
      totalUnits: 0,
      scannedUnits: 0,
      unlistedCourses: 0,
    });
  });
});
