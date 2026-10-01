import type { ReactNode } from "react";

import type { DistributionEntry } from "@/features/analytics/analytics-aggregations";

/**
 * A bar row. `value` may be null for a category that has no measurement
 * (e.g. no attempted questions at a difficulty): it keeps its row, says
 * "Veri yok" and draws no bar, rather than masquerading as zero. `detail` is
 * an optional secondary line (sample size, the other average, …).
 */
export type BarEntry = Readonly<{
  id: string;
  label: string;
  value: number | null;
  detail?: string;
}>;

/**
 * A horizontal bar-per-category chart: the one form for "compare magnitude
 * across labeled categories" (see the data-viz skill's form table). One
 * sequential hue (`bg-primary`) carries magnitude only — every bar already
 * carries its own text label and number, so identity never depends on color,
 * and a colorblind reader loses nothing.
 *
 * Bars are scaled against the largest value in the list, not a fixed scale,
 * so a list of small counts doesn't render as a row of slivers — unless
 * `scaleMax` fixes the scale (a percentage reads against 100, not against
 * the best group).
 */
export function BarList({
  entries,
  title,
  valueLabel = "Sayı",
  formatValue = String,
  scaleMax,
  description,
}: {
  entries: readonly (BarEntry | DistributionEntry)[];
  title: string;
  valueLabel?: string;
  formatValue?: (value: number) => string;
  scaleMax?: number;
  /** A note under the title, e.g. how an average is computed. */
  description?: ReactNode;
}) {
  const max =
    scaleMax ?? Math.max(1, ...entries.map((entry) => entry.value ?? 0));

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {description === undefined ? null : (
        <p className="mt-1 text-xs text-muted">{description}</p>
      )}
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Gösterilecek veri yok.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {entries.map((entry) => {
            const detail = "detail" in entry ? entry.detail : undefined;
            const shown =
              entry.value === null ? "Veri yok" : formatValue(entry.value);

            return (
              <li key={entry.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{entry.label}</span>
                  <span
                    aria-label={`${entry.label}: ${shown}${
                      entry.value === null ? "" : ` ${valueLabel}`
                    }`}
                    className={
                      entry.value === null
                        ? "shrink-0 text-muted"
                        : "shrink-0 font-medium tabular-nums"
                    }
                  >
                    {shown}
                  </span>
                </div>
                <div
                  aria-hidden="true"
                  className="mt-1 h-2 rounded-full bg-surface-muted"
                >
                  {entry.value === null ? null : (
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{
                        width: `${Math.min(100, (entry.value / max) * 100)}%`,
                      }}
                    />
                  )}
                </div>
                {detail === undefined ? null : (
                  <p className="mt-1 text-xs text-muted">{detail}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
