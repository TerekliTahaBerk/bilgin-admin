import {
  courseScopeSchema,
  type CourseScope,
  type ExerciseType,
  type PublishStatus,
} from "@/contracts/admin/content";
import {
  HIGH_CORRECT_RATE_MIN,
  LOW_CORRECT_RATE_MAX,
  type QualityRow,
} from "@/features/analytics/quality-dataset";
import {
  parseDifficulty,
  parseExerciseStatus,
  parseExerciseType,
  parseTopicId,
  type DifficultyLevel,
} from "@/features/content/exercise-filters";

/**
 * Every Quality Center filter. All of them are applied to rows already
 * loaded — none of them ever becomes a request parameter. Course and unit
 * narrow the *scope* (what is summarised and what "Tara" reads); the rest
 * narrow the list.
 */
export type QualityFilters = Readonly<{
  courseId?: number;
  unitId?: number;
  topicId?: number;
  type?: ExerciseType;
  difficulty?: DifficultyLevel;
  status?: PublishStatus;
  scope?: CourseScope;
  attemptsMin?: number;
  attemptsMax?: number;
  rateMin?: number;
  rateMax?: number;
  secondsMin?: number;
  secondsMax?: number;
  /** The backend's `needs_review`, matched exactly; `undefined` is "all". */
  needsReview?: boolean;
  /** `true` keeps only `version > 1`; `undefined` is "all". */
  edited?: true;
}>;

export const qualitySortKeys = [
  "attempts",
  "correct_rate",
  "avg_seconds",
  "difficulty",
  "version",
  "id",
] as const;

export type QualitySortKey = (typeof qualitySortKeys)[number];
export type SortDirection = "asc" | "desc";

export type QualitySort = Readonly<{
  key: QualitySortKey;
  direction: SortDirection;
}>;

export type QualityViewState = Readonly<{
  filters: QualityFilters;
  sort: QualitySort;
}>;

export const DEFAULT_QUALITY_SORT: QualitySort = {
  key: "id",
  direction: "asc",
};

export const qualitySortLabels: Readonly<Record<QualitySortKey, string>> = {
  attempts: "Deneme sayısı",
  correct_rate: "Doğru oranı",
  avg_seconds: "Ortalama süre",
  difficulty: "Zorluk",
  version: "Sürüm",
  id: "Soru no",
};

/** The two filters that define the scope; everything else is a list filter. */
export type QualityScopeFilters = Pick<QualityFilters, "courseId" | "unitId">;

export function scopeOf(filters: QualityFilters): QualityScopeFilters {
  return {
    ...(filters.courseId === undefined ? {} : { courseId: filters.courseId }),
    ...(filters.unitId === undefined ? {} : { unitId: filters.unitId }),
  };
}

export function filterToScope(
  rows: readonly QualityRow[],
  scope: QualityScopeFilters,
): QualityRow[] {
  return rows.filter(
    (row) =>
      (scope.courseId === undefined || row.course.id === scope.courseId) &&
      (scope.unitId === undefined || row.unit.id === scope.unitId),
  );
}

function inRange(
  value: number,
  min: number | undefined,
  max: number | undefined,
): boolean {
  return (
    (min === undefined || value >= min) && (max === undefined || value <= max)
  );
}

/**
 * A nullable metric with a bound set only matches rows that *have* the
 * metric. An unsolved question has no correct rate — it is not "0%", so a
 * "rate ≤ 30" filter must not pick it up.
 */
function inNullableRange(
  value: number | null,
  min: number | undefined,
  max: number | undefined,
): boolean {
  if (min === undefined && max === undefined) return true;

  return value !== null && inRange(value, min, max);
}

export function applyQualityFilters(
  rows: readonly QualityRow[],
  filters: QualityFilters,
): QualityRow[] {
  return rows.filter((row) => {
    const { stats } = row;

    return (
      (filters.courseId === undefined || row.course.id === filters.courseId) &&
      (filters.unitId === undefined || row.unit.id === filters.unitId) &&
      (filters.topicId === undefined || row.topic.id === filters.topicId) &&
      (filters.type === undefined || row.type === filters.type) &&
      (filters.difficulty === undefined ||
        row.difficulty === filters.difficulty) &&
      (filters.status === undefined || row.status === filters.status) &&
      (filters.scope === undefined || row.scopes.includes(filters.scope)) &&
      (filters.needsReview === undefined ||
        stats.needs_review === filters.needsReview) &&
      (filters.edited === undefined || row.version > 1) &&
      inRange(stats.attempts, filters.attemptsMin, filters.attemptsMax) &&
      inNullableRange(stats.correct_rate, filters.rateMin, filters.rateMax) &&
      inNullableRange(stats.avg_seconds, filters.secondsMin, filters.secondsMax)
    );
  });
}

function sortValue(row: QualityRow, key: QualitySortKey): number | null {
  switch (key) {
    case "attempts":
      return row.stats.attempts;
    case "correct_rate":
      return row.stats.correct_rate;
    case "avg_seconds":
      return row.stats.avg_seconds;
    case "difficulty":
      return row.difficulty;
    case "version":
      return row.version;
    case "id":
      return row.id;
  }
}

/**
 * Returns a new array. Rows without the metric (never attempted) always go
 * last, in either direction — "fastest first" must not open with questions
 * nobody has solved. Ties fall back to the exercise id, ascending, so the
 * order is deterministic.
 */
export function sortQualityRows(
  rows: readonly QualityRow[],
  sort: QualitySort,
): QualityRow[] {
  const factor = sort.direction === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    const a = sortValue(left, sort.key);
    const b = sortValue(right, sort.key);

    if (a === null || b === null) {
      if (a !== b) return a === null ? 1 : -1;
    } else if (a !== b) {
      return (a - b) * factor;
    }

    return left.id - right.id;
  });
}

export type QualityPresetId =
  | "needs_review"
  | "unsolved"
  | "very_low_rate"
  | "very_high_rate"
  | "slowest"
  | "fastest"
  | "most_attempted"
  | "edited"
  | "drafts"
  | "in_review";

/**
 * A ready-made view is nothing more than a list-filter set plus a sort. The
 * course/unit scope is never part of a preset, so a view can be applied
 * inside whichever course or unit the admin is looking at.
 */
export type QualityPreset = Readonly<{
  id: QualityPresetId;
  label: string;
  description: string;
  filters: Omit<QualityFilters, "courseId" | "unitId">;
  sort: QualitySort;
}>;

export const qualityPresets: readonly QualityPreset[] = [
  {
    id: "needs_review",
    label: "İnceleme gerekli",
    description: "Sunucunun inceleme gerekli olarak işaretlediği sorular.",
    filters: { needsReview: true },
    sort: { key: "attempts", direction: "desc" },
  },
  {
    id: "unsolved",
    label: "Hiç çözülmemiş",
    description: "Henüz hiç denenmemiş sorular.",
    filters: { attemptsMax: 0 },
    sort: { key: "id", direction: "asc" },
  },
  {
    id: "very_low_rate",
    label: "Çok düşük doğru oranı",
    description: `Doğru oranı %${LOW_CORRECT_RATE_MAX} ve altında olan sorular.`,
    filters: { rateMax: LOW_CORRECT_RATE_MAX },
    sort: { key: "correct_rate", direction: "asc" },
  },
  {
    id: "very_high_rate",
    label: "Çok yüksek doğru oranı",
    description: `Doğru oranı %${HIGH_CORRECT_RATE_MIN} ve üstünde olan sorular.`,
    filters: { rateMin: HIGH_CORRECT_RATE_MIN },
    sort: { key: "correct_rate", direction: "desc" },
  },
  {
    id: "slowest",
    label: "En yavaş çözülenler",
    description: "Ortalama çözüm süresi en uzun olan sorular.",
    filters: { secondsMin: 0 },
    sort: { key: "avg_seconds", direction: "desc" },
  },
  {
    id: "fastest",
    label: "En hızlı çözülenler",
    description: "Ortalama çözüm süresi en kısa olan sorular.",
    filters: { secondsMin: 0 },
    sort: { key: "avg_seconds", direction: "asc" },
  },
  {
    id: "most_attempted",
    label: "En çok çözülenler",
    description: "En çok denenen sorular.",
    filters: { attemptsMin: 1 },
    sort: { key: "attempts", direction: "desc" },
  },
  {
    id: "edited",
    label: "Düzenlenmiş sorular",
    description: "En az bir kez düzenlenmiş (sürüm > 1) sorular.",
    filters: { edited: true },
    sort: { key: "version", direction: "desc" },
  },
  {
    id: "drafts",
    label: "Taslaklar",
    description: "Taslak durumundaki sorular.",
    filters: { status: "draft" },
    sort: { key: "id", direction: "asc" },
  },
  {
    id: "in_review",
    label: "İncelemedekiler",
    description: "İncelemede bekleyen sorular.",
    filters: { status: "review" },
    sort: { key: "id", direction: "asc" },
  },
];

export function applyPreset(
  state: QualityViewState,
  preset: QualityPreset,
): QualityViewState {
  return {
    filters: { ...scopeOf(state.filters), ...preset.filters },
    sort: preset.sort,
  };
}

function listFilterEntries(filters: QualityFilters): string {
  return JSON.stringify(
    Object.entries(filters)
      .filter(
        ([key, value]) =>
          value !== undefined && key !== "courseId" && key !== "unitId",
      )
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

/**
 * Whether the state shows exactly this list-filter set and sort, whatever the
 * course/unit scope. Presets and summary tiles use it to mark themselves
 * active.
 */
export function matchesView(
  state: QualityViewState,
  filters: QualityFilters,
  sort: QualitySort,
): boolean {
  return (
    state.sort.key === sort.key &&
    state.sort.direction === sort.direction &&
    listFilterEntries(state.filters) === listFilterEntries(filters)
  );
}

/** The preset whose filters and sort the state matches exactly, if any. */
export function activePresetId(
  state: QualityViewState,
): QualityPresetId | null {
  const preset = qualityPresets.find((candidate) =>
    matchesView(state, candidate.filters, candidate.sort),
  );

  return preset?.id ?? null;
}

export function hasListFilters(filters: QualityFilters): boolean {
  return listFilterEntries(filters) !== "[]";
}

/* ------------------------------------------------------------------ URL -- */

const NON_NEGATIVE_INT = /^(0|[1-9][0-9]{0,8})$/;

/** A non-negative integer up to `max`, or `undefined` for anything else. */
export function parseBoundedInt(
  value: unknown,
  max: number = Number.MAX_SAFE_INTEGER,
): number | undefined {
  if (typeof value !== "string" || !NON_NEGATIVE_INT.test(value)) {
    return undefined;
  }

  const parsed = Number(value);

  return parsed <= max ? parsed : undefined;
}

function parseScope(value: unknown): CourseScope | undefined {
  const parsed = courseScopeSchema.safeParse(value);

  return parsed.success ? parsed.data : undefined;
}

function parseSortKey(value: unknown): QualitySortKey | undefined {
  return (qualitySortKeys as readonly unknown[]).includes(value)
    ? (value as QualitySortKey)
    : undefined;
}

/**
 * Reads the view from the URL. Anything unparseable becomes "not set" rather
 * than an error, the same rule the unit browser follows. A unit without a
 * course is dropped: the unit filter only exists inside a course.
 */
export function parseQualityState(params: URLSearchParams): QualityViewState {
  const courseId = parseTopicId(params.get("course"));
  const unitId =
    courseId === undefined ? undefined : parseTopicId(params.get("unit"));
  const review = params.get("review");
  const filters: QualityFilters = {
    courseId,
    unitId,
    topicId: parseTopicId(params.get("topic")),
    type: parseExerciseType(params.get("type")),
    difficulty: parseDifficulty(params.get("difficulty")),
    status: parseExerciseStatus(params.get("status")),
    scope: parseScope(params.get("scope")),
    attemptsMin: parseBoundedInt(params.get("attempts_min")),
    attemptsMax: parseBoundedInt(params.get("attempts_max")),
    rateMin: parseBoundedInt(params.get("rate_min"), 100),
    rateMax: parseBoundedInt(params.get("rate_max"), 100),
    secondsMin: parseBoundedInt(params.get("seconds_min")),
    secondsMax: parseBoundedInt(params.get("seconds_max")),
    needsReview: review === "yes" ? true : review === "no" ? false : undefined,
    edited: params.get("edited") === "1" ? true : undefined,
  };
  const key = parseSortKey(params.get("sort"));
  const dir = params.get("dir");

  return {
    filters: Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== undefined),
    ) as QualityFilters,
    sort:
      key === undefined
        ? DEFAULT_QUALITY_SORT
        : { key, direction: dir === "desc" ? "desc" : "asc" },
  };
}

/** Inverse of `parseQualityState`, in a fixed parameter order. */
export function serializeQualityState(state: QualityViewState): string {
  const { filters, sort } = state;
  const params = new URLSearchParams();
  const set = (name: string, value: string | number | undefined) => {
    if (value !== undefined) params.set(name, String(value));
  };

  set("course", filters.courseId);
  set("unit", filters.courseId === undefined ? undefined : filters.unitId);
  set("topic", filters.topicId);
  set("type", filters.type);
  set("difficulty", filters.difficulty);
  set("status", filters.status);
  set("scope", filters.scope);
  set("attempts_min", filters.attemptsMin);
  set("attempts_max", filters.attemptsMax);
  set("rate_min", filters.rateMin);
  set("rate_max", filters.rateMax);
  set("seconds_min", filters.secondsMin);
  set("seconds_max", filters.secondsMax);
  set(
    "review",
    filters.needsReview === undefined
      ? undefined
      : filters.needsReview
        ? "yes"
        : "no",
  );
  set("edited", filters.edited ? "1" : undefined);

  if (
    sort.key !== DEFAULT_QUALITY_SORT.key ||
    sort.direction !== DEFAULT_QUALITY_SORT.direction
  ) {
    params.set("sort", sort.key);
    params.set("dir", sort.direction);
  }

  return params.toString();
}
