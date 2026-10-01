"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo } from "react";

import type { Course } from "@/contracts/admin/content";
import {
  qualityTopicOptions,
  scanCoverage,
  summarizeQuality,
} from "@/features/analytics/quality-dataset";
import { QualityFilterPanel } from "@/features/analytics/quality-filter-panel";
import {
  applyQualityFilters,
  filterToScope,
  hasListFilters,
  serializeQualityState,
  sortQualityRows,
  type QualityFilters,
  type QualitySort,
  type QualityViewState,
} from "@/features/analytics/quality-filters";
import { QualityList } from "@/features/analytics/quality-list";
import { scanTargetForScope } from "@/features/analytics/quality-scan";
import { QualityScanPanel } from "@/features/analytics/quality-scan-panel";
import {
  QualityPresetBar,
  QualitySummaryTiles,
} from "@/features/analytics/quality-summary";
import { useQualityDataset } from "@/features/analytics/use-quality-dataset";
import { useQualityScan } from "@/features/analytics/use-quality-scan";
import { coursesQueryOptions } from "@/features/content/content-queries";
import type { ApiError } from "@/lib/api/error";

const NO_COURSES: readonly Course[] = [];

function LoadingState() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-3">
      <p className="sr-only">Soru kalite verileri yükleniyor.</p>
      <div className="h-24 animate-pulse rounded-lg border border-border bg-surface" />
      <div className="h-40 animate-pulse rounded-lg border border-border bg-surface" />
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
  isRetrying,
}: {
  error: ApiError;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  const isForbidden = error.kind === "authorization";

  return (
    <div
      className="rounded-lg border border-border bg-surface p-6"
      role="alert"
    >
      <h2 className="text-sm font-semibold">
        {isForbidden ? "Bu bölüme erişim yetkiniz yok" : "Dersler yüklenemedi"}
      </h2>
      <p className="mt-1.5 max-w-prose text-sm text-muted">{error.message}</p>
      {isForbidden ? null : (
        <button
          className="mt-4 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isRetrying}
          onClick={onRetry}
          type="button"
        >
          {isRetrying ? "Deneniyor…" : "Tekrar dene"}
        </button>
      )}
    </div>
  );
}

function EmptyPanel({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children === undefined ? null : (
        <div className="mt-1.5 max-w-prose text-sm text-muted">{children}</div>
      )}
    </div>
  );
}

export type QualityCenterProps = Readonly<{
  canEdit: boolean;
  state: QualityViewState;
  onChange: (next: QualityViewState) => void;
}>;

export function QualityCenter({
  canEdit,
  state: requestedState,
  onChange,
}: QualityCenterProps) {
  const router = useRouter();
  const coursesQuery = useQuery<Course[], ApiError>(coursesQueryOptions());
  const courses = coursesQuery.data ?? NO_COURSES;

  // A course or unit id from a stale or hand-edited link that the backend
  // does not list is ignored rather than silently emptying the page.
  const requested = requestedState.filters;
  const courseId =
    requested.courseId !== undefined &&
    coursesQuery.isSuccess &&
    !courses.some((item) => item.id === requested.courseId)
      ? undefined
      : requested.courseId;

  const dataset = useQualityDataset(courses, courseId);
  const scan = useQualityScan();

  const courseUnitsForScope =
    courseId === undefined ? undefined : dataset.unitsByCourse.get(courseId);
  const unitId =
    courseId === undefined ||
    (requested.unitId !== undefined &&
      courseUnitsForScope !== undefined &&
      !courseUnitsForScope.some((item) => item.id === requested.unitId))
      ? undefined
      : requested.unitId;

  const state = useMemo<QualityViewState>(() => {
    if (courseId === requested.courseId && unitId === requested.unitId) {
      return requestedState;
    }

    const rest = Object.fromEntries(
      Object.entries(requested).filter(
        ([key]) => key !== "courseId" && key !== "unitId",
      ),
    ) as QualityFilters;

    return {
      filters: {
        ...rest,
        ...(courseId === undefined ? {} : { courseId }),
        ...(unitId === undefined ? {} : { unitId }),
      },
      sort: requestedState.sort,
    };
  }, [requestedState, requested, courseId, unitId]);
  const { filters, sort } = state;

  const isSessionExpired =
    coursesQuery.error?.kind === "authentication" ||
    scan.state.haltError?.kind === "authentication" ||
    dataset.activeCourseUnits.error?.kind === "authentication";

  useEffect(() => {
    if (isSessionExpired) {
      router.replace("/login");
      router.refresh();
    }
  }, [isSessionExpired, router]);

  const course = courses.find((item) => item.id === courseId);
  const courseUnits = courseUnitsForScope;
  const unit = courseUnits?.find((item) => item.id === unitId);

  const scopeRows = useMemo(
    () => filterToScope(dataset.rows, { courseId, unitId }),
    [dataset.rows, courseId, unitId],
  );
  const summary = useMemo(() => summarizeQuality(scopeRows), [scopeRows]);
  const topics = useMemo(() => qualityTopicOptions(scopeRows), [scopeRows]);
  const coverage = useMemo(
    () =>
      scanCoverage(courses, dataset.unitsByCourse, dataset.loadedUnitIds, {
        courseId,
        unitId,
      }),
    [courses, dataset.unitsByCourse, dataset.loadedUnitIds, courseId, unitId],
  );

  const matching = useMemo(
    () => sortQualityRows(applyQualityFilters(scopeRows, filters), sort),
    [scopeRows, filters, sort],
  );
  // Filtering thousands of rows is cheap; rendering them is not. Deferring
  // keeps the controls responsive while a large result list catches up.
  const deferredMatching = useDeferredValue(matching);

  const changeFilters = useCallback(
    (next: QualityFilters) => onChange({ filters: next, sort }),
    [onChange, sort],
  );
  const changeSort = useCallback(
    (next: QualitySort) => onChange({ filters, sort: next }),
    [onChange, filters],
  );

  const courseName = useCallback(
    (id: number) =>
      courses.find((item) => item.id === id)?.name ?? `Ders #${id}`,
    [courses],
  );

  const { start } = scan;
  const startScan = useCallback(
    ({ refresh }: { refresh: boolean }) =>
      start(
        scanTargetForScope(
          courses.map((item) => item.id),
          { courseId, unitId, unitTitle: unit?.title },
        ),
        { refresh },
      ),
    [courseId, unitId, unit, courses, start],
  );

  if (coursesQuery.isPending || isSessionExpired) {
    return <LoadingState />;
  }

  if (coursesQuery.isError) {
    return (
      <ErrorState
        error={coursesQuery.error}
        isRetrying={coursesQuery.isFetching}
        onRetry={() => {
          void coursesQuery.refetch();
        }}
      />
    );
  }

  if (courses.length === 0) {
    return (
      <EmptyPanel title="Henüz ders bulunmuyor.">
        Soru kalitesi, ders ve ünitelere soru eklendikçe burada izlenebilir.
      </EmptyPanel>
    );
  }

  const scopeLabel =
    unit !== undefined && course !== undefined
      ? `${course.name} › ${unit.title}`
      : course !== undefined
        ? course.name
        : "Tüm dersler";

  function results() {
    if (scopeRows.length === 0) {
      return (
        <EmptyPanel title="Bu kapsamda henüz yüklenmiş soru yok.">
          {coverage.totalUnits === 0
            ? "Bu kapsamda ünite bulunmuyor."
            : coverage.scannedUnits === coverage.totalUnits
              ? "Taranan ünitelerde soru bulunmuyor."
              : "Soruları görmek için yukarıdan taramayı başlatın."}
        </EmptyPanel>
      );
    }

    // The empty state follows the current filters, not the deferred list, so
    // it never flashes while a large result is still catching up.
    if (matching.length === 0) {
      return (
        <EmptyPanel title="Bu filtrelerle eşleşen soru bulunmuyor.">
          <p>Filtreleri gevşeterek veya temizleyerek tekrar deneyin.</p>
          {hasListFilters(filters) ? (
            <button
              className="mt-3 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
              onClick={() =>
                changeFilters({
                  ...(courseId === undefined ? {} : { courseId }),
                  ...(unitId === undefined ? {} : { unitId }),
                })
              }
              type="button"
            >
              Liste filtrelerini temizle
            </button>
          ) : null}
        </EmptyPanel>
      );
    }

    return (
      <QualityList
        canEdit={canEdit}
        isUpdating={deferredMatching !== matching}
        // A new view starts again from the first page.
        key={serializeQualityState(state)}
        onSortChange={changeSort}
        // A deferred list that is still empty would flash "0 soru" while
        // the current filters already match rows; show those instead.
        rows={deferredMatching.length === 0 ? matching : deferredMatching}
        sort={sort}
      />
    );
  }

  return (
    <div className="space-y-6">
      <QualityScanPanel
        courseName={courseName}
        coverage={coverage}
        loadedQuestions={scopeRows.length}
        onCancel={scan.cancel}
        onRetryFailures={scan.retryFailures}
        onScan={startScan}
        scopeLabel={scopeLabel}
        state={scan.state}
      />

      <QualitySummaryTiles
        onChange={onChange}
        state={state}
        summary={summary}
      />

      <section aria-labelledby="quality-views-heading" className="space-y-3">
        <h2 className="text-sm font-semibold" id="quality-views-heading">
          Hazır görünümler
        </h2>
        <QualityPresetBar onChange={onChange} state={state} />
      </section>

      <QualityFilterPanel
        courses={courses}
        filters={filters}
        onChange={changeFilters}
        topics={topics}
        units={courseUnits}
        unitsError={dataset.activeCourseUnits.error}
        unitsPending={dataset.activeCourseUnits.isPending}
      />

      {results()}
    </div>
  );
}
