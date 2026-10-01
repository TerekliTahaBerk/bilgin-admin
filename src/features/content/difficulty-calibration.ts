import type { ExerciseStats } from "@/contracts/admin/content";

/*
 | Difficulty Calibration Assistant — a FRONTEND HEURISTIC.
 |
 | The backend's `difficulty` (1–5, set by an editor) stays the source of
 | truth: nothing here changes it, and the signal is never shown as if it
 | were the question's difficulty. The signal only maps the backend's own
 | `correct_rate` onto the same 1–5 scale so an editor can spot an obvious
 | disagreement ("defined 2, students answer like a 4") and, if they agree,
 | change it themselves with one explicit click (PATCH, one question at a
 | time — there is no bulk or automatic correction).
 |
 | To tune the heuristic, change the constants below; every screen reads them.
 */

/**
 * Below this many attempts no signal is produced. 20 is the backend's own
 * floor for judging a correct rate (`needs_review` needs `attempts >= 20`).
 */
export const CALIBRATION_MIN_ATTEMPTS = 20;

/**
 * Correct rate → performance-signal difficulty, checked top to bottom: the
 * first band whose `minRate` the rate reaches wins.
 *
 *   ≥ 85 → 1 · 70–84 → 2 · 50–69 → 3 · 30–49 → 4 · < 30 → 5
 */
export const CORRECT_RATE_DIFFICULTY_BANDS = [
  { minRate: 85, difficulty: 1 },
  { minRate: 70, difficulty: 2 },
  { minRate: 50, difficulty: 3 },
  { minRate: 30, difficulty: 4 },
  { minRate: 0, difficulty: 5 },
] as const satisfies readonly { minRate: number; difficulty: Difficulty }[];

/**
 * A gap of this many levels or more counts as an obvious mismatch (listed by
 * the "Zorluk uyumsuzluğu" view). A one-level gap is shown, but as a minor
 * difference: the bands are coarse and a rate near a boundary flips a level.
 */
export const OBVIOUS_MISMATCH_GAP = 2;

export type Difficulty = 1 | 2 | 3 | 4 | 5;

/** The 1–5 level a correct rate (0–100) suggests. */
export function suggestDifficulty(correctRate: number): Difficulty {
  for (const band of CORRECT_RATE_DIFFICULTY_BANDS) {
    if (correctRate >= band.minRate) return band.difficulty;
  }

  return 5;
}

/** "70–84" style range of rates that suggest `difficulty`, for the legend. */
export function bandRangeLabel(difficulty: Difficulty): string {
  const index = CORRECT_RATE_DIFFICULTY_BANDS.findIndex(
    (band) => band.difficulty === difficulty,
  );
  const band = CORRECT_RATE_DIFFICULTY_BANDS[index]!;
  const upper = CORRECT_RATE_DIFFICULTY_BANDS[index - 1]?.minRate;

  if (upper === undefined) return `%${band.minRate}+`;
  if (band.minRate === 0) return `%${upper} altı`;
  return `%${band.minRate}–${upper - 1}`;
}

export type Calibration =
  | Readonly<{
      kind: "insufficient";
      attempts: number;
      required: number;
    }>
  | Readonly<{
      kind: "aligned" | "minor" | "mismatch";
      defined: number;
      signal: Difficulty;
      /** signal − defined: positive means students find it harder. */
      gap: number;
      correctRate: number;
      attempts: number;
    }>;

export function calibrateDifficulty(
  difficulty: number,
  stats: Pick<ExerciseStats, "attempts" | "correct_rate">,
  minAttempts: number = CALIBRATION_MIN_ATTEMPTS,
): Calibration {
  if (stats.attempts < minAttempts || stats.correct_rate === null) {
    return {
      kind: "insufficient",
      attempts: stats.attempts,
      required: minAttempts,
    };
  }

  const signal = suggestDifficulty(stats.correct_rate);
  const gap = signal - difficulty;

  return {
    kind:
      gap === 0
        ? "aligned"
        : Math.abs(gap) >= OBVIOUS_MISMATCH_GAP
          ? "mismatch"
          : "minor",
    defined: difficulty,
    signal,
    gap,
    correctRate: stats.correct_rate,
    attempts: stats.attempts,
  };
}

export function hasObviousMismatch(
  difficulty: number,
  stats: Pick<ExerciseStats, "attempts" | "correct_rate">,
): boolean {
  return calibrateDifficulty(difficulty, stats).kind === "mismatch";
}

export const calibrationKindLabels = {
  aligned: "Uyumlu",
  minor: "Hafif fark",
  mismatch: "Bariz uyumsuzluk",
} as const;

/** One sentence on what the signal is, shown wherever a signal is. */
export const CALIBRATION_DISCLAIMER =
  "Performans sinyali, doğru oranından üretilen bir frontend tahminidir; sorunun zorluğu backend'de tanımlı olandır ve yalnızca siz değiştirirseniz değişir.";
