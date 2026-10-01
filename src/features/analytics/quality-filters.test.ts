import { describe, expect, it } from "vitest";

import {
  activePresetId,
  applyPreset,
  applyQualityFilters,
  DEFAULT_QUALITY_SORT,
  filterToScope,
  hasListFilters,
  matchesView,
  parseBoundedInt,
  parseQualityState,
  qualityPresets,
  qualitySortKeys,
  scopeOf,
  serializeQualityState,
  sortQualityRows,
  type QualityFilters,
  type QualityViewState,
} from "@/features/analytics/quality-filters";
import { qualityRow } from "@/test/fixtures/quality";

const rows = [
  qualityRow(1, {
    course: { id: 1, name: "TYT Tarih" },
    unit: { id: 10, title: "A" },
    type: "multiple_choice",
    topic: { id: 1, name: "Konu 1" },
    difficulty: 1,
    status: "draft",
    scopes: ["tyt"],
  }),
  qualityRow(2, {
    course: { id: 1, name: "TYT Tarih" },
    unit: { id: 11, title: "B" },
    type: "true_false",
    topic: { id: 2, name: "Konu 2" },
    difficulty: 2,
    status: "review",
    version: 2,
    scopes: ["tyt", "ayt"],
    stats: {
      attempts: 34,
      correct_rate: 97,
      avg_seconds: 8,
      needs_review: true,
    },
  }),
  qualityRow(3, {
    course: { id: 2, name: "AYT Fizik" },
    unit: { id: 20, title: "C" },
    type: "fill_blank",
    topic: { id: 3, name: "Konu 3" },
    difficulty: 5,
    status: "published",
    scopes: ["ayt"],
    stats: { attempts: 12, correct_rate: 25, avg_seconds: 40 },
  }),
  qualityRow(4, {
    course: { id: 2, name: "AYT Fizik" },
    unit: { id: 20, title: "C" },
    type: "matching",
    topic: { id: 3, name: "Konu 3" },
    difficulty: 3,
    status: "archived",
    version: 3,
    scopes: [],
    // Attempted, but the backend has no timing for it.
    stats: { attempts: 3, correct_rate: 0, avg_seconds: null },
  }),
];

function ids(filters: QualityFilters): number[] {
  return applyQualityFilters(rows, filters).map((row) => row.id);
}

describe("applyQualityFilters", () => {
  it("returns every row with no filters", () => {
    expect(ids({})).toEqual([1, 2, 3, 4]);
  });

  it.each<[QualityFilters, number[]]>([
    [{ courseId: 2 }, [3, 4]],
    [{ courseId: 1, unitId: 11 }, [2]],
    [{ topicId: 3 }, [3, 4]],
    [{ type: "true_false" }, [2]],
    [{ difficulty: 5 }, [3]],
    [{ status: "archived" }, [4]],
    [{ scope: "ayt" }, [2, 3]],
    [{ needsReview: true }, [2]],
    [{ needsReview: false }, [1, 3, 4]],
    [{ edited: true }, [2, 4]],
    [{ attemptsMin: 12 }, [2, 3]],
    [{ attemptsMax: 0 }, [1]],
    [{ attemptsMin: 3, attemptsMax: 12 }, [3, 4]],
    [{ rateMin: 90 }, [2]],
    [{ rateMax: 25 }, [3, 4]],
    [{ secondsMin: 0 }, [2, 3]],
    [{ secondsMax: 10 }, [2]],
  ])("filters %j", (filters, expected) => {
    expect(ids(filters)).toEqual(expected);
  });

  it("never lets an unsolved question match a correct-rate bound, even ≤ 100", () => {
    expect(ids({ rateMax: 100 })).toEqual([2, 3, 4]);
    expect(ids({ rateMin: 0 })).toEqual([2, 3, 4]);
  });

  it("combines filters with AND", () => {
    expect(ids({ courseId: 2, rateMax: 30, edited: true })).toEqual([4]);
  });

  it("returns nothing for an inverted range", () => {
    expect(ids({ attemptsMin: 10, attemptsMax: 5 })).toEqual([]);
  });

  it("does not mutate the input", () => {
    const snapshot = structuredClone(rows);
    applyQualityFilters(rows, { courseId: 1 });
    expect(rows).toEqual(snapshot);
  });
});

describe("filterToScope / scopeOf", () => {
  it("applies only course and unit", () => {
    expect(filterToScope(rows, { courseId: 1 }).map((row) => row.id)).toEqual([
      1, 2,
    ]);
    expect(
      filterToScope(rows, { courseId: 2, unitId: 20 }).map((row) => row.id),
    ).toEqual([3, 4]);
  });

  it("extracts only the scope keys", () => {
    expect(scopeOf({ courseId: 1, unitId: 2, status: "draft" })).toEqual({
      courseId: 1,
      unitId: 2,
    });
    expect(scopeOf({ status: "draft" })).toEqual({});
  });
});

describe("sortQualityRows", () => {
  const order = (key: (typeof qualitySortKeys)[number], asc = true) =>
    sortQualityRows(rows, { key, direction: asc ? "asc" : "desc" }).map(
      (row) => row.id,
    );

  it("sorts by attempts", () => {
    expect(order("attempts")).toEqual([1, 4, 3, 2]);
    expect(order("attempts", false)).toEqual([2, 3, 4, 1]);
  });

  it("puts unsolved questions last for correct rate in both directions", () => {
    expect(order("correct_rate")).toEqual([4, 3, 2, 1]);
    expect(order("correct_rate", false)).toEqual([2, 3, 4, 1]);
  });

  it("puts rows without timing last for avg seconds in both directions", () => {
    expect(order("avg_seconds")).toEqual([2, 3, 1, 4]);
    expect(order("avg_seconds", false)).toEqual([3, 2, 1, 4]);
  });

  it("sorts by difficulty, version and id", () => {
    expect(order("difficulty")).toEqual([1, 2, 4, 3]);
    expect(order("version", false)).toEqual([4, 2, 1, 3]);
    expect(order("id", false)).toEqual([4, 3, 2, 1]);
  });

  it("breaks ties by ascending id", () => {
    const tied = [
      qualityRow(9, { difficulty: 2 }),
      qualityRow(3, { difficulty: 2 }),
      qualityRow(5, { difficulty: 2 }),
    ];

    expect(
      sortQualityRows(tied, { key: "difficulty", direction: "desc" }).map(
        (row) => row.id,
      ),
    ).toEqual([3, 5, 9]);
  });

  it("returns a new array", () => {
    const sorted = sortQualityRows(rows, DEFAULT_QUALITY_SORT);
    expect(sorted).not.toBe(rows);
    expect(rows.map((row) => row.id)).toEqual([1, 2, 3, 4]);
  });
});

describe("presets", () => {
  it("defines the eleven ready-made views", () => {
    expect(qualityPresets.map((preset) => preset.label)).toEqual([
      "İnceleme gerekli",
      "Hiç çözülmemiş",
      "Çok düşük doğru oranı",
      "Çok yüksek doğru oranı",
      "En yavaş çözülenler",
      "En hızlı çözülenler",
      "En çok çözülenler",
      "Düzenlenmiş sorular",
      "Zorluk uyumsuzluğu",
      "Taslaklar",
      "İncelemedekiler",
    ]);
  });

  it("never puts a course or unit into a preset", () => {
    for (const preset of qualityPresets) {
      expect(preset.filters).not.toHaveProperty("courseId");
      expect(preset.filters).not.toHaveProperty("unitId");
    }
  });

  it("uses the backend flag, not a rate rule, for 'İnceleme gerekli'", () => {
    const preset = qualityPresets.find((item) => item.id === "needs_review")!;
    const flagged = applyQualityFilters(rows, preset.filters).map(
      (row) => row.id,
    );

    expect(preset.filters).toEqual({ needsReview: true });
    // Row 4 has a 0% rate but no backend flag, so it is not included.
    expect(flagged).toEqual([2]);
  });

  it.each([
    ["unsolved", [1]],
    ["very_low_rate", [4, 3]],
    ["very_high_rate", [2]],
    ["slowest", [3, 2]],
    ["fastest", [2, 3]],
    ["most_attempted", [2, 3, 4]],
    ["edited", [4, 2]],
    ["drafts", [1]],
    ["in_review", [2]],
  ] as const)("the %s view picks and orders rows", (id, expected) => {
    const preset = qualityPresets.find((item) => item.id === id)!;

    expect(
      sortQualityRows(
        applyQualityFilters(rows, preset.filters),
        preset.sort,
      ).map((row) => row.id),
    ).toEqual(expected);
  });

  it("keeps the scope and replaces everything else when applied", () => {
    const state: QualityViewState = {
      filters: { courseId: 1, unitId: 11, status: "draft", attemptsMin: 5 },
      sort: { key: "id", direction: "desc" },
    };
    const preset = qualityPresets.find((item) => item.id === "edited")!;

    expect(applyPreset(state, preset)).toEqual({
      filters: { courseId: 1, unitId: 11, edited: true },
      sort: { key: "version", direction: "desc" },
    });
  });

  it("recognises the active preset regardless of scope", () => {
    for (const preset of qualityPresets) {
      expect(
        activePresetId(
          applyPreset(
            { filters: { courseId: 3 }, sort: DEFAULT_QUALITY_SORT },
            preset,
          ),
        ),
      ).toBe(preset.id);
    }
  });

  it("reports no preset for a tweaked view", () => {
    const preset = qualityPresets.find((item) => item.id === "drafts")!;
    const state = applyPreset(
      { filters: {}, sort: DEFAULT_QUALITY_SORT },
      preset,
    );

    expect(
      activePresetId({
        ...state,
        filters: { ...state.filters, difficulty: 2 },
      }),
    ).toBeNull();
    expect(
      activePresetId({ ...state, sort: { key: "id", direction: "desc" } }),
    ).toBeNull();
  });

  it("matchesView ignores undefined keys", () => {
    expect(
      matchesView(
        {
          filters: { courseId: 1, status: undefined },
          sort: DEFAULT_QUALITY_SORT,
        },
        {},
        DEFAULT_QUALITY_SORT,
      ),
    ).toBe(true);
  });
});

describe("hasListFilters", () => {
  it("ignores course and unit", () => {
    expect(hasListFilters({})).toBe(false);
    expect(hasListFilters({ courseId: 1, unitId: 2 })).toBe(false);
    expect(hasListFilters({ courseId: 1, edited: true })).toBe(true);
    expect(hasListFilters({ attemptsMin: 0 })).toBe(true);
  });
});

describe("parseBoundedInt", () => {
  it.each([
    ["0", undefined, 0],
    ["42", undefined, 42],
    ["100", 100, 100],
    ["101", 100, undefined],
    ["-1", undefined, undefined],
    ["1.5", undefined, undefined],
    ["01", undefined, undefined],
    ["", undefined, undefined],
    ["abc", undefined, undefined],
    ["1234567890", undefined, undefined],
  ] as const)("parses %j (max %s) as %s", (raw, max, expected) => {
    expect(parseBoundedInt(raw, max)).toBe(expected);
  });

  it("rejects non-strings", () => {
    expect(parseBoundedInt(null)).toBeUndefined();
    expect(parseBoundedInt(5)).toBeUndefined();
  });
});

describe("URL state", () => {
  it("parses an empty query as the default view", () => {
    expect(parseQualityState(new URLSearchParams())).toEqual({
      filters: {},
      sort: DEFAULT_QUALITY_SORT,
    });
  });

  it("round-trips every field", () => {
    const state: QualityViewState = {
      filters: {
        courseId: 3,
        unitId: 30,
        topicId: 7,
        type: "numeric_input",
        difficulty: 4,
        status: "review",
        scope: "ayt",
        attemptsMin: 0,
        attemptsMax: 500,
        rateMin: 10,
        rateMax: 90,
        secondsMin: 5,
        secondsMax: 120,
        needsReview: false,
        edited: true,
      },
      sort: { key: "avg_seconds", direction: "desc" },
    };

    const query = serializeQualityState(state);

    expect(parseQualityState(new URLSearchParams(query))).toEqual(state);
    expect(query).toBe(
      "course=3&unit=30&topic=7&type=numeric_input&difficulty=4&status=review&scope=ayt&attempts_min=0&attempts_max=500&rate_min=10&rate_max=90&seconds_min=5&seconds_max=120&review=no&edited=1&sort=avg_seconds&dir=desc",
    );
  });

  it("round-trips needsReview=true", () => {
    const state: QualityViewState = {
      filters: { needsReview: true },
      sort: DEFAULT_QUALITY_SORT,
    };

    expect(serializeQualityState(state)).toBe("review=yes");
    expect(parseQualityState(new URLSearchParams("review=yes"))).toEqual(state);
  });

  it("leaves the default sort out of the URL", () => {
    expect(
      serializeQualityState({ filters: {}, sort: DEFAULT_QUALITY_SORT }),
    ).toBe("");
  });

  it("drops invalid values instead of failing", () => {
    expect(
      parseQualityState(
        new URLSearchParams(
          "course=abc&topic=-1&type=essay&difficulty=9&status=gone&scope=sat&attempts_min=-4&rate_max=150&seconds_min=1.5&review=maybe&edited=true&sort=name&dir=up",
        ),
      ),
    ).toEqual({ filters: {}, sort: DEFAULT_QUALITY_SORT });
  });

  it("drops a unit without a course, both ways", () => {
    expect(parseQualityState(new URLSearchParams("unit=5")).filters).toEqual(
      {},
    );
    expect(
      serializeQualityState({
        filters: { unitId: 5 },
        sort: DEFAULT_QUALITY_SORT,
      }),
    ).toBe("");
  });

  it("defaults the direction to ascending for a known sort key", () => {
    expect(
      parseQualityState(new URLSearchParams("sort=attempts")).sort,
    ).toEqual({ key: "attempts", direction: "asc" });
  });
});
