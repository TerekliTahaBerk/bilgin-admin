import { describe, expect, it } from "vitest";

import {
  unitExercisesResponseSchema,
  type ExerciseListItem,
} from "@/contracts/admin/content";
import {
  applyClientFilters,
  correctRateLabel,
  countNeedsReview,
  difficultyOptions,
  isEdited,
  prioritizeNeedsReview,
  topicOptions,
} from "@/features/content/exercise-list";
import { validUnitExercisesResponse } from "@/test/fixtures/exercises-api";

const exercises: ExerciseListItem[] = unitExercisesResponseSchema.parse(
  validUnitExercisesResponse,
).data.exercises;

describe("applyClientFilters", () => {
  it("returns everything when no client filter is set", () => {
    expect(applyClientFilters(exercises, {})).toHaveLength(exercises.length);
  });

  it("filters by topic", () => {
    const filtered = applyClientFilters(exercises, { topicId: 2 });

    expect(filtered.map((exercise) => exercise.id)).toEqual([3, 4, 5]);
  });

  it("filters by difficulty", () => {
    const filtered = applyClientFilters(exercises, { difficulty: 3 });

    expect(filtered.map((exercise) => exercise.id)).toEqual([3, 5]);
  });

  it("combines topic and difficulty", () => {
    const filtered = applyClientFilters(exercises, {
      topicId: 2,
      difficulty: 3,
    });

    expect(filtered.map((exercise) => exercise.id)).toEqual([3, 5]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(
      applyClientFilters(exercises, { topicId: 1, difficulty: 5 }),
    ).toEqual([]);
  });

  it("never mutates or reorders its input", () => {
    const snapshot = structuredClone(exercises);

    applyClientFilters(exercises, { topicId: 2 });

    expect(exercises).toEqual(snapshot);
  });
});

describe("prioritizeNeedsReview", () => {
  it("puts flagged exercises first", () => {
    const ordered = prioritizeNeedsReview(exercises);

    expect(ordered.slice(0, 2).every((e) => e.stats.needs_review)).toBe(true);
  });

  it("preserves the backend order inside each group", () => {
    const ordered = prioritizeNeedsReview(exercises);

    expect(ordered.map((exercise) => exercise.id)).toEqual([2, 4, 1, 3, 5]);
  });

  it("is stable when nothing is flagged", () => {
    const none = exercises.map((exercise) => ({
      ...exercise,
      stats: { ...exercise.stats, needs_review: false },
    }));

    expect(prioritizeNeedsReview(none).map((e) => e.id)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it("does not mutate the input array", () => {
    const snapshot = structuredClone(exercises);

    prioritizeNeedsReview(exercises);

    expect(exercises).toEqual(snapshot);
  });

  it("returns a new array rather than the cached one", () => {
    expect(prioritizeNeedsReview(exercises)).not.toBe(exercises);
  });
});

describe("topicOptions", () => {
  it("derives unique topics from the loaded exercises", () => {
    expect(topicOptions(exercises)).toEqual([
      { id: 1, name: "İlk Türk Devletleri" },
      { id: 2, name: "Kültür ve Medeniyet" },
    ]);
  });

  it("returns nothing for an empty list", () => {
    expect(topicOptions([])).toEqual([]);
  });

  it("does not mutate the input", () => {
    const snapshot = structuredClone(exercises);

    topicOptions(exercises);

    expect(exercises).toEqual(snapshot);
  });
});

describe("difficultyOptions", () => {
  it("lists the distinct difficulties in ascending order", () => {
    expect(difficultyOptions(exercises)).toEqual([1, 2, 3, 5]);
  });
});

describe("isEdited", () => {
  it("flags an exercise past version 1", () => {
    expect(isEdited(exercises.find((e) => e.version > 1)!)).toBe(true);
  });

  it("does not flag a first version", () => {
    expect(isEdited(exercises.find((e) => e.version === 1)!)).toBe(false);
  });
});

describe("correctRateLabel", () => {
  it("returns null for an unattempted exercise rather than a zero rate", () => {
    expect(correctRateLabel(null)).toBeNull();
  });

  it("formats a genuine zero rate", () => {
    expect(correctRateLabel(0)).toBe("%0 doğru");
  });

  it("formats a full rate", () => {
    expect(correctRateLabel(100)).toBe("%100 doğru");
  });
});

describe("countNeedsReview", () => {
  it("counts the flagged exercises in the given list", () => {
    expect(countNeedsReview(exercises)).toBe(2);
    expect(
      countNeedsReview(applyClientFilters(exercises, { topicId: 1 })),
    ).toBe(1);
    expect(countNeedsReview([])).toBe(0);
  });
});
