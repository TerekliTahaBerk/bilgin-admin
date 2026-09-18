import type { Unit } from "@/contracts/admin/content";

export type UnitsSummary = Readonly<{
  totalUnits: number;
  publishedUnits: number;
  totalExercises: number;
  totalNodes: number;
}>;

/**
 * Every figure comes from the units payload itself, which reports
 * `exercise_count` per unit directly — no extra request, no aggregation across
 * courses.
 *
 * Deliberately absent: any notion of "publishable". Counts cannot establish
 * that. Node templates and selection rules decide what a node actually needs,
 * and the backend's preview-selection and publish endpoints are the only
 * trustworthy gate.
 */
export function summarizeUnits(units: readonly Unit[]): UnitsSummary {
  return {
    totalUnits: units.length,
    publishedUnits: units.filter((unit) => unit.status === "published").length,
    totalExercises: units.reduce(
      (total, unit) => total + unit.exercise_count,
      0,
    ),
    totalNodes: units.reduce((total, unit) => total + unit.node_count, 0),
  };
}

export function isAwaitingExercises(unit: Unit): boolean {
  return unit.exercise_count === 0;
}
