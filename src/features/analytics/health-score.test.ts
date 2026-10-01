import { describe, expect, it } from "vitest";

import {
  computeHealthMetrics,
  type HealthMetrics,
} from "@/features/analytics/health-metrics";
import {
  computeHealthScore,
  HEALTH_SIGNALS,
  healthBand,
} from "@/features/analytics/health-score";
import { healthSnapshot } from "@/test/fixtures/health";

function metrics(overrides: {
  courses?: Partial<HealthMetrics["courses"]>;
  units?: Partial<HealthMetrics["units"]>;
  exercises?: Partial<HealthMetrics["exercises"]>;
  topics?: HealthMetrics["topics"];
}): HealthMetrics {
  const base = computeHealthMetrics(healthSnapshot(), null);

  return {
    courses: { ...base.courses, ...overrides.courses },
    units: { ...base.units, ...overrides.units },
    exercises: { ...base.exercises, ...overrides.exercises },
    topics: overrides.topics === undefined ? base.topics : overrides.topics,
  };
}

const perfect = metrics({
  courses: { total: 4, withoutUnits: 0 },
  units: { total: 10, withoutExercises: 0, withoutNodes: 0 },
  exercises: { total: 50, needsReview: 0, unattempted: 0 },
  topics: { total: 8, withoutExercises: 0, lowCoverage: 0, highCoverage: 0 },
});

describe("HEALTH_SIGNALS", () => {
  it("defines six signals whose weights add up to 100", () => {
    expect(HEALTH_SIGNALS).toHaveLength(6);
    expect(HEALTH_SIGNALS.reduce((sum, signal) => sum + signal.weight, 0)).toBe(
      100,
    );
    for (const signal of HEALTH_SIGNALS) {
      expect(signal.label.length).toBeGreaterThan(0);
      expect(signal.description.length).toBeGreaterThan(0);
    }
  });
});

describe("computeHealthScore", () => {
  it("is 100 when every signal is fully met", () => {
    expect(computeHealthScore(perfect).score).toBe(100);
  });

  it("is the weighted mean of the signal ratios", () => {
    const health = computeHealthScore(
      metrics({
        courses: { total: 4, withoutUnits: 2 }, // 0.5 × 10
        units: { total: 10, withoutExercises: 5, withoutNodes: 0 }, // 0.5 × 25, 1 × 15
        exercises: { total: 50, needsReview: 10, unattempted: 25 }, // 0.8 × 20, 0.5 × 10
        topics: {
          total: 8,
          withoutExercises: 2,
          lowCoverage: 0,
          highCoverage: 0,
        }, // 0.75 × 20
      }),
    );

    // (5 + 12.5 + 15 + 16 + 5 + 15) / 100 = 68.5 → 69
    expect(health.score).toBe(69);
    expect(
      Object.fromEntries(
        health.signals.map((signal) => [signal.id, signal.ratio]),
      ),
    ).toEqual({
      units_with_exercises: 0.5,
      exercises_without_review_flag: 0.8,
      topics_with_exercises: 0.75,
      units_with_nodes: 1,
      courses_with_units: 0.5,
      exercises_attempted: 0.5,
    });
  });

  it("leaves out a signal with nothing to measure and renormalises the rest", () => {
    const health = computeHealthScore(
      metrics({
        courses: { total: 4, withoutUnits: 0 },
        units: { total: 10, withoutExercises: 0, withoutNodes: 0 },
        exercises: { total: 50, needsReview: 50, unattempted: 0 },
        topics: null,
      }),
    );
    const topics = health.signals.find(
      (signal) => signal.id === "topics_with_exercises",
    );

    expect(topics).toMatchObject({ ratio: null, numerator: 0, denominator: 0 });
    // Weights without topics: 25 + 20 + 15 + 10 + 10 = 80; review is 0.
    expect(health.score).toBe(Math.round((100 * 60) / 80));
  });

  it("does not treat an empty catalogue as healthy or broken", () => {
    const health = computeHealthScore(
      metrics({
        courses: { total: 0, withoutUnits: 0 },
        units: { total: 0, withoutExercises: 0, withoutNodes: 0 },
        exercises: { total: 0, needsReview: 0, unattempted: 0 },
        topics: null,
      }),
    );

    expect(health.score).toBeNull();
    expect(health.signals.every((signal) => signal.ratio === null)).toBe(true);
  });

  it("reports numerators and denominators for the details view", () => {
    const signal = computeHealthScore(
      metrics({ units: { total: 10, withoutExercises: 3, withoutNodes: 0 } }),
    ).signals.find((item) => item.id === "units_with_exercises");

    expect(signal).toMatchObject({ numerator: 7, denominator: 10, ratio: 0.7 });
  });

  it("reads needs_review as the backend reports it", () => {
    const signal = computeHealthScore(
      computeHealthMetrics(healthSnapshot(), null),
    ).signals.find((item) => item.id === "exercises_without_review_flag");

    // 3 exercises, 1 flagged by the backend.
    expect(signal).toMatchObject({ numerator: 2, denominator: 3 });
  });
});

describe("healthBand", () => {
  it.each([
    [100, "good"],
    [80, "good"],
    [79, "fair"],
    [50, "fair"],
    [49, "poor"],
    [0, "poor"],
  ] as const)("puts %i in %s", (score, band) => {
    expect(healthBand(score)).toBe(band);
  });
});
