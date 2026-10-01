/**
 * Topic coverage bands — an IN-APP classification of the backend's per-topic
 * `exercise_count`, not a backend metric. It says how much content a topic
 * has; it says nothing about whether any unit can be published (only the
 * backend's per-node preview and publish gate decide that).
 *
 * The one place these thresholds live. Every screen that talks about topic
 * coverage (Coverage, Health) classifies through `classifyTopicCoverage`.
 *
 * Why these numbers: the backend's unit templates ask 4–10 questions of a
 * single step, the largest steps (unit challenge, exam simulation, review)
 * 10. A topic with fewer than 10 questions cannot fill even one of those on
 * its own, so 1–9 is "low". The seeded content packages put a typical topic
 * at 8–11 questions (median 9, max 28 across 39 topics), so 10–24 is the
 * realistic "medium" band and 25+ — enough to fill a large step more than
 * twice — is "good".
 */
export const TOPIC_COVERAGE_THRESHOLDS = {
  /** Lowest count that is "medium". */
  medium: 10,
  /** Lowest count that is "good". */
  good: 25,
} as const;

export const topicCoverageStates = ["none", "low", "medium", "good"] as const;

export type TopicCoverageState = (typeof topicCoverageStates)[number];

export function classifyTopicCoverage(count: number): TopicCoverageState {
  if (count === 0) return "none";
  if (count < TOPIC_COVERAGE_THRESHOLDS.medium) return "low";
  if (count < TOPIC_COVERAGE_THRESHOLDS.good) return "medium";
  return "good";
}

export const topicCoverageLabels: Readonly<Record<TopicCoverageState, string>> =
  {
    none: "İçerik yok",
    low: "Düşük",
    medium: "Orta",
    good: "İyi",
  };

/** The band's range in words, derived from the thresholds above. */
export const topicCoverageRanges: Readonly<Record<TopicCoverageState, string>> =
  {
    none: "0 soru",
    low: `1–${TOPIC_COVERAGE_THRESHOLDS.medium - 1} soru`,
    medium: `${TOPIC_COVERAGE_THRESHOLDS.medium}–${TOPIC_COVERAGE_THRESHOLDS.good - 1} soru`,
    good: `${TOPIC_COVERAGE_THRESHOLDS.good}+ soru`,
  };

/** Tailwind classes per band; the text label always carries the meaning. */
export const topicCoverageStyles: Readonly<Record<TopicCoverageState, string>> =
  {
    none: "border-red-200 bg-red-50 text-red-800",
    low: "border-amber-200 bg-amber-50 text-amber-800",
    medium: "border-border bg-surface-muted text-foreground",
    good: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
