import type { Course, PublishStatus, Unit } from "@/contracts/admin/content";
import {
  unitReadinessCategories,
  unitReadinessCategory,
  type UnitReadinessCategory,
} from "@/features/content/readiness";
import {
  parseExerciseStatus,
  parseTopicId,
} from "@/features/content/exercise-filters";
import type { UnitReadinessSnapshot } from "@/features/content/use-readiness-snapshots";

export type PublishingRow = Readonly<{
  course: Course;
  /** The course's position in the backend's `sort_order`. */
  courseIndex: number;
  unit: Unit;
  snapshot: UnitReadinessSnapshot | undefined;
  category: UnitReadinessCategory;
}>;

/**
 * One row per unit, in catalogue order (course `sort_order`, then unit
 * `sort_order` — both as the backend returned them). The category reads the
 * unit's own status and its preview verdicts; see `unitReadinessCategory`.
 */
export function buildPublishingRows(
  courses: readonly Course[],
  unitsByCourse: ReadonlyMap<number, readonly Unit[]>,
  snapshots: ReadonlyMap<number, UnitReadinessSnapshot>,
): PublishingRow[] {
  return courses.flatMap((course, courseIndex) =>
    (unitsByCourse.get(course.id) ?? []).map((unit): PublishingRow => {
      const snapshot = snapshots.get(unit.id);

      return {
        course,
        courseIndex,
        unit,
        snapshot,
        category: unitReadinessCategory(unit.status, snapshot?.summary ?? null),
      };
    }),
  );
}

/**
 * A count over per-node verdicts. A positive count is a fact as soon as those
 * nodes answer; zero is only claimed once every node has answered — "0
 * bloklayan adım" on a half-checked unit would read as a verdict it is not.
 */
function answeredCount(
  row: PublishingRow,
  pick: (summary: NonNullable<UnitReadinessSnapshot["summary"]>) => number,
): number | null {
  const summary = row.snapshot?.summary;

  if (summary === null || summary === undefined) return null;

  const count = pick(summary);
  const isComplete = summary.passing + summary.failing === summary.total;

  return count > 0 || isComplete ? count : null;
}

/** Nodes the backend answered `passes: false` for; `null` while unknown. */
export function blockingCount(row: PublishingRow): number | null {
  return answeredCount(row, (summary) => summary.failing);
}

/** Nodes with a relaxed pass or a live warning; `null` while unknown. */
export function warningCount(row: PublishingRow): number | null {
  return answeredCount(row, (summary) => summary.warnings);
}

/** The unit's node count: the loaded list when there is one, else the unit list's count. */
export function nodeCount(row: PublishingRow): number {
  return row.snapshot?.nodesState === "answered"
    ? row.snapshot.nodes.length
    : row.unit.node_count;
}

/* ---------------------------------------------------------- filters -- */

export type PublishingFilters = Readonly<{
  courseId?: number;
  status?: PublishStatus;
  /** Empty means every category. */
  categories: readonly UnitReadinessCategory[];
}>;

export function applyPublishingFilters(
  rows: readonly PublishingRow[],
  filters: PublishingFilters,
): PublishingRow[] {
  return rows.filter(
    (row) =>
      (filters.courseId === undefined || row.course.id === filters.courseId) &&
      (filters.status === undefined || row.unit.status === filters.status) &&
      (filters.categories.length === 0 ||
        filters.categories.includes(row.category)),
  );
}

export function countByCategory(
  rows: readonly PublishingRow[],
): Readonly<Record<UnitReadinessCategory, number>> {
  const counts = Object.fromEntries(
    unitReadinessCategories.map((category) => [category, 0]),
  ) as Record<UnitReadinessCategory, number>;

  for (const row of rows) counts[row.category] += 1;

  return counts;
}

/* ---------------------------------------------------------- sorting -- */

export const publishingSortKeys = [
  "blocking",
  "exercises",
  "course",
  "unit",
] as const;

export type PublishingSortKey = (typeof publishingSortKeys)[number];

export type PublishingSort = Readonly<{
  key: PublishingSortKey;
  direction: "asc" | "desc";
}>;

export const DEFAULT_PUBLISHING_SORT: PublishingSort = {
  key: "course",
  direction: "asc",
};

export const publishingSortLabels: Readonly<Record<PublishingSortKey, string>> =
  {
    blocking: "Bloklayan adım sayısı",
    exercises: "Soru sayısı",
    course: "Ders",
    unit: "Ünite adı",
  };

function catalogueOrder(left: PublishingRow, right: PublishingRow): number {
  return (
    left.courseIndex - right.courseIndex ||
    left.unit.sort_order - right.unit.sort_order ||
    left.unit.id - right.unit.id
  );
}

/**
 * Returns a new array. Units whose blocking count is not known yet go last in
 * either direction — "most blocked first" must not open with units nobody has
 * checked. Ties keep catalogue order.
 */
export function sortPublishingRows(
  rows: readonly PublishingRow[],
  sort: PublishingSort,
): PublishingRow[] {
  const factor = sort.direction === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    switch (sort.key) {
      case "blocking": {
        const a = blockingCount(left);
        const b = blockingCount(right);

        if (a === null || b === null) {
          if (a !== b) return a === null ? 1 : -1;
          return catalogueOrder(left, right);
        }

        return (a - b) * factor || catalogueOrder(left, right);
      }
      case "exercises":
        return (
          (left.unit.exercise_count - right.unit.exercise_count) * factor ||
          catalogueOrder(left, right)
        );
      case "course":
        return catalogueOrder(left, right) * factor;
      case "unit":
        return (
          left.unit.title.localeCompare(right.unit.title, "tr") * factor ||
          catalogueOrder(left, right)
        );
    }
  });
}

/** Rows split into the five categories, in their fixed order; empty groups dropped. */
export function groupByCategory(
  rows: readonly PublishingRow[],
): { category: UnitReadinessCategory; rows: PublishingRow[] }[] {
  return unitReadinessCategories
    .map((category) => ({
      category,
      rows: rows.filter((row) => row.category === category),
    }))
    .filter((group) => group.rows.length > 0);
}

/* -------------------------------------------------------------- URL -- */

export type PublishingViewState = Readonly<{
  filters: PublishingFilters;
  sort: PublishingSort;
}>;

function parseCategories(value: string | null): UnitReadinessCategory[] {
  if (value === null) return [];

  const requested = new Set(value.split(","));

  // Fixed order, duplicates and unknown values dropped.
  return unitReadinessCategories.filter((category) => requested.has(category));
}

/** Anything unparseable becomes "not set", the same rule as the other lists. */
export function parsePublishingState(
  params: URLSearchParams,
): PublishingViewState {
  const courseId = parseTopicId(params.get("course"));
  const status = parseExerciseStatus(params.get("status"));
  const key = params.get("sort");
  const sortKey = (publishingSortKeys as readonly (string | null)[]).includes(
    key,
  )
    ? (key as PublishingSortKey)
    : undefined;

  return {
    filters: {
      ...(courseId === undefined ? {} : { courseId }),
      ...(status === undefined ? {} : { status }),
      categories: parseCategories(params.get("show")),
    },
    sort:
      sortKey === undefined
        ? DEFAULT_PUBLISHING_SORT
        : {
            key: sortKey,
            direction: params.get("dir") === "desc" ? "desc" : "asc",
          },
  };
}

export function serializePublishingState(state: PublishingViewState): string {
  const params = new URLSearchParams();
  const { filters, sort } = state;

  if (filters.courseId !== undefined) {
    params.set("course", String(filters.courseId));
  }
  if (filters.status !== undefined) params.set("status", filters.status);
  if (filters.categories.length > 0) {
    params.set("show", parseCategories(filters.categories.join(",")).join(","));
  }
  if (
    sort.key !== DEFAULT_PUBLISHING_SORT.key ||
    sort.direction !== DEFAULT_PUBLISHING_SORT.direction
  ) {
    params.set("sort", sort.key);
    params.set("dir", sort.direction);
  }

  return params.toString();
}
