"use client";

import { Gauge } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import type { ExerciseStats } from "@/contracts/admin/content";
import {
  bandRangeLabel,
  calibrateDifficulty,
  CALIBRATION_DISCLAIMER,
  CALIBRATION_MIN_ATTEMPTS,
  calibrationKindLabels,
  CORRECT_RATE_DIFFICULTY_BANDS,
  type Calibration,
} from "@/features/content/difficulty-calibration";
import { useUpdateExerciseDifficulty } from "@/features/content/use-update-exercise-difficulty";
import type { ApiError } from "@/lib/api/error";

const kindStyles = {
  aligned: "border-emerald-200 bg-emerald-50 text-emerald-800",
  minor: "border-border bg-surface-muted text-muted",
  mismatch: "border-amber-200 bg-amber-50 text-amber-800",
} as const;

function errorMessage(error: ApiError): string {
  if (error.kind === "authorization") return "Düzenleme yetkiniz yok.";
  if (error.kind === "not_found") return "Soru bulunamadı.";
  if (error.code === "INVALID_EXERCISE_CONTENT") {
    return "Backend sorunun mevcut içeriğini doğrulamadı; zorluğu soru editöründen değiştirin.";
  }
  return error.message;
}

function direction(calibration: Extract<Calibration, { gap: number }>) {
  return calibration.gap > 0
    ? "öğrenciler soruyu tanımlı zorluğundan daha zor buluyor"
    : "öğrenciler soruyu tanımlı zorluğundan daha kolay buluyor";
}

export type DifficultyCalibrationProps = Readonly<{
  exerciseId: number;
  unitId: number;
  /** The backend's difficulty — the source of truth. */
  difficulty: number;
  stats: Pick<ExerciseStats, "attempts" | "correct_rate">;
  canEdit: boolean;
  /** `row` is the one-line Quality Center form; `panel` the editor card. */
  layout: "row" | "panel";
  /**
   * Why the action is unavailable even for an editor (e.g. the editor form
   * holds an unsaved difficulty change), or null.
   */
  blockedReason?: string | null;
  onApplied?: (difficulty: number, version: number) => void;
}>;

/**
 * "Tanımlı zorluk: 2 · Performans sinyali: 4" plus, for an editor and only
 * when the two differ, a "Zorluğu 4 yap" button. Nothing changes until that
 * button is clicked; it changes this one question and nothing else.
 */
/**
 * The explicit action: one question, one click, one difficulty-only PATCH.
 * It is the only part that holds the mutation (and so needs a QueryClient),
 * so rows without an action render no hooks at all.
 */
function ApplyDifficultyButton({
  exerciseId,
  unitId,
  target,
  describedBy,
  blockedReason,
  onApplied,
}: {
  exerciseId: number;
  unitId: number;
  target: number;
  describedBy: string;
  blockedReason: string | null;
  onApplied: (difficulty: number, version: number) => void;
}) {
  const router = useRouter();
  const mutation = useUpdateExerciseDifficulty(
    { exerciseId, unitId },
    (saved) => onApplied(saved.difficulty, saved.version),
  );
  const isSessionExpired = mutation.error?.kind === "authentication";

  useEffect(() => {
    if (isSessionExpired) {
      router.replace("/login");
      router.refresh();
    }
  }, [isSessionExpired, router]);

  return (
    <>
      <button
        aria-describedby={describedBy}
        className="rounded-md border border-primary/40 bg-surface px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-60"
        disabled={mutation.isPending || blockedReason !== null}
        onClick={() => mutation.mutate(target)}
        type="button"
      >
        {mutation.isPending ? "Kaydediliyor…" : `Zorluğu ${target} yap`}
      </button>
      {blockedReason === null ? null : (
        <span className="basis-full text-xs text-muted">{blockedReason}</span>
      )}
      {mutation.error !== null && !isSessionExpired ? (
        <span className="basis-full text-xs text-danger" role="alert">
          {errorMessage(mutation.error)}
        </span>
      ) : null}
    </>
  );
}

/**
 * "Tanımlı zorluk: 2 · Performans sinyali: 4" plus, for an editor and only
 * when the two differ, a "Zorluğu 4 yap" button. Nothing changes until that
 * button is clicked; it changes this one question and nothing else.
 */
export function DifficultyCalibration({
  exerciseId,
  unitId,
  difficulty,
  stats,
  canEdit,
  layout,
  blockedReason = null,
  onApplied,
}: DifficultyCalibrationProps) {
  const disclaimerId = useId();

  /*
   * The PATCH succeeded, so the backend now holds `saved.value`; the row may
   * still be drawn from a list or snapshot read before it. While the props
   * still show the level it replaced, the confirmed one is shown; once they
   * catch up or move on (another edit), the props — the backend's own value —
   * win again. The confirmation note itself stays.
   */
  const [saved, setSaved] = useState<{
    from: number;
    value: number;
    version: number;
  } | null>(null);
  const defined =
    saved !== null && saved.from === difficulty ? saved.value : difficulty;
  const calibration = calibrateDifficulty(defined, stats);

  if (calibration.kind === "insufficient" && layout === "row") return null;

  const action =
    canEdit && calibration.kind !== "insufficient" && calibration.gap !== 0 ? (
      <ApplyDifficultyButton
        blockedReason={blockedReason}
        describedBy={disclaimerId}
        exerciseId={exerciseId}
        onApplied={(value, version) => {
          setSaved({ from: difficulty, value, version });
          onApplied?.(value, version);
        }}
        target={calibration.signal}
        unitId={unitId}
      />
    ) : null;

  const savedNote =
    saved === null ? null : (
      <p className="text-xs font-medium text-emerald-700" role="status">
        Zorluk {saved.value} olarak kaydedildi (sürüm {saved.version}).
      </p>
    );

  if (layout === "row") {
    if (calibration.kind === "insufficient") return null;

    return (
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          <span>
            <span className="text-muted">Tanımlı zorluk:</span>{" "}
            <span className="font-medium">{calibration.defined}</span>
          </span>
          <span title={CALIBRATION_DISCLAIMER}>
            <span className="text-muted">Performans sinyali:</span>{" "}
            <span className="font-medium">{calibration.signal}</span>
          </span>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${kindStyles[calibration.kind]}`}
          >
            {calibrationKindLabels[calibration.kind]}
          </span>
          <span className="sr-only" id={disclaimerId}>
            {CALIBRATION_DISCLAIMER}
          </span>
          {action}
        </div>
        {savedNote}
      </div>
    );
  }

  return (
    <section
      aria-labelledby={`${disclaimerId}-heading`}
      className="rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex items-center gap-2">
        <Gauge aria-hidden="true" className="size-4 text-muted" />
        <h2 className="text-sm font-semibold" id={`${disclaimerId}-heading`}>
          Zorluk kalibrasyonu
        </h2>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:max-w-md">
        <div>
          <dt className="text-xs text-muted">Tanımlı zorluk</dt>
          <dd className="mt-0.5 text-lg font-semibold">{defined}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Performans sinyali</dt>
          <dd className="mt-0.5 text-lg font-semibold">
            {calibration.kind === "insufficient" ? "—" : calibration.signal}
          </dd>
        </div>
      </dl>

      <div className="mt-3 space-y-2 text-sm">
        {calibration.kind === "insufficient" ? (
          <p className="text-muted">
            Yetersiz örneklem: {calibration.attempts}/{calibration.required}{" "}
            deneme. Sinyal en az {CALIBRATION_MIN_ATTEMPTS} denemeden sonra
            üretilir.
          </p>
        ) : calibration.kind === "aligned" ? (
          <p>
            <span
              className={`mr-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${kindStyles.aligned}`}
            >
              {calibrationKindLabels.aligned}
            </span>
            %{calibration.correctRate} doğru oranı ({calibration.attempts}{" "}
            deneme) tanımlı zorlukla uyumlu.
          </p>
        ) : (
          <p>
            <span
              className={`mr-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${kindStyles[calibration.kind]}`}
            >
              {calibrationKindLabels[calibration.kind]}
            </span>
            %{calibration.correctRate} doğru oranı ({calibration.attempts}{" "}
            deneme): {direction(calibration)}.
          </p>
        )}

        <p className="text-xs text-muted" id={disclaimerId}>
          {CALIBRATION_DISCLAIMER}
        </p>

        <details className="text-xs text-muted">
          <summary className="cursor-pointer font-medium">
            Eşikler (frontend sezgiseli)
          </summary>
          <ul className="mt-1.5 space-y-0.5">
            {CORRECT_RATE_DIFFICULTY_BANDS.map((band) => (
              <li key={band.difficulty}>
                Doğru oranı {bandRangeLabel(band.difficulty)} → zorluk{" "}
                {band.difficulty}
              </li>
            ))}
          </ul>
        </details>

        {action === null ? null : (
          <div className="flex flex-wrap items-center gap-3 pt-1">{action}</div>
        )}
        {savedNote}
      </div>
    </section>
  );
}
