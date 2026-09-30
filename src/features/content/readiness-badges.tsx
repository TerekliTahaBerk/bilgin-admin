import {
  readinessStateLabels,
  unitReadinessCategoryLabels,
  type ReadinessState,
  type UnitReadinessCategory,
} from "@/features/content/readiness";

const badgeBase =
  "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium";

const stateStyles: Readonly<Record<ReadinessState, string>> = {
  pass: "border-emerald-200 bg-emerald-50 text-emerald-800",
  relaxed: "border-amber-200 bg-amber-50 text-amber-800",
  fail: "border-red-200 bg-red-50 text-red-800",
};

const categoryStyles: Readonly<Record<UnitReadinessCategory, string>> = {
  ready: stateStyles.pass,
  relaxed: stateStyles.relaxed,
  blocked: stateStyles.fail,
  unknown: "border-border bg-surface-muted text-muted",
  published: "border-sky-200 bg-sky-50 text-sky-800",
};

/** One node's verdict. The text label always carries the meaning. */
export function ReadinessStateBadge({ state }: { state: ReadinessState }) {
  return (
    <span className={`${badgeBase} ${stateStyles[state]}`}>
      {readinessStateLabels[state]}
    </span>
  );
}

/** A unit's publishing category. The text label always carries the meaning. */
export function UnitCategoryBadge({
  category,
}: {
  category: UnitReadinessCategory;
}) {
  return (
    <span className={`${badgeBase} ${categoryStyles[category]}`}>
      {unitReadinessCategoryLabels[category]}
    </span>
  );
}
