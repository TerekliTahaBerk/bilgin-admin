"use client";

import type { ExerciseTopic } from "@/contracts/admin/content";
import {
  exerciseTypeLabels,
  publishStatusLabels,
} from "@/features/content/content-labels";
import {
  DIFFICULTY_LEVELS,
  type DifficultyLevel,
} from "@/features/content/exercise-filters";
import {
  exerciseTypes,
  publishStatuses,
  type ExerciseType,
  type PublishStatus,
} from "@/contracts/admin/content";

export type ExerciseFilterValues = Readonly<{
  type?: ExerciseType;
  status?: PublishStatus;
  topicId?: number;
  difficulty?: DifficultyLevel;
}>;

type ExerciseFilterBarProps = Readonly<{
  values: ExerciseFilterValues;
  topics: readonly ExerciseTopic[];
  onChange: (next: Partial<ExerciseFilterValues>) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
}>;

const selectClass =
  "mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft";

export function ExerciseFilterBar({
  values,
  topics,
  onChange,
  onClear,
  hasActiveFilters,
}: ExerciseFilterBarProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="block text-xs font-medium" htmlFor="filter-type">
            Tip
          </label>
          <select
            className={selectClass}
            id="filter-type"
            onChange={(event) =>
              onChange({
                type:
                  event.target.value === ""
                    ? undefined
                    : (event.target.value as ExerciseType),
              })
            }
            value={values.type ?? ""}
          >
            <option value="">Tümü</option>
            {exerciseTypes.map((type) => (
              <option key={type} value={type}>
                {exerciseTypeLabels[type]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium" htmlFor="filter-status">
            Durum
          </label>
          <select
            className={selectClass}
            id="filter-status"
            onChange={(event) =>
              onChange({
                status:
                  event.target.value === ""
                    ? undefined
                    : (event.target.value as PublishStatus),
              })
            }
            value={values.status ?? ""}
          >
            <option value="">Tümü</option>
            {publishStatuses.map((status) => (
              <option key={status} value={status}>
                {publishStatusLabels[status]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium" htmlFor="filter-topic">
            Konu
          </label>
          <select
            className={selectClass}
            id="filter-topic"
            onChange={(event) =>
              onChange({
                topicId:
                  event.target.value === ""
                    ? undefined
                    : Number(event.target.value),
              })
            }
            value={values.topicId === undefined ? "" : String(values.topicId)}
          >
            <option value="">Tümü</option>
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            className="block text-xs font-medium"
            htmlFor="filter-difficulty"
          >
            Zorluk
          </label>
          <select
            className={selectClass}
            id="filter-difficulty"
            onChange={(event) =>
              onChange({
                difficulty:
                  event.target.value === ""
                    ? undefined
                    : (Number(event.target.value) as DifficultyLevel),
              })
            }
            value={
              values.difficulty === undefined ? "" : String(values.difficulty)
            }
          >
            <option value="">Tümü</option>
            {DIFFICULTY_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>
      </div>

      {hasActiveFilters ? (
        <button
          className="mt-3 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted"
          onClick={onClear}
          type="button"
        >
          Filtreleri temizle
        </button>
      ) : null}
    </div>
  );
}
