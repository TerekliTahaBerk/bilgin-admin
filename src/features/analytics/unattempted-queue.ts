import type {
  Course,
  CourseScope,
  ExerciseType,
  Unit,
} from "@/contracts/admin/content";
import type { QualityRow } from "@/features/analytics/quality-dataset";
import {
  DEFAULT_QUALITY_SORT,
  parseQualityState,
  serializeQualityState,
  type QualityFilters,
} from "@/features/analytics/quality-filters";
import { courseScopeLabels } from "@/features/content/content-labels";
import type { DifficultyLevel } from "@/features/content/exercise-filters";

/*
 | Never Attempted Queue — questions whose backend `stats.attempts` is 0.
 |
 | Zero attempts is the absence of usage data, not a defect: the screen says
 | "Henüz çözülmedi" / "Kullanım verisi yok" and never "hatalı". Published
 | questions with no attempts are their own segment, since those are the ones
 | students could already be getting.
 |
 | Only loaded questions can be judged (the same cache + scan snapshot the
 | Quality Center reads), so the screen always says how much is loaded.
 */

export const unattemptedSegments = [
  "published",
  "draft",
  "review",
  "all",
] as const;
export type UnattemptedSegment = (typeof unattemptedSegments)[number];

export const unattemptedSegmentLabels: Readonly<
  Record<UnattemptedSegment, string>
> = {
  published: "Yayında, hiç çözülmemiş",
  draft: "Taslak",
  review: "İncelemede",
  all: "Tümü (arşiv hariç)",
};

export type UnattemptedState = Readonly<{
  segment: UnattemptedSegment;
  courseId?: number;
  unitId?: number;
  topicId?: number;
  type?: ExerciseType;
  difficulty?: DifficultyLevel;
  scope?: CourseScope;
}>;

export const DEFAULT_UNATTEMPTED_STATE: UnattemptedState = {
  segment: "published",
};

export function isUnattempted(row: Pick<QualityRow, "stats">): boolean {
  return row.stats.attempts === 0;
}

function inSegment(row: QualityRow, segment: UnattemptedSegment): boolean {
  return segment === "all" ? row.status !== "archived" : row.status === segment;
}

/** Unattempted rows in the course/unit scope, before segment and list filters. */
export function unattemptedInScope(
  rows: readonly QualityRow[],
  state: Pick<UnattemptedState, "courseId" | "unitId">,
): QualityRow[] {
  return rows.filter(
    (row) =>
      isUnattempted(row) &&
      (state.courseId === undefined || row.course.id === state.courseId) &&
      (state.unitId === undefined || row.unit.id === state.unitId),
  );
}

export function segmentCounts(
  rows: readonly QualityRow[],
): Readonly<Record<UnattemptedSegment, number>> {
  return {
    published: rows.filter((row) => inSegment(row, "published")).length,
    draft: rows.filter((row) => inSegment(row, "draft")).length,
    review: rows.filter((row) => inSegment(row, "review")).length,
    all: rows.filter((row) => inSegment(row, "all")).length,
  };
}

/**
 * Segment and list filters; the order is the unit's, then the question id —
 * a queue to work through, not a ranking.
 */
export function applyUnattemptedFilters(
  rows: readonly QualityRow[],
  state: UnattemptedState,
): QualityRow[] {
  return rows
    .filter(
      (row) =>
        inSegment(row, state.segment) &&
        (state.topicId === undefined || row.topic.id === state.topicId) &&
        (state.type === undefined || row.type === state.type) &&
        (state.difficulty === undefined ||
          row.difficulty === state.difficulty) &&
        (state.scope === undefined || row.scopes.includes(state.scope)),
    )
    .sort(
      (a, b) =>
        a.course.id - b.course.id || a.unit.id - b.unit.id || a.id - b.id,
    );
}

export function hasUnattemptedListFilters(state: UnattemptedState): boolean {
  return (
    state.topicId !== undefined ||
    state.type !== undefined ||
    state.difficulty !== undefined ||
    state.scope !== undefined
  );
}

/* ------------------------------------------------------- observations -- */

/**
 * Facts the loaded data shows about one question that are worth knowing when
 * it has no usage — each one a plain reading of backend fields, never a
 * conclusion about why it has no attempts.
 */
export function rowObservations(
  row: QualityRow,
  course: Course | undefined,
  unit: Unit | undefined,
): string[] {
  const notes: string[] = [];

  if (course !== undefined && !row.scopes.includes(course.scope)) {
    notes.push(
      `Sorunun kapsamları (${
        row.scopes.map((scope) => courseScopeLabels[scope]).join(", ") || "—"
      }) dersin kapsamını (${courseScopeLabels[course.scope]}) içermiyor.`,
    );
  }
  if (row.status === "published" && unit !== undefined) {
    if (unit.status !== "published") {
      notes.push("Sorunun ünitesi yayında değil.");
    }
  }
  if (row.status === "published" && course !== undefined) {
    if (course.status !== "published") {
      notes.push("Sorunun dersi yayında değil.");
    }
  }

  return notes;
}

/** Possible causes for a published question without attempts — not a diagnosis. */
export const POSSIBLE_CAUSES: readonly Readonly<{
  title: string;
  detail: string;
}>[] = [
  {
    title: "Yeni yayınlanmış olabilir",
    detail:
      "Henüz öğrencilerin karşısına çıkacak kadar zaman geçmemiş olabilir. Yayın tarihi bu ekrandaki veride yok.",
  },
  {
    title: "Seçim havuzuna düşmüyor olabilir",
    detail:
      "Ünite düğümleri soruları konu, zorluk ve kapsama göre seçer; soru hiçbir düğümün ölçütüne uymuyor olabilir. Ünite hazırlık ekranındaki düğüm önizlemeleri bunu kontrol etmeye yardımcı olur.",
  },
  {
    title: "Düşük trafik olabilir",
    detail:
      "Ünite ya da ders az kullanılıyorsa soruların deneme alması zaman alır.",
  },
  {
    title: "Kapsam uyumsuz olabilir",
    detail:
      "Sorunun kapsamları öğrencinin hedef sınavıyla eşleşmiyorsa seçilmeyebilir.",
  },
];

/* ---------------------------------------------------------------- URL -- */

/** Reuses the Quality Center's parameter names and parsers, plus `segment`. */
export function parseUnattemptedState(
  params: URLSearchParams,
): UnattemptedState {
  const { filters } = parseQualityState(params);
  const segment = params.get("segment");

  return {
    segment:
      unattemptedSegments.find((item) => item === segment) ??
      DEFAULT_UNATTEMPTED_STATE.segment,
    courseId: filters.courseId,
    unitId: filters.unitId,
    topicId: filters.topicId,
    type: filters.type,
    difficulty: filters.difficulty,
    scope: filters.scope,
  };
}

export function serializeUnattemptedState(state: UnattemptedState): string {
  const filters: QualityFilters = Object.fromEntries(
    Object.entries({
      courseId: state.courseId,
      unitId: state.unitId,
      topicId: state.topicId,
      type: state.type,
      difficulty: state.difficulty,
      scope: state.scope,
    }).filter(([, value]) => value !== undefined),
  );
  const params = new URLSearchParams(
    serializeQualityState({ filters, sort: DEFAULT_QUALITY_SORT }),
  );

  if (state.segment !== DEFAULT_UNATTEMPTED_STATE.segment) {
    params.set("segment", state.segment);
  }

  return params.toString();
}
