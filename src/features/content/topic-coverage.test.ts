import { describe, expect, it } from "vitest";

import {
  classifyTopicCoverage,
  TOPIC_COVERAGE_THRESHOLDS,
  topicCoverageLabels,
  topicCoverageRanges,
  topicCoverageStates,
} from "@/features/content/topic-coverage";

describe("topic coverage bands", () => {
  it("uses 0 / 1–9 / 10–24 / 25+", () => {
    expect(TOPIC_COVERAGE_THRESHOLDS).toEqual({ medium: 10, good: 25 });
  });

  it.each([
    [0, "none"],
    [1, "low"],
    [9, "low"],
    [10, "medium"],
    [24, "medium"],
    [25, "good"],
    [400, "good"],
  ] as const)("classifies %i as %s", (count, state) => {
    expect(classifyTopicCoverage(count)).toBe(state);
  });

  it("labels each band with a range derived from the thresholds", () => {
    expect(
      topicCoverageStates.map((state) => [
        topicCoverageLabels[state],
        topicCoverageRanges[state],
      ]),
    ).toEqual([
      ["İçerik yok", "0 soru"],
      ["Düşük", "1–9 soru"],
      ["Orta", "10–24 soru"],
      ["İyi", "25+ soru"],
    ]);
  });
});
