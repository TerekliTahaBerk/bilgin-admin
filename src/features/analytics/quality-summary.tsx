"use client";

import { memo } from "react";

import type { PublishStatus } from "@/contracts/admin/content";
import {
  HIGH_CORRECT_RATE_MIN,
  LOW_CORRECT_RATE_MAX,
  type QualitySummary as Summary,
} from "@/features/analytics/quality-dataset";
import {
  applyPreset,
  DEFAULT_QUALITY_SORT,
  matchesView,
  qualityPresets,
  scopeOf,
  type QualityPresetId,
  type QualityViewState,
} from "@/features/analytics/quality-filters";
import { publishStatusLabels } from "@/features/content/content-labels";

type Tile = Readonly<{
  id: string;
  label: string;
  value: number;
  target: Pick<QualityViewState, "filters" | "sort">;
  tone?: "warning";
}>;

function presetTarget(id: QualityPresetId) {
  const preset = qualityPresets.find((candidate) => candidate.id === id);

  // The ids are a closed union over `qualityPresets`, so this never misses.
  return {
    filters: preset?.filters ?? {},
    sort: preset?.sort ?? DEFAULT_QUALITY_SORT,
  };
}

function statusTarget(status: PublishStatus) {
  const presetId =
    status === "draft" ? "drafts" : status === "review" ? "in_review" : null;

  return presetId === null
    ? { filters: { status }, sort: DEFAULT_QUALITY_SORT }
    : presetTarget(presetId);
}

function tiles(summary: Summary): Tile[] {
  return [
    {
      id: "total",
      label: "Taranan soru",
      value: summary.total,
      target: { filters: {}, sort: DEFAULT_QUALITY_SORT },
    },
    {
      id: "needs_review",
      label: "İnceleme gerekli",
      value: summary.needsReview,
      target: presetTarget("needs_review"),
      tone: "warning",
    },
    {
      id: "unsolved",
      label: "Hiç çözülmemiş",
      value: summary.unsolved,
      target: presetTarget("unsolved"),
    },
    {
      id: "high_rate",
      label: `Yüksek doğru oranı (%${HIGH_CORRECT_RATE_MIN}+)`,
      value: summary.highRate,
      target: presetTarget("very_high_rate"),
    },
    {
      id: "low_rate",
      label: `Düşük doğru oranı (≤%${LOW_CORRECT_RATE_MAX})`,
      value: summary.lowRate,
      target: presetTarget("very_low_rate"),
    },
    {
      id: "edited",
      label: "Düzenlenmiş (sürüm > 1)",
      value: summary.edited,
      target: presetTarget("edited"),
    },
    ...(["draft", "review", "published", "archived"] as const).map(
      (status): Tile => ({
        id: `status-${status}`,
        label: publishStatusLabels[status],
        value: summary.byStatus[status],
        target: statusTarget(status),
      }),
    ),
  ];
}

/**
 * Counts over every loaded question in the current course/unit scope. Each
 * tile is also a shortcut: pressing it shows exactly the questions it counts.
 */
export const QualitySummaryTiles = memo(function QualitySummaryTiles({
  summary,
  state,
  onChange,
}: {
  summary: Summary;
  state: QualityViewState;
  onChange: (next: QualityViewState) => void;
}) {
  return (
    <section aria-labelledby="quality-summary-heading" className="space-y-3">
      <h2 className="text-sm font-semibold" id="quality-summary-heading">
        Özet
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles(summary).map((tile) => {
          const isActive = matchesView(
            state,
            tile.target.filters,
            tile.target.sort,
          );

          return (
            <li key={tile.id}>
              <button
                aria-pressed={isActive}
                className={`flex h-full w-full flex-col items-start rounded-lg border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  isActive
                    ? "border-primary bg-primary-soft"
                    : "border-border bg-surface hover:bg-surface-muted"
                }`}
                onClick={() =>
                  onChange({
                    filters: {
                      ...scopeOf(state.filters),
                      ...tile.target.filters,
                    },
                    sort: tile.target.sort,
                  })
                }
                type="button"
              >
                <span
                  className={`text-2xl font-semibold tracking-tight ${
                    tile.tone === "warning" && tile.value > 0
                      ? "text-amber-700"
                      : ""
                  }`}
                >
                  {tile.value}
                </span>
                <span className="mt-1 text-sm text-muted">{tile.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
});

/** The ten ready-made views, plus "Tümü" to drop every list filter. */
export const QualityPresetBar = memo(function QualityPresetBar({
  state,
  onChange,
}: {
  state: QualityViewState;
  onChange: (next: QualityViewState) => void;
}) {
  const allActive = matchesView(state, {}, DEFAULT_QUALITY_SORT);
  const chip = (isActive: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
      isActive
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-surface hover:bg-surface-muted"
    }`;

  return (
    <div
      aria-label="Hazır görünümler"
      className="flex flex-wrap gap-2"
      role="group"
    >
      <button
        aria-pressed={allActive}
        className={chip(allActive)}
        onClick={() =>
          onChange({
            filters: scopeOf(state.filters),
            sort: DEFAULT_QUALITY_SORT,
          })
        }
        type="button"
      >
        Tümü
      </button>
      {qualityPresets.map((preset) => {
        const isActive = matchesView(state, preset.filters, preset.sort);

        return (
          <button
            aria-pressed={isActive}
            className={chip(isActive)}
            key={preset.id}
            onClick={() => onChange(applyPreset(state, preset))}
            title={preset.description}
            type="button"
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
});
