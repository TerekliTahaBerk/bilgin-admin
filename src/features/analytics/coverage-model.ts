import {
  courseScopes,
  type Course,
  type CourseScope,
} from "@/contracts/admin/content";
import type { CourseTopicsData } from "@/contracts/admin/exercise-editor";
import { courseScopeLabels } from "@/features/content/content-labels";
import type { ContentSnapshot } from "@/features/content/content-snapshot";
import { parseTopicId } from "@/features/content/exercise-filters";
import {
  classifyTopicCoverage,
  TOPIC_COVERAGE_THRESHOLDS,
  topicCoverageLabels,
  topicCoverageStates,
  type TopicCoverageState,
} from "@/features/content/topic-coverage";
import type { CsvColumn } from "@/lib/export/csv";

export type CourseTopic = CourseTopicsData["topics"][number];

/**
 * One topic of the selected course's subject.
 *
 * - `backendCount` is the backend's `exercise_count`: every question of the
 *   topic, in every course of the subject, in every status. It is the
 *   number the coverage band is computed from.
 * - `scannedCount` is how many of the snapshot's questions — owned by this
 *   course's units — have this topic; `null` without a snapshot. It is a
 *   different question ("how much of it lives in this course") and is never
 *   used to second-guess the backend's count.
 */
export type CoverageRow = Readonly<{
  topic: CourseTopic;
  parentName: string | null;
  backendCount: number;
  scannedCount: number | null;
  /** The snapshot could not read some of this course's lists. */
  scannedIncomplete: boolean;
  state: TopicCoverageState;
}>;

/** Whether the snapshot is missing any list of this course. */
export function courseScanIncomplete(
  snapshot: ContentSnapshot,
  courseId: number,
): boolean {
  return snapshot.errors.some(
    (error) =>
      error.kind === "courses" ||
      ((error.kind === "course" || error.kind === "unit") &&
        error.courseId === courseId),
  );
}

export function buildCoverageRows(
  data: CourseTopicsData,
  snapshot: ContentSnapshot | null,
): CoverageRow[] {
  const names = new Map(data.topics.map((topic) => [topic.id, topic.name]));
  const scanned = new Map<number, number>();

  if (snapshot !== null) {
    for (const exercise of snapshot.exercises) {
      if (exercise.courseId === data.course.id) {
        scanned.set(
          exercise.topic.id,
          (scanned.get(exercise.topic.id) ?? 0) + 1,
        );
      }
    }
  }

  const incomplete =
    snapshot !== null && courseScanIncomplete(snapshot, data.course.id);

  return data.topics.map((topic) => ({
    topic,
    parentName:
      topic.parent_id === undefined
        ? null
        : (names.get(topic.parent_id) ?? `Konu #${topic.parent_id}`),
    backendCount: topic.exercise_count,
    scannedCount: snapshot === null ? null : (scanned.get(topic.id) ?? 0),
    scannedIncomplete: incomplete,
    state: classifyTopicCoverage(topic.exercise_count),
  }));
}

export function countByCoverageState(
  rows: readonly CoverageRow[],
): Readonly<Record<TopicCoverageState, number>> {
  const counts = Object.fromEntries(
    topicCoverageStates.map((state) => [state, 0]),
  ) as Record<TopicCoverageState, number>;

  for (const row of rows) counts[row.state] += 1;

  return counts;
}

/* ------------------------------------------------------------ views -- */

export const coverageViews = [
  "all",
  "empty",
  "under_medium",
  "under_good",
] as const;

export type CoverageView = (typeof coverageViews)[number];

/** View labels follow the central thresholds, so they never disagree. */
export const coverageViewLabels: Readonly<Record<CoverageView, string>> = {
  all: "Tümü",
  empty: "Yalnız boş",
  under_medium: `${TOPIC_COVERAGE_THRESHOLDS.medium} altı`,
  under_good: `${TOPIC_COVERAGE_THRESHOLDS.good} altı`,
};

const viewStates: Readonly<
  Record<CoverageView, readonly TopicCoverageState[]>
> = {
  all: topicCoverageStates,
  empty: ["none"],
  under_medium: ["none", "low"],
  under_good: ["none", "low", "medium"],
};

export const coverageSorts = [
  "order",
  "count_asc",
  "count_desc",
  "name",
] as const;
export type CoverageSort = (typeof coverageSorts)[number];

export const coverageSortLabels: Readonly<Record<CoverageSort, string>> = {
  order: "Müfredat sırası",
  count_asc: "Soru sayısı (artan)",
  count_desc: "Soru sayısı (azalan)",
  name: "Konu adı",
};

export type CoverageMode = "table" | "course" | "scope";

export type CoverageState = Readonly<{
  courseId?: number;
  view: CoverageView;
  /** A grade level, or "none" for topics without one. */
  grade?: number | "none";
  /** A parent topic id, or "root" for topics without a parent. */
  parent?: number | "root";
  query: string;
  sort: CoverageSort;
  mode: CoverageMode;
}>;

export const DEFAULT_COVERAGE_STATE: CoverageState = {
  view: "all",
  query: "",
  sort: "order",
  mode: "table",
};

/** Turkish-aware, case- and accent-tolerant contains. */
function normalize(text: string): string {
  return text.toLocaleLowerCase("tr").normalize("NFD").replace(/\p{M}/gu, "");
}

export function applyCoverageFilters(
  rows: readonly CoverageRow[],
  state: Pick<CoverageState, "view" | "grade" | "parent" | "query">,
): CoverageRow[] {
  const allowed = viewStates[state.view];
  const needle = normalize(state.query.trim());

  return rows.filter(
    (row) =>
      allowed.includes(row.state) &&
      (state.grade === undefined ||
        (state.grade === "none"
          ? row.topic.grade_level === undefined
          : row.topic.grade_level === state.grade)) &&
      (state.parent === undefined ||
        (state.parent === "root"
          ? row.topic.parent_id === undefined
          : row.topic.parent_id === state.parent)) &&
      (needle === "" ||
        normalize(row.topic.name).includes(needle) ||
        normalize(row.topic.code).includes(needle)),
  );
}

/** Returns a new array; ties keep the backend's curriculum order. */
export function sortCoverageRows(
  rows: readonly CoverageRow[],
  sort: CoverageSort,
): CoverageRow[] {
  const indexed = rows.map((row, index) => ({ row, index }));

  indexed.sort((left, right) => {
    const a = left.row;
    const b = right.row;
    const byOrder = left.index - right.index;

    switch (sort) {
      case "order":
        return byOrder;
      case "count_asc":
        return a.backendCount - b.backendCount || byOrder;
      case "count_desc":
        return b.backendCount - a.backendCount || byOrder;
      case "name":
        return a.topic.name.localeCompare(b.topic.name, "tr") || byOrder;
    }
  });

  return indexed.map(({ row }) => row);
}

export function gradeOptions(rows: readonly CoverageRow[]): number[] {
  return [
    ...new Set(
      rows.flatMap((row) =>
        row.topic.grade_level === undefined ? [] : [row.topic.grade_level],
      ),
    ),
  ].sort((a, b) => a - b);
}

/** Topics that are some other topic's parent, in curriculum order. */
export function parentOptions(
  rows: readonly CoverageRow[],
): { id: number; name: string }[] {
  const parentIds = new Set(
    rows.flatMap((row) =>
      row.topic.parent_id === undefined ? [] : [row.topic.parent_id],
    ),
  );
  const names = new Map(rows.map((row) => [row.topic.id, row.topic.name]));

  return [...parentIds].map((id) => ({
    id,
    name: names.get(id) ?? `Konu #${id}`,
  }));
}

/* ----------------------------------------------------------- matrix -- */

export type MatrixColumn = Readonly<{
  id: string;
  label: string;
  /** The snapshot is missing some lists behind this column. */
  incomplete: boolean;
}>;

export type CoverageMatrix = Readonly<{
  columns: readonly MatrixColumn[];
  /** `null` cell: the data cannot say (no snapshot). */
  cell: (topicId: number, columnId: string) => number | null;
}>;

/**
 * topic × course. A cell is how many snapshot questions owned by that
 * course's units carry the topic. The backend's `exercise_count` is
 * subject-wide and is never split across courses; without a snapshot every
 * cell is unknown.
 */
export function buildCourseMatrix(
  courses: readonly Course[],
  snapshot: ContentSnapshot | null,
): CoverageMatrix {
  const counts = new Map<string, number>();

  if (snapshot !== null) {
    for (const exercise of snapshot.exercises) {
      const key = `${exercise.topic.id}:${exercise.courseId}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return {
    columns: courses.map((course) => ({
      id: String(course.id),
      label: course.name,
      incomplete:
        snapshot !== null && courseScanIncomplete(snapshot, course.id),
    })),
    cell: (topicId, columnId) =>
      snapshot === null ? null : (counts.get(`${topicId}:${columnId}`) ?? 0),
  };
}

/**
 * topic × exam scope. A cell is how many snapshot questions with the topic
 * list that scope in `scopes` — a question can be in several scopes, so a
 * row's cells do not add up to its total. The backend reports no per-scope
 * topic count, so without a snapshot every cell is unknown.
 */
export function buildScopeMatrix(
  scopes: readonly CourseScope[],
  snapshot: ContentSnapshot | null,
): CoverageMatrix {
  const counts = new Map<string, number>();

  if (snapshot !== null) {
    for (const exercise of snapshot.exercises) {
      for (const scope of exercise.scopes) {
        const key = `${exercise.topic.id}:${scope}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }

  return {
    columns: scopes.map((scope) => ({
      id: scope,
      label: courseScopeLabels[scope],
      incomplete: snapshot !== null && snapshot.status === "partial",
    })),
    cell: (topicId, columnId) =>
      snapshot === null ? null : (counts.get(`${topicId}:${columnId}`) ?? 0),
  };
}

/**
 * Scopes worth a column: the subject's courses' own scopes, plus any scope a
 * scanned question of these topics is tagged with — in the backend's enum
 * order.
 */
export function matrixScopes(
  topicIds: ReadonlySet<number>,
  subjectCourses: readonly Course[],
  snapshot: ContentSnapshot | null,
): CourseScope[] {
  const used = new Set<CourseScope>(
    subjectCourses.map((course) => course.scope),
  );

  for (const exercise of snapshot?.exercises ?? []) {
    if (topicIds.has(exercise.topic.id)) {
      for (const scope of exercise.scopes) used.add(scope);
    }
  }

  return courseScopes.filter((scope) => used.has(scope));
}

/* -------------------------------------------------------------- csv -- */

export function coverageCsvColumns(
  courseName: string,
): readonly CsvColumn<CoverageRow>[] {
  return [
    { header: "Ders", value: () => courseName },
    { header: "Konu", value: (row) => row.topic.name },
    { header: "Konu kodu", value: (row) => row.topic.code },
    { header: "Üst konu", value: (row) => row.parentName },
    { header: "Sınıf", value: (row) => row.topic.grade_level },
    { header: "Backend soru sayısı", value: (row) => row.backendCount },
    // Empty when there is no snapshot: unknown is not zero.
    { header: "Bu dersin taranan sorusu", value: (row) => row.scannedCount },
    {
      header: "Taranan sayı eksik olabilir",
      value: (row) =>
        row.scannedCount === null
          ? ""
          : row.scannedIncomplete
            ? "Evet"
            : "Hayır",
    },
    { header: "Kapsam durumu", value: (row) => topicCoverageLabels[row.state] },
  ];
}

export function matrixCsvColumns(
  matrix: CoverageMatrix,
): readonly CsvColumn<CoverageRow>[] {
  return [
    { header: "Konu", value: (row) => row.topic.name },
    {
      header: "Backend soru sayısı (konu geneli)",
      value: (row) => row.backendCount,
    },
    ...matrix.columns.map((column): CsvColumn<CoverageRow> => ({
      header: column.label,
      // Empty for unknown cells.
      value: (row) => matrix.cell(row.topic.id, column.id),
    })),
  ];
}

/* -------------------------------------------------------------- URL -- */

function parseEnum<Value extends string>(
  values: readonly Value[],
  raw: string | null,
): Value | undefined {
  return (values as readonly (string | null)[]).includes(raw)
    ? (raw as Value)
    : undefined;
}

export function parseCoverageState(params: URLSearchParams): CoverageState {
  const grade = params.get("grade");
  const parent = params.get("parent");
  const gradeNumber =
    grade !== null && /^\d{1,2}$/.test(grade) ? Number(grade) : undefined;
  const courseId = parseTopicId(params.get("course"));
  const parentId = parseTopicId(parent);

  return {
    ...(courseId === undefined ? {} : { courseId }),
    view: parseEnum(coverageViews, params.get("view")) ?? "all",
    ...(grade === "none"
      ? { grade: "none" as const }
      : gradeNumber === undefined
        ? {}
        : { grade: gradeNumber }),
    ...(parent === "root"
      ? { parent: "root" as const }
      : parentId === undefined
        ? {}
        : { parent: parentId }),
    query: (params.get("q") ?? "").slice(0, 100),
    sort: parseEnum(coverageSorts, params.get("sort")) ?? "order",
    mode:
      parseEnum(["table", "course", "scope"] as const, params.get("mode")) ??
      "table",
  };
}

export function serializeCoverageState(state: CoverageState): string {
  const params = new URLSearchParams();

  if (state.courseId !== undefined)
    params.set("course", String(state.courseId));
  if (state.view !== "all") params.set("view", state.view);
  if (state.grade !== undefined) params.set("grade", String(state.grade));
  if (state.parent !== undefined) params.set("parent", String(state.parent));
  if (state.query.trim() !== "") params.set("q", state.query.trim());
  if (state.sort !== "order") params.set("sort", state.sort);
  if (state.mode !== "table") params.set("mode", state.mode);

  return params.toString();
}
