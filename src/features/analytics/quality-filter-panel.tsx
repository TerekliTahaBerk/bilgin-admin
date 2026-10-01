"use client";

import { memo, useEffect, useId, useRef, useState } from "react";

import {
  courseScopes,
  exerciseTypes,
  publishStatuses,
  type Course,
  type CourseScope,
  type ExerciseTopic,
  type ExerciseType,
  type PublishStatus,
  type Unit,
} from "@/contracts/admin/content";
import {
  CALIBRATION_DISCLAIMER,
  CALIBRATION_MIN_ATTEMPTS,
} from "@/features/content/difficulty-calibration";
import {
  hasListFilters,
  type QualityFilters,
} from "@/features/analytics/quality-filters";
import {
  courseScopeLabels,
  exerciseTypeLabels,
  publishStatusLabels,
} from "@/features/content/content-labels";
import {
  DIFFICULTY_LEVELS,
  type DifficultyLevel,
} from "@/features/content/exercise-filters";
import type { ApiError } from "@/lib/api/error";

/** How long a typed bound waits before it is applied. */
export const RANGE_COMMIT_DELAY_MS = 500;

const fieldClass =
  "mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft disabled:cursor-not-allowed disabled:opacity-60";

type Bound = Readonly<{ max: number }>;

/**
 * "" → no bound; a whole number within [0, max] → that bound; anything else
 * → invalid. Never guesses: "1,5" or "-3" is an error, not 1 or 0.
 */
export function parseBoundInput(
  raw: string,
  bound: Bound,
): { ok: true; value: number | undefined } | { ok: false } {
  const text = raw.trim();

  if (text === "") return { ok: true, value: undefined };
  if (!/^[0-9]{1,9}$/.test(text)) return { ok: false };

  const value = Number(text);

  return value <= bound.max ? { ok: true, value } : { ok: false };
}

function format(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

/**
 * A bound input that applies itself on Enter, on blur, or after a short
 * pause — not on every keystroke, so typing "120" does not filter three
 * times. The value coming back from the URL is echoed into the field only
 * when it did not originate here, so an in-progress edit is never
 * overwritten by its own earlier commit.
 */
function BoundInput({
  label,
  value,
  max,
  onCommit,
}: {
  label: string;
  value: number | undefined;
  max: number;
  onCommit: (value: number | undefined) => void;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const [draft, setDraft] = useState(format(value));
  const [seenValue, setSeenValue] = useState(value);
  const [lastCommitted, setLastCommitted] = useState(value);
  const parsed = parseBoundInput(draft, { max });

  if (value !== seenValue) {
    setSeenValue(value);
    // Our own commit coming back keeps the draft; anything else (a preset,
    // "Filtreleri temizle", back/forward) replaces it.
    if (value !== lastCommitted) {
      setDraft(format(value));
      setLastCommitted(value);
    }
  }

  const commit = () => {
    if (!parsed.ok || parsed.value === value) return;

    setLastCommitted(parsed.value);
    onCommit(parsed.value);
  };
  const commitRef = useRef(commit);

  useEffect(() => {
    commitRef.current = commit;
  });

  useEffect(() => {
    const timer = window.setTimeout(
      () => commitRef.current(),
      RANGE_COMMIT_DELAY_MS,
    );

    return () => window.clearTimeout(timer);
  }, [draft]);

  return (
    <div>
      <label className="block text-xs text-muted" htmlFor={id}>
        {label}
      </label>
      <input
        aria-describedby={parsed.ok ? undefined : errorId}
        aria-invalid={!parsed.ok}
        className={fieldClass}
        id={id}
        inputMode="numeric"
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
        placeholder="—"
        type="text"
        value={draft}
      />
      {parsed.ok ? null : (
        <p className="mt-1 text-xs text-danger" id={errorId}>
          0 ile {max} arasında bir tam sayı girin.
        </p>
      )}
    </div>
  );
}

function RangeField({
  legend,
  min,
  max,
  limit,
  onChange,
}: {
  legend: string;
  min: number | undefined;
  max: number | undefined;
  limit: number;
  onChange: (next: { min?: number; max?: number }) => void;
}) {
  const inverted = min !== undefined && max !== undefined && min > max;

  return (
    <fieldset>
      <legend className="text-xs font-medium">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        <BoundInput
          label="En az"
          max={limit}
          onCommit={(value) => onChange({ min: value, max })}
          value={min}
        />
        <BoundInput
          label="En çok"
          max={limit}
          onCommit={(value) => onChange({ min, max: value })}
          value={max}
        />
      </div>
      {inverted ? (
        <p aria-live="polite" className="mt-1 text-xs text-danger">
          En az değer en çok değerden büyük; hiçbir soru eşleşmez.
        </p>
      ) : null}
    </fieldset>
  );
}

function Select<Value extends string | number>({
  id,
  label,
  value,
  options,
  onChange,
  allLabel = "Tümü",
  disabled = false,
  hint,
}: {
  id: string;
  label: string;
  value: Value | undefined;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value | undefined) => void;
  allLabel?: string;
  disabled?: boolean;
  hint?: string;
}) {
  const hintId = `${id}-hint`;

  return (
    <div>
      <label className="block text-xs font-medium" htmlFor={id}>
        {label}
      </label>
      <select
        aria-describedby={hint === undefined ? undefined : hintId}
        className={fieldClass}
        disabled={disabled}
        id={id}
        onChange={(event) => {
          const raw = event.target.value;
          const match = options.find((option) => String(option.value) === raw);

          onChange(match?.value);
        }}
        value={value === undefined ? "" : String(value)}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint === undefined ? null : (
        <p className="mt-1 text-xs text-muted" id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
}

export type QualityFilterPanelProps = Readonly<{
  filters: QualityFilters;
  courses: readonly Course[];
  /** Units of the selected course; `undefined` while not loaded. */
  units: readonly Unit[] | undefined;
  unitsPending: boolean;
  unitsError: ApiError | null;
  topics: readonly ExerciseTopic[];
  onChange: (next: QualityFilters) => void;
}>;

export const QualityFilterPanel = memo(function QualityFilterPanel({
  filters,
  courses,
  units,
  unitsPending,
  unitsError,
  topics,
  onChange,
}: QualityFilterPanelProps) {
  const patch = (next: Partial<QualityFilters>) =>
    onChange(
      Object.fromEntries(
        Object.entries({ ...filters, ...next }).filter(
          ([, value]) => value !== undefined,
        ),
      ) as QualityFilters,
    );

  const unitHint =
    filters.courseId === undefined
      ? "Önce bir ders seçin."
      : unitsPending
        ? "Üniteler yükleniyor…"
        : unitsError !== null
          ? `Üniteler yüklenemedi: ${unitsError.message}`
          : undefined;

  return (
    <section
      aria-labelledby="quality-filters-heading"
      className="rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold" id="quality-filters-heading">
          Filtreler
        </h2>
        {filters.courseId !== undefined || hasListFilters(filters) ? (
          <button
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted"
            onClick={() => onChange({})}
            type="button"
          >
            Filtreleri temizle
          </button>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          allLabel="Tüm dersler"
          id="quality-course"
          label="Ders"
          onChange={(courseId) =>
            // Units and topics belong to a course, so a new course drops them.
            patch({ courseId, unitId: undefined, topicId: undefined })
          }
          options={courses.map((course) => ({
            value: course.id,
            label: course.name,
          }))}
          value={filters.courseId}
        />
        <Select
          allLabel="Tüm üniteler"
          disabled={filters.courseId === undefined || units === undefined}
          hint={unitHint}
          id="quality-unit"
          label="Ünite"
          onChange={(unitId) => patch({ unitId })}
          options={(units ?? []).map((unit) => ({
            value: unit.id,
            label: unit.title,
          }))}
          value={filters.unitId}
        />
        <Select
          hint={
            topics.length === 0
              ? "Konular taranan sorulardan listelenir."
              : undefined
          }
          id="quality-topic"
          label="Konu"
          onChange={(topicId) => patch({ topicId })}
          options={topics.map((topic) => ({
            value: topic.id,
            label: topic.name,
          }))}
          value={filters.topicId}
        />
        <Select<ExerciseType>
          id="quality-type"
          label="Soru tipi"
          onChange={(type) => patch({ type })}
          options={exerciseTypes.map((type) => ({
            value: type,
            label: exerciseTypeLabels[type],
          }))}
          value={filters.type}
        />
        <Select<DifficultyLevel>
          id="quality-difficulty"
          label="Zorluk"
          onChange={(difficulty) => patch({ difficulty })}
          options={DIFFICULTY_LEVELS.map((level) => ({
            value: level,
            label: String(level),
          }))}
          value={filters.difficulty}
        />
        <Select<PublishStatus>
          id="quality-status"
          label="Durum"
          onChange={(status) => patch({ status })}
          options={publishStatuses.map((status) => ({
            value: status,
            label: publishStatusLabels[status],
          }))}
          value={filters.status}
        />
        <Select<CourseScope>
          id="quality-scope"
          label="Kapsam (sınav)"
          onChange={(scope) => patch({ scope })}
          options={courseScopes.map((scope) => ({
            value: scope,
            label: courseScopeLabels[scope],
          }))}
          value={filters.scope}
        />
        <Select<"yes" | "no">
          id="quality-review"
          label="İnceleme durumu"
          onChange={(review) =>
            patch({
              needsReview: review === undefined ? undefined : review === "yes",
            })
          }
          options={[
            { value: "yes", label: "İnceleme gerekli" },
            { value: "no", label: "İnceleme gerekmiyor" },
          ]}
          value={
            filters.needsReview === undefined
              ? undefined
              : filters.needsReview
                ? "yes"
                : "no"
          }
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <RangeField
          legend="Deneme sayısı"
          limit={999_999_999}
          max={filters.attemptsMax}
          min={filters.attemptsMin}
          onChange={({ min, max }) =>
            patch({ attemptsMin: min, attemptsMax: max })
          }
        />
        <RangeField
          legend="Doğru oranı (%)"
          limit={100}
          max={filters.rateMax}
          min={filters.rateMin}
          onChange={({ min, max }) => patch({ rateMin: min, rateMax: max })}
        />
        <RangeField
          legend="Ortalama süre (sn)"
          limit={999_999_999}
          max={filters.secondsMax}
          min={filters.secondsMin}
          onChange={({ min, max }) =>
            patch({ secondsMin: min, secondsMax: max })
          }
        />
        <div className="flex items-end pb-1.5">
          <label className="flex items-center gap-2 text-sm">
            <input
              checked={filters.edited === true}
              className="size-4"
              onChange={(event) =>
                patch({ edited: event.target.checked ? true : undefined })
              }
              type="checkbox"
            />
            Yalnızca düzenlenmiş (sürüm &gt; 1)
          </label>
        </div>
        <div className="flex items-end pb-1.5">
          <label className="flex items-center gap-2 text-sm">
            <input
              checked={filters.calibration === "mismatch"}
              className="size-4"
              onChange={(event) =>
                patch({
                  calibration: event.target.checked ? "mismatch" : undefined,
                })
              }
              title={CALIBRATION_DISCLAIMER}
              type="checkbox"
            />
            Yalnızca bariz zorluk uyumsuzluğu
          </label>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted">
        Zorluk uyumsuzluğu, en az {CALIBRATION_MIN_ATTEMPTS} denemeli soruların
        doğru oranından üretilen bir frontend sezgiselidir; sorunun zorluğu
        backend&apos;de tanımlı olandır.
      </p>
      <p className="mt-1 text-xs text-muted">
        Doğru oranı veya süre aralığı girildiğinde, henüz çözülmemiş sorular bu
        değerlere sahip olmadığı için listeye dahil edilmez.
      </p>
    </section>
  );
});
