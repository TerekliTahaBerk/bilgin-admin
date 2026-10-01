import { describe, expect, it } from "vitest";

import {
  activeExerciseCounts,
  computeHealthMetrics,
  hasFewActiveExercises,
  LOW_UNIT_EXERCISE_MAX,
  statusDistribution,
  topicCoverage,
  topicsBySubject,
} from "@/features/analytics/health-metrics";
import {
  healthSnapshot,
  snapshotExercise,
  topicList,
} from "@/test/fixtures/health";

describe("topicsBySubject", () => {
  it("keeps one topic list per subject, from the first course that reported it", () => {
    const subjects = topicsBySubject([
      topicList(1, 7, { 1: 3 }, "TYT Tarih"),
      topicList(2, 7, { 1: 3 }, "AYT Tarih"),
      topicList(3, 8, { 5: 0 }, "AYT Fizik"),
    ]);

    expect(
      subjects.map((subject) => [subject.subjectId, subject.courseName]),
    ).toEqual([
      [7, "TYT Tarih"],
      [8, "AYT Fizik"],
    ]);
  });
});

describe("topicCoverage", () => {
  it("classifies every topic through the app-wide coverage bands", () => {
    const rows = topicCoverage(
      topicsBySubject([
        topicList(1, 1, { 1: 0, 2: 9, 3: 10, 4: 24, 5: 25 }),
        topicList(2, 2, { 9: 3 }),
      ]),
    );

    expect(rows.map((row) => [row.topic.id, row.coverage])).toEqual([
      [1, "none"],
      [2, "low"],
      [3, "medium"],
      [4, "medium"],
      [5, "good"],
      [9, "low"],
    ]);
  });
});

describe("hasFewActiveExercises", () => {
  it("covers 1..LOW_UNIT_EXERCISE_MAX only, and never an unknown count", () => {
    expect(hasFewActiveExercises(undefined)).toBe(false);
    expect(hasFewActiveExercises(0)).toBe(false);
    expect(hasFewActiveExercises(1)).toBe(true);
    expect(hasFewActiveExercises(LOW_UNIT_EXERCISE_MAX)).toBe(true);
    expect(hasFewActiveExercises(LOW_UNIT_EXERCISE_MAX + 1)).toBe(false);
  });
});

describe("activeExerciseCounts", () => {
  it("counts non-archived scanned questions per read unit", () => {
    const snapshot = healthSnapshot();
    const counts = activeExerciseCounts({
      ...snapshot,
      exercises: [
        ...snapshot.exercises,
        snapshotExercise(130, 1, 12, { status: "archived" }),
      ],
    });

    expect(Object.fromEntries(counts)).toEqual({ 10: 2, 11: 0, 12: 1 });
  });

  it("leaves a unit whose list failed unknown, not zero", () => {
    const counts = activeExerciseCounts(
      healthSnapshot([
        {
          kind: "unit",
          courseId: 1,
          unitId: 11,
          title: "Zaman",
          error: { kind: "server", status: 500, message: "x" },
        },
      ]),
    );

    expect(counts.has(11)).toBe(false);
  });
});

describe("computeHealthMetrics", () => {
  it("counts courses, units and exercises from backend fields", () => {
    const metrics = computeHealthMetrics(healthSnapshot(), null);

    expect(metrics.courses).toEqual({
      total: 2,
      byStatus: { draft: 1, review: 0, published: 1, archived: 0 },
      withoutUnits: 1,
    });
    expect(metrics.units).toEqual({
      total: 3,
      byStatus: { draft: 1, review: 1, published: 1, archived: 0 },
      withoutExercises: 1,
      withoutNodes: 1,
      totalNodes: 6,
      // Units 10 (2 active) and 12 (1 active) in the scanned lists.
      fewExercises: 2,
    });
    expect(metrics.exercises).toMatchObject({
      total: 3,
      byStatus: { draft: 1, review: 0, published: 2, archived: 0 },
      unattempted: 1,
      needsReview: 1,
      edited: 1,
    });
    expect(metrics.topics).toBeNull();
  });

  it("keeps every enum value in the distributions, zeros included", () => {
    const { exercises } = computeHealthMetrics(healthSnapshot(), null);
    const values = (entries: readonly { id: string; value: number }[]) =>
      Object.fromEntries(entries.map((entry) => [entry.id, entry.value]));

    expect(exercises.byType).toHaveLength(10);
    expect(values(exercises.byType)).toMatchObject({
      multiple_choice: 1,
      true_false: 1,
      image_hotspot: 1,
      matching: 0,
    });
    expect(values(exercises.byDifficulty)).toEqual({
      "1": 1,
      "2": 0,
      "3": 1,
      "4": 0,
      "5": 1,
    });
    // A question in two scopes counts in both.
    expect(values(exercises.byScope)).toMatchObject({ tyt: 2, ayt: 1, ydt: 0 });
  });

  it("counts topic coverage once the lists are there", () => {
    const rows = topicCoverage(
      topicsBySubject([topicList(1, 1, { 1: 0, 2: 1, 3: 10, 4: 12, 5: 40 })]),
    );

    expect(computeHealthMetrics(healthSnapshot(), rows).topics).toEqual({
      total: 5,
      withoutExercises: 1,
      lowCoverage: 1,
      highCoverage: 1,
    });
  });

  it("handles an empty catalogue", () => {
    const metrics = computeHealthMetrics(
      { ...healthSnapshot(), courses: [], units: [], exercises: [] },
      [],
    );

    expect(metrics.courses.total).toBe(0);
    expect(metrics.units.totalNodes).toBe(0);
    expect(metrics.exercises.total).toBe(0);
    expect(metrics.topics).toEqual({
      total: 0,
      withoutExercises: 0,
      lowCoverage: 0,
      highCoverage: 0,
    });
  });
});

describe("statusDistribution", () => {
  it("lists statuses in pipeline order with labels", () => {
    expect(
      statusDistribution({ draft: 1, review: 2, published: 3, archived: 0 }),
    ).toEqual([
      { id: "draft", label: "Taslak", value: 1 },
      { id: "review", label: "İncelemede", value: 2 },
      { id: "published", label: "Yayında", value: 3 },
      { id: "archived", label: "Arşiv", value: 0 },
    ]);
  });
});
