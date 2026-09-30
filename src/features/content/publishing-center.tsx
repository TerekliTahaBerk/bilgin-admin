"use client";

import {
  useQueries,
  useQuery,
  type QueryObserverResult,
} from "@tanstack/react-query";
import { ArrowDown, ArrowUp, RotateCw, ScanSearch, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  publishStatuses,
  type Course,
  type PublishStatus,
  type Unit,
} from "@/contracts/admin/content";
import type { PublishUnitData } from "@/contracts/admin/publication";
import { publishStatusLabels } from "@/features/content/content-labels";
import {
  coursesQueryOptions,
  courseUnitsQueryOptions,
} from "@/features/content/content-queries";
import {
  applyPublishingFilters,
  buildPublishingRows,
  countByCategory,
  groupByCategory,
  publishingSortKeys,
  publishingSortLabels,
  sortPublishingRows,
  type PublishingFilters,
  type PublishingRow,
  type PublishingSortKey,
  type PublishingViewState,
} from "@/features/content/publishing-model";
import { PublishingUnitCard } from "@/features/content/publishing-unit-card";
import {
  unitReadinessCategories,
  unitReadinessCategoryLabels,
  type UnitReadinessCategory,
} from "@/features/content/readiness";
import {
  useReadinessCheck,
  type ReadinessCheckState,
} from "@/features/content/use-readiness-check";
import { useReadinessSnapshots } from "@/features/content/use-readiness-snapshots";
import { toApiError, type ApiError } from "@/lib/api/error";

const NO_COURSES: readonly Course[] = [];

const selectClass =
  "mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft";
const primaryButton =
  "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60";

type UnitListResult = Readonly<{
  data: Unit[] | undefined;
  error: ApiError | null;
  isPending: boolean;
  isFetching: boolean;
  refetch: () => void;
}>;

function combineUnitLists(
  results: QueryObserverResult<Unit[]>[],
): UnitListResult[] {
  return results.map((result) => ({
    data: result.data,
    error: result.error === null ? null : toApiError(result.error),
    isPending: result.isPending,
    isFetching: result.isFetching,
    refetch: () => {
      void result.refetch();
    },
  }));
}

/** Sets or clears one optional filter without leaving an `undefined` key. */
function withFilter<Key extends "courseId" | "status">(
  filters: PublishingFilters,
  key: Key,
  value: PublishingFilters[Key],
): PublishingFilters {
  const next = { ...filters };

  if (value === undefined) delete next[key];
  else next[key] = value;

  return next;
}

function CheckBar({
  state,
  pendingIds,
  visibleIds,
  onCheck,
  onCancel,
}: {
  state: ReadinessCheckState;
  pendingIds: readonly number[];
  visibleIds: readonly number[];
  onCheck: (ids: readonly number[], refresh: boolean) => void;
  onCancel: () => void;
}) {
  const isRunning = state.status === "running";
  const progress = state.progress;

  return (
    <section
      aria-labelledby="readiness-check-heading"
      className="rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold" id="readiness-check-heading">
            Hazırlık kontrolü
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Her adımın hazırlığı sunucudaki seçim kuralının deneme
            çalıştırmasıyla belirlenir. Sayfa açılırken istek gönderilmez;
            kontrolü siz başlatırsınız. Yayın sırasında sunucu aynı kontrolü
            yeniden yapar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          {isRunning ? (
            <button
              className={secondaryButton}
              disabled={state.isCancelling}
              onClick={onCancel}
              type="button"
            >
              <Square aria-hidden="true" className="size-4" />
              {state.isCancelling ? "Durduruluyor…" : "Kontrolü durdur"}
            </button>
          ) : (
            <>
              {pendingIds.length === 0 ? null : (
                <button
                  className={primaryButton}
                  onClick={() => onCheck(pendingIds, false)}
                  type="button"
                >
                  <ScanSearch aria-hidden="true" className="size-4" />
                  Bilinmeyenleri kontrol et ({pendingIds.length} ünite)
                </button>
              )}
              {visibleIds.length === 0 ? null : (
                <button
                  className={secondaryButton}
                  onClick={() => onCheck(visibleIds, true)}
                  type="button"
                >
                  <RotateCw aria-hidden="true" className="size-4" />
                  Görünenleri yeniden kontrol et ({visibleIds.length})
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div aria-live="polite" className="mt-3 space-y-2">
        {isRunning ? (
          <div className="space-y-1.5">
            <p className="text-sm text-muted">
              {progress === null
                ? "Kontrol başlatılıyor…"
                : `Üniteler kontrol ediliyor: ${progress.completed}/${progress.total}`}
            </p>
            {progress === null ? null : (
              <div
                aria-label="Kontrol ilerlemesi"
                aria-valuemax={progress.total}
                aria-valuemin={0}
                aria-valuenow={progress.completed}
                className="h-2 overflow-hidden rounded-full bg-surface-muted"
                role="progressbar"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{
                    width: `${progress.total === 0 ? 100 : Math.round((progress.completed / progress.total) * 100)}%`,
                  }}
                />
              </div>
            )}
          </div>
        ) : state.status === "completed" ? (
          <p className="text-sm text-muted">
            Kontrol tamamlandı.
            {state.failedUnitIds.length === 0
              ? ""
              : ` ${state.failedUnitIds.length} ünitenin bazı adımları okunamadı; kartlarında ayrıntı var.`}
          </p>
        ) : state.status === "cancelled" ? (
          <p className="text-sm text-muted">
            Kontrol durduruldu. O ana kadar okunan sonuçlar kartlarda.
          </p>
        ) : state.haltError?.kind === "rate_limit" ? (
          <p className="text-sm text-danger" role="alert">
            Sunucu çok fazla istek aldığını bildirdi; kontrol durduruldu.
            {state.haltError.retryAfterSeconds === undefined
              ? " Bir süre sonra tekrar deneyin."
              : ` ${state.haltError.retryAfterSeconds} saniye sonra tekrar deneyin.`}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function CategoryFilter({
  counts,
  selected,
  onChange,
}: {
  counts: Readonly<Record<UnitReadinessCategory, number>>;
  selected: readonly UnitReadinessCategory[];
  onChange: (next: UnitReadinessCategory[]) => void;
}) {
  const chip = (isActive: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
      isActive
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-surface hover:bg-surface-muted"
    }`;

  return (
    <div
      aria-label="Hazırlık durumu"
      className="flex flex-wrap gap-2"
      role="group"
    >
      <button
        aria-pressed={selected.length === 0}
        className={chip(selected.length === 0)}
        onClick={() => onChange([])}
        type="button"
      >
        Tümü
      </button>
      {unitReadinessCategories.map((category) => {
        const isActive = selected.includes(category);

        return (
          <button
            aria-pressed={isActive}
            className={chip(isActive)}
            key={category}
            onClick={() =>
              onChange(
                isActive
                  ? selected.filter((item) => item !== category)
                  : unitReadinessCategories.filter(
                      (item) => item === category || selected.includes(item),
                    ),
              )
            }
            type="button"
          >
            {unitReadinessCategoryLabels[category]} ({counts[category]})
          </button>
        );
      })}
    </div>
  );
}

export type PublishingCenterProps = Readonly<{
  canPublish: boolean;
  state: PublishingViewState;
  onChange: (next: PublishingViewState) => void;
}>;

/**
 * Publishing readiness across the catalogue, without opening each unit.
 *
 * Unit lists come from the same per-course requests the courses browser
 * makes. Readiness comes from the same node and preview reads the unit page
 * makes (`useReadinessSnapshots`), observed from the cache and fetched only
 * when the admin asks. Publishing goes through the same `usePublishUnit`
 * workflow, one unit and one confirmation at a time.
 */
export function PublishingCenter({
  canPublish,
  state,
  onChange,
}: PublishingCenterProps) {
  const router = useRouter();
  const { filters, sort } = state;
  const coursesQuery = useQuery<Course[], ApiError>(coursesQueryOptions());
  const courses = coursesQuery.data ?? NO_COURSES;

  const unitLists = useQueries({
    queries: courses.map((course) => courseUnitsQueryOptions(course.id)),
    combine: combineUnitLists,
  });

  const unitsByCourse = useMemo(() => {
    const map = new Map<number, readonly Unit[]>();

    courses.forEach((course, index) => {
      const data = unitLists[index]?.data;
      if (data !== undefined) map.set(course.id, data);
    });

    return map;
  }, [courses, unitLists]);

  const unitIds = useMemo(
    () => [...unitsByCourse.values()].flat().map((unit) => unit.id),
    [unitsByCourse],
  );
  const snapshots = useReadinessSnapshots(unitIds, { enabled: false });
  const check = useReadinessCheck();
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const isSessionExpired =
    coursesQuery.error?.kind === "authentication" ||
    check.state.haltError?.kind === "authentication" ||
    unitLists.some((list) => list.error?.kind === "authentication");

  useEffect(() => {
    if (isSessionExpired) {
      router.replace("/login");
      router.refresh();
    }
  }, [isSessionExpired, router]);

  const rows = useMemo(
    () => buildPublishingRows(courses, unitsByCourse, snapshots),
    [courses, unitsByCourse, snapshots],
  );
  const scoped = useMemo(
    () => applyPublishingFilters(rows, { ...filters, categories: [] }),
    [rows, filters],
  );
  const counts = useMemo(() => countByCategory(scoped), [scoped]);
  const visible = useMemo(
    () =>
      sortPublishingRows(
        applyPublishingFilters(scoped, { categories: filters.categories }),
        sort,
      ),
    [scoped, filters.categories, sort],
  );
  const groups = useMemo(() => groupByCategory(visible), [visible]);

  const visibleIds = useMemo(
    () => visible.map((row) => row.unit.id),
    [visible],
  );
  const pendingIds = useMemo(
    () =>
      visible
        .filter(
          (row) =>
            row.snapshot?.summary === null ||
            row.snapshot?.summary === undefined ||
            row.snapshot.checks.some((item) => item.preview === undefined),
        )
        .map((row) => row.unit.id),
    [visible],
  );

  const { checkOne, checkMany } = check;
  const onCheck = useCallback(
    (unitId: number, options: { refresh: boolean }) =>
      checkOne(unitId, options),
    [checkOne],
  );
  const onPublished = useCallback(
    (row: PublishingRow, data: PublishUnitData) =>
      setAnnouncement(
        `«${row.unit.title}» yayınlandı. ${data.published_nodes} adım yayına alındı.`,
      ),
    [],
  );

  if (coursesQuery.isPending || isSessionExpired) {
    return (
      <div aria-busy="true" aria-live="polite" className="space-y-3">
        <p className="sr-only">Yayın verileri yükleniyor.</p>
        <div className="h-24 animate-pulse rounded-lg border border-border bg-surface" />
        <div className="h-40 animate-pulse rounded-lg border border-border bg-surface" />
      </div>
    );
  }

  if (coursesQuery.isError) {
    const isForbidden = coursesQuery.error.kind === "authorization";

    return (
      <div
        className="rounded-lg border border-border bg-surface p-6"
        role="alert"
      >
        <h2 className="text-sm font-semibold">
          {isForbidden
            ? "Bu bölüme erişim yetkiniz yok"
            : "Dersler yüklenemedi"}
        </h2>
        <p className="mt-1.5 max-w-prose text-sm text-muted">
          {coursesQuery.error.message}
        </p>
        {isForbidden ? null : (
          <button
            className={`${secondaryButton} mt-4`}
            disabled={coursesQuery.isFetching}
            onClick={() => {
              void coursesQuery.refetch();
            }}
            type="button"
          >
            {coursesQuery.isFetching ? "Deneniyor…" : "Tekrar dene"}
          </button>
        )}
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">Henüz ders bulunmuyor.</h2>
        <p className="mt-1.5 max-w-prose text-sm text-muted">
          Yayın hazırlığı, derslere ünite eklendikçe burada izlenebilir.
        </p>
      </div>
    );
  }

  const loadingLists = unitLists.filter((list) => list.isPending).length;
  const failedLists = courses
    .map((course, index) => ({ course, list: unitLists[index] }))
    .filter(
      ({ list }) =>
        list !== undefined && list.data === undefined && list.error !== null,
    );

  return (
    <div className="space-y-6">
      {announcement === null ? null : (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4"
          role="status"
        >
          <p className="text-sm font-medium text-emerald-900">{announcement}</p>
          <button
            className="text-sm font-medium text-emerald-900 underline"
            onClick={() => setAnnouncement(null)}
            type="button"
          >
            Kapat
          </button>
        </div>
      )}

      <CheckBar
        onCancel={check.cancel}
        onCheck={(ids, refresh) => checkMany(ids, { refresh })}
        pendingIds={pendingIds}
        state={check.state}
        visibleIds={visibleIds}
      />

      <section
        aria-labelledby="publishing-filters-heading"
        className="space-y-3"
      >
        <h2 className="text-sm font-semibold" id="publishing-filters-heading">
          Filtreler
        </h2>
        <CategoryFilter
          counts={counts}
          onChange={(categories) =>
            onChange({ filters: { ...filters, categories }, sort })
          }
          selected={filters.categories}
        />
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label
              className="block text-xs font-medium"
              htmlFor="publishing-course"
            >
              Ders
            </label>
            <select
              className={selectClass}
              id="publishing-course"
              onChange={(event) =>
                onChange({
                  filters: withFilter(
                    filters,
                    "courseId",
                    event.target.value === ""
                      ? undefined
                      : Number(event.target.value),
                  ),
                  sort,
                })
              }
              value={filters.courseId ?? ""}
            >
              <option value="">Tüm dersler</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="block text-xs font-medium"
              htmlFor="publishing-status"
            >
              Ünite durumu
            </label>
            <select
              className={selectClass}
              id="publishing-status"
              onChange={(event) =>
                onChange({
                  filters: withFilter(
                    filters,
                    "status",
                    event.target.value === ""
                      ? undefined
                      : (event.target.value as PublishStatus),
                  ),
                  sort,
                })
              }
              value={filters.status ?? ""}
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
            <label
              className="block text-xs font-medium"
              htmlFor="publishing-sort"
            >
              Sırala
            </label>
            <select
              className={selectClass}
              id="publishing-sort"
              onChange={(event) =>
                onChange({
                  filters,
                  sort: {
                    key: event.target.value as PublishingSortKey,
                    direction: sort.direction,
                  },
                })
              }
              value={sort.key}
            >
              {publishingSortKeys.map((key) => (
                <option key={key} value={key}>
                  {publishingSortLabels[key]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              aria-label={
                sort.direction === "asc"
                  ? "Artan sırada; azalan sıraya çevir"
                  : "Azalan sırada; artan sıraya çevir"
              }
              className={secondaryButton}
              onClick={() =>
                onChange({
                  filters,
                  sort: {
                    key: sort.key,
                    direction: sort.direction === "asc" ? "desc" : "asc",
                  },
                })
              }
              type="button"
            >
              {sort.direction === "asc" ? (
                <ArrowUp aria-hidden="true" className="size-4" />
              ) : (
                <ArrowDown aria-hidden="true" className="size-4" />
              )}
              {sort.direction === "asc" ? "Artan" : "Azalan"}
            </button>
          </div>
        </div>
      </section>

      {loadingLists > 0 ? (
        <p aria-busy="true" aria-live="polite" className="text-sm text-muted">
          Ünite listeleri yükleniyor ({courses.length - loadingLists}/
          {courses.length} ders)…
        </p>
      ) : null}

      {failedLists.length === 0 ? null : (
        <div
          className="rounded-lg border border-danger/30 bg-danger/5 p-4"
          role="alert"
        >
          <p className="text-sm font-medium text-danger">
            {failedLists.length} dersin ünite listesi yüklenemedi.
          </p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {failedLists.map(({ course, list }) => (
              <li className="flex flex-wrap items-center gap-2" key={course.id}>
                <span>
                  {course.name}: {list?.error?.message}
                </span>
                <button
                  className="text-sm font-medium text-primary underline disabled:opacity-60"
                  disabled={list?.isFetching}
                  onClick={() => list?.refetch()}
                  type="button"
                >
                  Tekrar dene
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {visible.length === 0 && loadingLists === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold">
            {rows.length === 0
              ? "Henüz ünite bulunmuyor."
              : "Bu filtrelerle eşleşen ünite bulunmuyor."}
          </h2>
          {rows.length === 0 ? null : (
            <button
              className={`${secondaryButton} mt-3`}
              onClick={() => onChange({ filters: { categories: [] }, sort })}
              type="button"
            >
              Filtreleri temizle
            </button>
          )}
        </div>
      ) : (
        groups.map((group) => (
          <section
            aria-labelledby={`publishing-group-${group.category}`}
            className="space-y-3"
            key={group.category}
          >
            <h2
              className="text-sm font-semibold"
              id={`publishing-group-${group.category}`}
            >
              {unitReadinessCategoryLabels[group.category]}
              <span className="ml-1.5 font-normal text-muted">
                ({group.rows.length})
              </span>
            </h2>
            <ul className="space-y-3">
              {group.rows.map((row) => (
                <li key={row.unit.id}>
                  <PublishingUnitCard
                    canPublish={canPublish}
                    onCheck={onCheck}
                    onPublished={onPublished}
                    row={row}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
