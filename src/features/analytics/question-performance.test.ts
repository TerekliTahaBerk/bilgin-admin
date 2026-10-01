import { describe, expect, it } from "vitest";

import {
  attemptsByType,
  avgSecondsAggregate,
  buildPerformanceReport,
  correctRateAggregate,
  countByDifficulty,
  countByScope,
  countByStatus,
  countByTopic,
  DEFAULT_PERFORMANCE_FILTERS,
  formatPercent,
  formatSeconds,
  measuredQuestions,
  parsePerformanceFilters,
  performanceByDifficulty,
  performanceByType,
  questionPopulation,
  RANKING_SIZE,
  rankQuestions,
  serializePerformanceFilters,
} from "@/features/analytics/question-performance";
import { snapshotExercise } from "@/test/fixtures/health";
import { performanceSnapshot } from "@/test/fixtures/performance";

const snapshot = performanceSnapshot();
const all = questionPopulation(snapshot, DEFAULT_PERFORMANCE_FILTERS);
const ids = (items: readonly { id: number }[]) => items.map((item) => item.id);

describe("population and sample", () => {
  it("scopes by course and status", () => {
    expect(ids(all)).toEqual([100, 101, 102, 103, 104]);
    expect(
      ids(questionPopulation(snapshot, { minAttempts: 1, courseId: 2 })),
    ).toEqual([104]);
    expect(
      ids(questionPopulation(snapshot, { minAttempts: 1, status: "draft" })),
    ).toEqual([102]);
  });

  it("never measures an unattempted question, and applies the minimum", () => {
    expect(ids(measuredQuestions(all, 1))).toEqual([100, 101, 102, 104]);
    expect(ids(measuredQuestions(all, 20))).toEqual([100, 102]);
    // A floor below 1 still drops the unattempted question.
    expect(ids(measuredQuestions(all, 0))).toEqual([100, 101, 102, 104]);
  });
});

describe("aggregates", () => {
  it("weights the correct rate by attempts and also reports the plain mean", () => {
    const rate = correctRateAggregate(measuredQuestions(all, 1));

    expect(rate.questions).toBe(4);
    expect(rate.attempts).toBe(143);
    // (90·100 + 50·10 + 20·30 + 0·3) / 143 = 10100 / 143
    expect(rate.weighted).toBeCloseTo(70.629, 3);
    // (90 + 50 + 20 + 0) / 4
    expect(rate.unweighted).toBe(40);
  });

  it("averages time only over questions with a timing", () => {
    const time = avgSecondsAggregate(measuredQuestions(all, 1));

    expect(time.questions).toBe(3);
    expect(time.attempts).toBe(113);
    // (20·100 + 40·10 + 90·3) / 113
    expect(time.weighted).toBeCloseTo(2670 / 113, 6);
    expect(time.unweighted).toBe(50);
  });

  it("reports nothing rather than zero for an empty group", () => {
    expect(correctRateAggregate([])).toEqual({
      questions: 0,
      attempts: 0,
      weighted: null,
      unweighted: null,
    });
  });

  it("ignores an unattempted question even when it is passed in", () => {
    const stray = snapshotExercise(1, 1, 10, {
      stats: { attempts: 0, correct_rate: 0, avg_seconds: 5 },
    });

    expect(correctRateAggregate([stray]).weighted).toBeNull();
  });
});

describe("group analyses", () => {
  const measured = measuredQuestions(all, 1);

  it("keeps every difficulty level, with no data where none was measured", () => {
    const rows = performanceByDifficulty(measured);

    expect(rows.map((row) => row.label)).toEqual([
      "Zorluk 1",
      "Zorluk 2",
      "Zorluk 3",
      "Zorluk 4",
      "Zorluk 5",
    ]);
    // (90·100 + 50·10) / 110
    expect(rows[0]!.correctRate.weighted).toBeCloseTo(9500 / 110, 6);
    expect(rows[0]!.correctRate.unweighted).toBe(70);
    expect(rows[0]!.avgSeconds.weighted).toBeCloseTo(2400 / 110, 6);
    expect(rows[1]!.correctRate.weighted).toBeNull();
    expect(rows[2]!.correctRate.weighted).toBe(20);
    expect(rows[2]!.avgSeconds.weighted).toBeNull();
    expect(rows[4]!.correctRate.weighted).toBe(0);
  });

  it("lists the types in scope in enum order", () => {
    const rows = performanceByType(measured, all);

    expect(rows.map((row) => row.key)).toEqual([
      "multiple_choice",
      "fill_blank",
      "true_false",
    ]);
    expect(rows[0]!.correctRate.questions).toBe(2);
  });

  it("keeps a type whose questions all fall below the sample", () => {
    const rows = performanceByType(measuredQuestions(all, 50), all);

    expect(rows.map((row) => [row.key, row.correctRate.weighted])).toEqual([
      ["multiple_choice", 90],
      ["fill_blank", null],
      ["true_false", null],
    ]);
  });

  it("sums attempt volume per type, over every question in scope", () => {
    expect(attemptsByType(all)).toEqual([
      { id: "multiple_choice", label: "Çoktan Seçmeli", value: 110 },
      { id: "true_false", label: "Doğru / Yanlış", value: 30 },
      { id: "fill_blank", label: "Boşluk Doldurma", value: 3 },
    ]);
  });
});

describe("count distributions", () => {
  it("counts by topic, most first", () => {
    expect(countByTopic(all)).toEqual([
      { id: "2", label: "Hunlar", value: 2 },
      { id: "1", label: "İlk Çağ", value: 2 },
      { id: "3", label: "Kuruluş", value: 1 },
    ]);
  });

  it("counts by status in the pipeline order", () => {
    expect(countByStatus(all).map((entry) => entry.value)).toEqual([
      1, 1, 3, 0,
    ]);
  });

  it("counts a question in every scope it belongs to", () => {
    expect(countByScope(all)).toEqual([
      { id: "tyt", label: "TYT", value: 3 },
      { id: "ayt", label: "AYT", value: 2 },
      { id: "none", label: "Kapsamı yok", value: 1 },
    ]);
  });

  it("counts by difficulty, every level", () => {
    expect(countByDifficulty(all).map((entry) => entry.value)).toEqual([
      2, 0, 2, 0, 1,
    ]);
  });
});

describe("rankings", () => {
  const measured = measuredQuestions(all, 1);

  it("orders each ranking, larger sample first on ties", () => {
    expect(ids(rankQuestions(measured, "most_attempts"))).toEqual([
      100, 102, 101, 104,
    ]);
    expect(ids(rankQuestions(measured, "lowest_rate"))).toEqual([
      104, 102, 101, 100,
    ]);
    expect(ids(rankQuestions(measured, "highest_rate"))).toEqual([
      100, 101, 102, 104,
    ]);
    expect(ids(rankQuestions(measured, "longest_time"))).toEqual([
      104, 101, 100,
    ]);
    expect(ids(rankQuestions(measured, "shortest_time"))).toEqual([
      100, 101, 104,
    ]);

    const tied = [
      snapshotExercise(2, 1, 10, {
        stats: { attempts: 5, correct_rate: 50, avg_seconds: 10 },
      }),
      snapshotExercise(1, 1, 10, {
        stats: { attempts: 9, correct_rate: 50, avg_seconds: 10 },
      }),
    ];
    expect(ids(rankQuestions(tied, "lowest_rate"))).toEqual([1, 2]);
  });

  it(`keeps at most ${RANKING_SIZE} rows`, () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      snapshotExercise(index + 1, 1, 10, {
        stats: { attempts: index + 1, correct_rate: 50, avg_seconds: 5 },
      }),
    );

    expect(rankQuestions(many, "most_attempts")).toHaveLength(RANKING_SIZE);
    expect(rankQuestions(many, "most_attempts")[0]!.id).toBe(30);
  });
});

describe("buildPerformanceReport", () => {
  it("splits the population into unattempted, below sample and measured", () => {
    const report = buildPerformanceReport(snapshot, { minAttempts: 20 });

    expect(report).toMatchObject({
      population: 5,
      unattempted: 1,
      belowSample: 2,
      measured: 2,
    });
    // The counts read the whole population; the sample does not change them.
    expect(report.countByTopic.map((entry) => entry.value)).toEqual([2, 2, 1]);
    expect(report.attemptsByType[0]!.value).toBe(110);
    expect(report.rankings.most_attempts.map((item) => item.id)).toEqual([
      100, 102,
    ]);
  });
});

describe("format", () => {
  it("rounds and marks missing values", () => {
    expect(formatPercent(70.63)).toBe("%71");
    expect(formatPercent(null)).toBe("—");
    expect(formatSeconds(23.6)).toBe("24 sn");
    expect(formatSeconds(null)).toBe("—");
  });
});

describe("URL state", () => {
  it("round-trips the filters", () => {
    const filters = {
      courseId: 2,
      status: "published",
      minAttempts: 20,
    } as const;
    const query = serializePerformanceFilters(filters);

    expect(query).toBe("course=2&status=published&min=20");
    expect(parsePerformanceFilters(new URLSearchParams(query))).toEqual(
      filters,
    );
  });

  it("falls back to defaults for unknown values", () => {
    expect(
      parsePerformanceFilters(
        new URLSearchParams("course=-1&status=bogus&min=7"),
      ),
    ).toEqual({
      courseId: undefined,
      status: undefined,
      minAttempts: 1,
    });
    expect(serializePerformanceFilters(DEFAULT_PERFORMANCE_FILTERS)).toBe("");
  });
});
