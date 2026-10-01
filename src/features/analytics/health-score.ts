import type { HealthMetrics } from "@/features/analytics/health-metrics";

/**
 * Content Health Score — a PRODUCT metric computed by this admin panel from
 * backend fields. It is not a backend metric, it has no backend counterpart
 * and nothing should treat it as one. Its only job is to summarise the
 * signals below in one glanceable number; the problem list is what the admin
 * acts on.
 *
 * Formula: a weighted mean of signal ratios, each in [0, 1].
 *
 *   score = round(100 × Σ(weight × ratio) / Σ(weight))
 *
 * over the signals that have something to measure. A signal whose
 * denominator is zero (no units, no exercises, topics not loaded) is left
 * out and the remaining weights are renormalised, rather than counted as 0
 * or as 1 — "nothing to measure" is neither a failure nor a pass.
 */
export type HealthSignalId =
  | "units_with_exercises"
  | "units_with_nodes"
  | "courses_with_units"
  | "exercises_without_review_flag"
  | "topics_with_exercises"
  | "exercises_attempted";

export type HealthSignalDefinition = Readonly<{
  id: HealthSignalId;
  label: string;
  /** What the ratio measures, in words, for the score's details. */
  description: string;
  weight: number;
}>;

export const HEALTH_SIGNALS: readonly HealthSignalDefinition[] = [
  {
    id: "units_with_exercises",
    label: "Sorusu olan üniteler",
    description: "Sorusu olan ünitelerin tüm ünitelere oranı.",
    weight: 25,
  },
  {
    id: "exercises_without_review_flag",
    label: "İnceleme gerektirmeyen sorular",
    description:
      "Sunucunun inceleme gerekli olarak işaretlemediği soruların oranı.",
    weight: 20,
  },
  {
    id: "topics_with_exercises",
    label: "Sorusu olan konular",
    description: "En az bir sorusu olan konuların tüm konulara oranı.",
    weight: 20,
  },
  {
    id: "units_with_nodes",
    label: "Adımı olan üniteler",
    description: "En az bir adımı olan ünitelerin tüm ünitelere oranı.",
    weight: 15,
  },
  {
    id: "courses_with_units",
    label: "Ünitesi olan dersler",
    description: "En az bir ünitesi olan derslerin tüm derslere oranı.",
    weight: 10,
  },
  {
    id: "exercises_attempted",
    label: "Çözülmüş sorular",
    description: "En az bir kez denenmiş soruların oranı.",
    weight: 10,
  },
];

export type HealthSignalResult = HealthSignalDefinition &
  Readonly<{
    /** `null` when there was nothing to measure; then it does not count. */
    ratio: number | null;
    numerator: number;
    denominator: number;
  }>;

export type HealthScore = Readonly<{
  /** 0–100, or `null` when no signal had anything to measure. */
  score: number | null;
  signals: readonly HealthSignalResult[];
}>;

function ratioOf(numerator: number, denominator: number) {
  return {
    numerator,
    denominator,
    ratio: denominator === 0 ? null : numerator / denominator,
  };
}

function measure(
  id: HealthSignalId,
  metrics: HealthMetrics,
): ReturnType<typeof ratioOf> {
  const { courses, units, exercises, topics } = metrics;

  switch (id) {
    case "units_with_exercises":
      return ratioOf(units.total - units.withoutExercises, units.total);
    case "units_with_nodes":
      return ratioOf(units.total - units.withoutNodes, units.total);
    case "courses_with_units":
      return ratioOf(courses.total - courses.withoutUnits, courses.total);
    case "exercises_without_review_flag":
      return ratioOf(exercises.total - exercises.needsReview, exercises.total);
    case "exercises_attempted":
      return ratioOf(exercises.total - exercises.unattempted, exercises.total);
    case "topics_with_exercises":
      return topics === null
        ? ratioOf(0, 0)
        : ratioOf(topics.total - topics.withoutExercises, topics.total);
  }
}

export function computeHealthScore(metrics: HealthMetrics): HealthScore {
  const signals = HEALTH_SIGNALS.map((signal): HealthSignalResult => ({
    ...signal,
    ...measure(signal.id, metrics),
  }));
  const counted = signals.filter((signal) => signal.ratio !== null);
  const totalWeight = counted.reduce((sum, signal) => sum + signal.weight, 0);

  return {
    score:
      totalWeight === 0
        ? null
        : Math.round(
            (100 *
              counted.reduce(
                (sum, signal) => sum + signal.weight * (signal.ratio ?? 0),
                0,
              )) /
              totalWeight,
          ),
    signals,
  };
}

export type HealthBand = "good" | "fair" | "poor";

/** Display band only: 80+ good, 50–79 fair, below 50 poor. */
export function healthBand(score: number): HealthBand {
  return score >= 80 ? "good" : score >= 50 ? "fair" : "poor";
}
