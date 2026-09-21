import type { DistributionEntry } from "@/features/analytics/analytics-aggregations";

/**
 * A horizontal bar-per-category chart: the one form for "compare magnitude
 * across labeled categories" (see the data-viz skill's form table). One
 * sequential hue (`bg-primary`) carries magnitude only — every bar already
 * carries its own text label and number, so identity never depends on color,
 * and a colorblind reader loses nothing.
 *
 * Bars are scaled against the largest value in the list, not a fixed scale,
 * so a list of small counts doesn't render as a row of slivers.
 */
export function BarList({
  entries,
  title,
  valueLabel = "Sayı",
}: {
  entries: readonly DistributionEntry[];
  title: string;
  valueLabel?: string;
}) {
  const max = Math.max(1, ...entries.map((entry) => entry.value));

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Gösterilecek veri yok.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {entries.map((entry) => (
            <li key={entry.id}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{entry.label}</span>
                <span
                  aria-label={`${entry.label}: ${entry.value} ${valueLabel}`}
                  className="shrink-0 font-medium tabular-nums"
                >
                  {entry.value}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="mt-1 h-2 rounded-full bg-surface-muted"
              >
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: `${(entry.value / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
