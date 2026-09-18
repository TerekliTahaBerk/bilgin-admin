import { describe, expect, it } from "vitest";

import {
  courseScopes,
  exerciseStatsSchema,
  exerciseTopicSchema,
  exerciseTypes,
  publishStatuses,
  unitExercisesDataSchema,
  unitExercisesResponseSchema,
} from "@/contracts/admin/content";
import {
  emptyUnitExercisesResponse,
  validUnitExercisesResponse,
} from "@/test/fixtures/exercises-api";

const baseExercise = {
  id: 1,
  type: "multiple_choice",
  topic: { id: 1, name: "İlk Türk Devletleri" },
  difficulty: 2,
  status: "published",
  version: 1,
  scopes: ["tyt", "ayt"],
  preview: "Orhun Yazıtları hangi Türk devletine aittir?",
  stats: {
    attempts: 0,
    correct_rate: null,
    avg_seconds: null,
    needs_review: false,
  },
};

function parseExercise(override: Record<string, unknown>) {
  return unitExercisesDataSchema.safeParse({
    unit: { id: 12, title: "Ünite" },
    exercises: [{ ...baseExercise, ...override }],
  });
}

describe("unitExercisesResponseSchema", () => {
  it("accepts a representative backend payload", () => {
    const result = unitExercisesResponseSchema.safeParse(
      validUnitExercisesResponse,
    );

    expect(result.success).toBe(true);
    expect(result.success && result.data.data.exercises).toHaveLength(5);
    expect(result.success && result.data.data.unit.title).toBe(
      "İlk ve Orta Çağlarda Türk Dünyası",
    );
  });

  it("accepts a unit with no exercises", () => {
    expect(
      unitExercisesResponseSchema.safeParse(emptyUnitExercisesResponse).success,
    ).toBe(true);
  });

  it("accepts and strips additive unknown fields", () => {
    const result = unitExercisesResponseSchema.parse({
      ...validUnitExercisesResponse,
      data: {
        unit: { id: 12, title: "Ünite", description: "ileride" },
        exercises: [{ ...baseExercise, media: null, explanation: "x" }],
      },
    });

    expect(result.data.exercises[0]).toEqual(baseExercise);
    expect(result.data.unit).toEqual({ id: 12, title: "Ünite" });
  });

  it("rejects a payload that is a bare array", () => {
    expect(
      unitExercisesResponseSchema.safeParse({
        data: [baseExercise],
        meta: validUnitExercisesResponse.meta,
      }).success,
    ).toBe(false);
  });

  it.each([
    ["a missing unit", undefined],
    ["an empty unit title", { id: 1, title: "" }],
    ["a blank unit title", { id: 1, title: "  " }],
    ["a zero unit id", { id: 0, title: "x" }],
    ["a string unit id", { id: "1", title: "x" }],
  ])("rejects %s", (_label, unit) => {
    expect(
      unitExercisesDataSchema.safeParse({ unit, exercises: [] }).success,
    ).toBe(false);
  });
});

describe("exercise type", () => {
  it("covers exactly the backend ExerciseType enum", () => {
    expect([...exerciseTypes]).toEqual([
      "multiple_choice",
      "fill_blank",
      "matching",
      "ordering",
      "flashcard",
      "true_false",
      "word_order",
      "numeric_input",
      "image_hotspot",
      "diagram_label",
    ]);
  });

  it.each(exerciseTypes)("accepts the %s type", (type) => {
    expect(parseExercise({ type }).success).toBe(true);
  });

  it.each(["essay", "MULTIPLE_CHOICE", "", "audio"])(
    "rejects the unknown type %s",
    (type) => {
      expect(parseExercise({ type }).success).toBe(false);
    },
  );
});

describe("exercise status, scopes and difficulty", () => {
  it.each(publishStatuses)("accepts the %s status", (status) => {
    expect(parseExercise({ status }).success).toBe(true);
  });

  it.each([1, 2, 3, 4, 5])("accepts difficulty %i", (difficulty) => {
    expect(parseExercise({ difficulty }).success).toBe(true);
  });

  it.each([0, 6, -1, 2.5, "3", null])(
    "rejects the invalid difficulty %s",
    (difficulty) => {
      expect(parseExercise({ difficulty }).success).toBe(false);
    },
  );

  it("accepts every backend course scope", () => {
    expect(parseExercise({ scopes: [...courseScopes] }).success).toBe(true);
  });

  it("accepts an empty scope list", () => {
    expect(parseExercise({ scopes: [] }).success).toBe(true);
  });

  it.each([[["lys"]], [["tyt", "lys"]], [["TYT"]], ["tyt"]])(
    "rejects the invalid scopes %s",
    (scopes) => {
      expect(parseExercise({ scopes }).success).toBe(false);
    },
  );
});

describe("exercise version and preview", () => {
  it.each([1, 2, 99])("accepts version %i", (version) => {
    expect(parseExercise({ version }).success).toBe(true);
  });

  it.each([0, -1, 1.5, "1", null])(
    "rejects the invalid version %s",
    (version) => {
      expect(parseExercise({ version }).success).toBe(false);
    },
  );

  it("accepts the backend's placeholder preview", () => {
    expect(parseExercise({ preview: "(önizleme yok)" }).success).toBe(true);
  });

  it("accepts an empty preview string", () => {
    expect(parseExercise({ preview: "" }).success).toBe(true);
  });

  it.each([null, 42, undefined])(
    "rejects the non-string preview %s",
    (preview) => {
      expect(parseExercise({ preview }).success).toBe(false);
    },
  );
});

describe("exercise topic", () => {
  it("accepts a valid topic", () => {
    expect(
      exerciseTopicSchema.safeParse({ id: 1, name: "İlk Türk Devletleri" })
        .success,
    ).toBe(true);
  });

  it.each([
    ["a zero id", { id: 0, name: "x" }],
    ["a string id", { id: "1", name: "x" }],
    ["an empty name", { id: 1, name: "" }],
    ["a blank name", { id: 1, name: "   " }],
  ])("rejects %s", (_label, topic) => {
    expect(exerciseTopicSchema.safeParse(topic).success).toBe(false);
  });
});

describe("exercise stats", () => {
  const baseStats = {
    attempts: 10,
    correct_rate: 50,
    avg_seconds: 20,
    needs_review: false,
  };

  it.each([0, 1, 5000])("accepts attempts %i", (attempts) => {
    expect(
      exerciseStatsSchema.safeParse({ ...baseStats, attempts }).success,
    ).toBe(true);
  });

  it.each([-1, 1.5, "0", null])(
    "rejects the invalid attempts %s",
    (attempts) => {
      expect(
        exerciseStatsSchema.safeParse({ ...baseStats, attempts }).success,
      ).toBe(false);
    },
  );

  it.each([null, 0, 50, 100])("accepts correct_rate %s", (correct_rate) => {
    expect(
      exerciseStatsSchema.safeParse({ ...baseStats, correct_rate }).success,
    ).toBe(true);
  });

  it.each([-1, 101, 50.5, "50"])(
    "rejects the invalid correct_rate %s",
    (correct_rate) => {
      expect(
        exerciseStatsSchema.safeParse({ ...baseStats, correct_rate }).success,
      ).toBe(false);
    },
  );

  it.each([null, 0, 44])("accepts avg_seconds %s", (avg_seconds) => {
    expect(
      exerciseStatsSchema.safeParse({ ...baseStats, avg_seconds }).success,
    ).toBe(true);
  });

  it.each([-1, 1.5, "20"])(
    "rejects the invalid avg_seconds %s",
    (avg_seconds) => {
      expect(
        exerciseStatsSchema.safeParse({ ...baseStats, avg_seconds }).success,
      ).toBe(false);
    },
  );

  it.each([true, false])("accepts needs_review %s", (needs_review) => {
    expect(
      exerciseStatsSchema.safeParse({ ...baseStats, needs_review }).success,
    ).toBe(true);
  });

  it.each(["true", 1, null])(
    "rejects the non-boolean needs_review %s",
    (needs_review) => {
      expect(
        exerciseStatsSchema.safeParse({ ...baseStats, needs_review }).success,
      ).toBe(false);
    },
  );

  it("requires stats on every list item", () => {
    expect(parseExercise({ stats: undefined }).success).toBe(false);
  });
});
