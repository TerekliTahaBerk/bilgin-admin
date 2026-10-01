"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useState } from "react";

import {
  courseScopes,
  exerciseTypes,
  type Course,
  type Unit,
} from "@/contracts/admin/content";
import {
  qualityTopicOptions,
  scanCoverage,
  type QualityRow,
} from "@/features/analytics/quality-dataset";
import { exerciseHref, unitHref } from "@/features/analytics/quality-list";
import { scanTargetForScope } from "@/features/analytics/quality-scan";
import { QualityScanPanel } from "@/features/analytics/quality-scan-panel";
import {
  applyUnattemptedFilters,
  hasUnattemptedListFilters,
  POSSIBLE_CAUSES,
  rowObservations,
  segmentCounts,
  unattemptedInScope,
  unattemptedSegmentLabels,
  unattemptedSegments,
  type UnattemptedState,
} from "@/features/analytics/unattempted-queue";
import { useQualityDataset } from "@/features/analytics/use-quality-dataset";
import { useQualityScan } from "@/features/analytics/use-quality-scan";
import {
  courseScopeLabels,
  exerciseTypeLabels,
} from "@/features/content/content-labels";
import { coursesQueryOptions } from "@/features/content/content-queries";
import { StatusBadge } from "@/features/content/status-badges";
import type { ApiError } from "@/lib/api/error";

/** Rows rendered per step; the rest wait behind "Daha fazla göster". */
export const UNATTEMPTED_PAGE_SIZE = 50;

const NO_COURSES: readonly Course[] = [];
const fieldClass =
  "mt-1 block w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm";
const secondaryButton =
  "rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60";

function Select({
  label,
  value,
  onChange,
  children,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const id = useId();

  return (
    <div>
      <label className="text-xs font-medium" htmlFor={id}>
        {label}
      </label>
      <select
        className={fieldClass}
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    </div>
  );
}

const toNumber = (value: string) => (value === "" ? undefined : Number(value));

function Filters({
  state,
  onChange,
  courses,
  units,
  topics,
}: {
  state: UnattemptedState;
  onChange: (next: UnattemptedState) => void;
  courses: readonly Course[];
  units: readonly Unit[] | undefined;
  topics: ReturnType<typeof qualityTopicOptions>;
}) {
  const hasFilters =
    state.courseId !== undefined || hasUnattemptedListFilters(state);

  return (
    <section
      aria-labelledby="unattempted-filters-heading"
      className="space-y-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold" id="unattempted-filters-heading">
          Filtreler
        </h2>
        {hasFilters ? (
          <button
            className={secondaryButton}
            onClick={() => onChange({ segment: state.segment })}
            type="button"
          >
            Filtreleri temizle
          </button>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Select
          label="Ders"
          onChange={(value) =>
            // Units and topics belong to a course: a new course drops both.
            onChange({
              ...state,
              courseId: toNumber(value),
              unitId: undefined,
              topicId: undefined,
            })
          }
          value={state.courseId === undefined ? "" : String(state.courseId)}
        >
          <option value="">Tüm dersler</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}
            </option>
          ))}
        </Select>
        <Select
          disabled={state.courseId === undefined || units === undefined}
          label="Ünite"
          onChange={(value) => onChange({ ...state, unitId: toNumber(value) })}
          value={state.unitId === undefined ? "" : String(state.unitId)}
        >
          <option value="">
            {state.courseId === undefined ? "Ders seçin" : "Tüm üniteler"}
          </option>
          {(units ?? []).map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.title}
            </option>
          ))}
        </Select>
        <Select
          label="Konu"
          onChange={(value) => onChange({ ...state, topicId: toNumber(value) })}
          value={state.topicId === undefined ? "" : String(state.topicId)}
        >
          <option value="">Tüm konular</option>
          {topics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.name}
            </option>
          ))}
        </Select>
        <Select
          label="Soru tipi"
          onChange={(value) =>
            onChange({
              ...state,
              type: exerciseTypes.find((type) => type === value),
            })
          }
          value={state.type ?? ""}
        >
          <option value="">Tümü</option>
          {exerciseTypes.map((type) => (
            <option key={type} value={type}>
              {exerciseTypeLabels[type]}
            </option>
          ))}
        </Select>
        <Select
          label="Zorluk"
          onChange={(value) =>
            onChange({
              ...state,
              difficulty: ([1, 2, 3, 4, 5] as const).find(
                (level) => String(level) === value,
              ),
            })
          }
          value={state.difficulty === undefined ? "" : String(state.difficulty)}
        >
          <option value="">Tümü</option>
          {[1, 2, 3, 4, 5].map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </Select>
        <Select
          label="Kapsam (sınav)"
          onChange={(value) =>
            onChange({
              ...state,
              scope: courseScopes.find((scope) => scope === value),
            })
          }
          value={state.scope ?? ""}
        >
          <option value="">Tümü</option>
          {courseScopes.map((scope) => (
            <option key={scope} value={scope}>
              {courseScopeLabels[scope]}
            </option>
          ))}
        </Select>
      </div>
    </section>
  );
}

function PossibleCauses() {
  return (
    <details className="rounded-lg border border-border bg-surface p-4 text-sm">
      <summary className="cursor-pointer font-medium">
        Olası nedenler (kesin teşhis değil)
      </summary>
      <p className="mt-2 max-w-prose text-muted">
        Hiç çözülmemiş olmak bir hata değildir; yalnızca kullanım verisi
        olmadığı anlamına gelir. Aşağıdakiler kontrol edilebilecek
        olasılıklardır, bu ekran hangisinin geçerli olduğunu veriden çıkaramaz.
      </p>
      <ul className="mt-2 max-w-prose list-disc space-y-1.5 pl-5">
        {POSSIBLE_CAUSES.map((cause) => (
          <li key={cause.title}>
            <span className="font-medium">{cause.title}.</span>{" "}
            <span className="text-muted">{cause.detail}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function QueueRow({
  row,
  course,
  unit,
  canEdit,
}: {
  row: QualityRow;
  course: Course | undefined;
  unit: Unit | undefined;
  canEdit: boolean;
}) {
  const editHref = exerciseHref(row, canEdit);
  const opensEditor = editHref !== unitHref(row);
  const observations = rowObservations(row, course, unit);

  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:px-5">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium break-words">
            {row.preview.trim() === "" ? `Soru #${row.id}` : row.preview}
          </p>
          <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <div className="flex gap-1">
              <dt className="text-muted">Ünite:</dt>
              <dd>
                {row.course.name} › {row.unit.title}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-muted">Konu:</dt>
              <dd>{row.topic.name}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-muted">Zorluk:</dt>
              <dd>{row.difficulty}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-muted">Kapsam:</dt>
              <dd>
                {row.scopes.length === 0
                  ? "—"
                  : row.scopes
                      .map((scope) => courseScopeLabels[scope])
                      .join(", ")}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-muted">Sürüm:</dt>
              <dd>{row.version}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-muted">Tip:</dt>
              <dd>{exerciseTypeLabels[row.type]}</dd>
            </div>
          </dl>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
          <span className="inline-flex items-center rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted">
            Kullanım verisi yok
          </span>
          <StatusBadge status={row.status} />
        </div>
      </div>

      {observations.length === 0 ? null : (
        <ul className="space-y-0.5 text-xs text-amber-800">
          {observations.map((note) => (
            <li key={note}>Veride görülen: {note}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link
          aria-label={`${opensEditor ? "Soruyu düzenle" : "Soruyu ünitede görüntüle"}: #${row.id}`}
          className="text-xs font-semibold text-primary hover:underline"
          href={editHref}
        >
          {opensEditor ? "Editörde aç" : "Ünitede görüntüle"}
        </Link>
        <Link
          className="text-xs font-semibold text-primary hover:underline"
          href={`${unitHref(row)}#unit-readiness-heading`}
        >
          Ünite hazırlığına git
        </Link>
      </div>
    </li>
  );
}

export type UnattemptedCenterProps = Readonly<{
  canEdit: boolean;
  state: UnattemptedState;
  onChange: (next: UnattemptedState) => void;
}>;

/**
 * Hiç çözülmemiş sorular: questions whose backend `attempts` is 0, among the
 * loaded ones (cache + full-scan snapshot, the Quality Center's data). Never
 * labelled as faulty — the absence of usage data is all the data says.
 */
export function UnattemptedCenter({
  canEdit,
  state: requested,
  onChange,
}: UnattemptedCenterProps) {
  const router = useRouter();
  const coursesQuery = useQuery<Course[], ApiError>(coursesQueryOptions());
  const courses = coursesQuery.data ?? NO_COURSES;

  // Ids from a stale or hand-edited link that the backend does not list are
  // ignored rather than silently emptying the page.
  const courseId =
    requested.courseId !== undefined &&
    coursesQuery.isSuccess &&
    !courses.some((course) => course.id === requested.courseId)
      ? undefined
      : requested.courseId;

  const dataset = useQualityDataset(courses, courseId);
  const scan = useQualityScan();
  const units =
    courseId === undefined ? undefined : dataset.unitsByCourse.get(courseId);
  const unitId =
    courseId === undefined ||
    (requested.unitId !== undefined &&
      units !== undefined &&
      !units.some((unit) => unit.id === requested.unitId))
      ? undefined
      : requested.unitId;
  const state = useMemo(
    () => ({ ...requested, courseId, unitId }),
    [requested, courseId, unitId],
  );

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

  const inScope = useMemo(
    () => unattemptedInScope(dataset.rows, state),
    [dataset.rows, state],
  );
  const counts = useMemo(() => segmentCounts(inScope), [inScope]);
  const topics = useMemo(() => qualityTopicOptions(inScope), [inScope]);
  const matching = useMemo(
    () => applyUnattemptedFilters(inScope, state),
    [inScope, state],
  );
  const loadedInScope = useMemo(
    () =>
      dataset.rows.filter(
        (row) =>
          (courseId === undefined || row.course.id === courseId) &&
          (unitId === undefined || row.unit.id === unitId),
      ).length,
    [dataset.rows, courseId, unitId],
  );
  const coverage = useMemo(
    () =>
      scanCoverage(courses, dataset.unitsByCourse, dataset.loadedUnitIds, {
        courseId,
        unitId,
      }),
    [courses, dataset.unitsByCourse, dataset.loadedUnitIds, courseId, unitId],
  );

  const [visibleCount, setVisibleCount] = useState(UNATTEMPTED_PAGE_SIZE);
  const [pageKey, setPageKey] = useState("");
  const currentKey = JSON.stringify(state);
  // A new view starts again from the first page.
  if (pageKey !== currentKey) {
    setPageKey(currentKey);
    setVisibleCount(UNATTEMPTED_PAGE_SIZE);
  }

  const courseById = useMemo(
    () => new Map(courses.map((course) => [course.id, course])),
    [courses],
  );
  const courseName = useCallback(
    (id: number) => courseById.get(id)?.name ?? `Ders #${id}`,
    [courseById],
  );
  const unitOf = useCallback(
    (row: QualityRow) =>
      dataset.unitsByCourse
        .get(row.course.id)
        ?.find((unit) => unit.id === row.unit.id),
    [dataset.unitsByCourse],
  );

  const { start } = scan;
  const unit = units?.find((item) => item.id === unitId);
  const startScan = useCallback(
    ({ refresh }: { refresh: boolean }) =>
      start(
        scanTargetForScope(
          courses.map((course) => course.id),
          { courseId, unitId, unitTitle: unit?.title },
        ),
        { refresh },
      ),
    [courses, courseId, unitId, unit, start],
  );

  if (coursesQuery.isPending || isSessionExpired) {
    return (
      <div aria-busy="true" aria-live="polite" className="space-y-3">
        <p className="sr-only">Sorular yükleniyor.</p>
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
        <p className="mt-1.5 text-sm text-muted">
          {coursesQuery.error.message}
        </p>
        {isForbidden ? null : (
          <button
            className={`${secondaryButton} mt-4`}
            disabled={coursesQuery.isFetching}
            onClick={() => void coursesQuery.refetch()}
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
      </div>
    );
  }

  const course = courseId === undefined ? undefined : courseById.get(courseId);
  const scopeLabel =
    unit !== undefined && course !== undefined
      ? `${course.name} › ${unit.title}`
      : (course?.name ?? "Tüm dersler");
  const shown = matching.slice(0, visibleCount);

  function results() {
    if (loadedInScope === 0) {
      return (
        <div className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold">
            Bu kapsamda henüz yüklenmiş soru yok.
          </h2>
          <p className="mt-1.5 max-w-prose text-sm text-muted">
            {coverage.totalUnits === 0
              ? "Bu kapsamda ünite bulunmuyor."
              : "Hangi soruların hiç çözülmediğini görmek için yukarıdan taramayı başlatın."}
          </p>
        </div>
      );
    }

    if (matching.length === 0) {
      return (
        <div className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold">
            {hasUnattemptedListFilters(state)
              ? "Bu filtrelerle eşleşen, hiç çözülmemiş soru yok."
              : `Yüklenen sorular arasında bu segmentte hiç çözülmemiş soru yok.`}
          </h2>
          {coverage.scannedUnits < coverage.totalUnits ? (
            <p className="mt-1.5 text-sm text-muted">
              Kapsamdaki ünitelerin hepsi taranmadı; taranmayanlarda olabilir.
            </p>
          ) : null}
        </div>
      );
    }

    return (
      <section aria-labelledby="unattempted-list-heading" className="space-y-3">
        <h2 className="text-sm font-semibold" id="unattempted-list-heading">
          {unattemptedSegmentLabels[state.segment]}{" "}
          <span className="font-normal text-muted">
            · {matching.length} soru
          </span>
        </h2>
        <ul
          aria-label="Hiç çözülmemiş sorular"
          className="divide-y divide-border rounded-lg border border-border bg-surface"
        >
          {shown.map((row) => (
            <QueueRow
              canEdit={canEdit}
              course={courseById.get(row.course.id)}
              key={row.id}
              row={row}
              unit={unitOf(row)}
            />
          ))}
        </ul>
        {matching.length > shown.length ? (
          <button
            className={secondaryButton}
            onClick={() =>
              setVisibleCount((count) => count + UNATTEMPTED_PAGE_SIZE)
            }
            type="button"
          >
            Daha fazla göster ({matching.length - shown.length} kaldı)
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <QualityScanPanel
        courseName={courseName}
        coverage={coverage}
        loadedQuestions={loadedInScope}
        onCancel={scan.cancel}
        onRetryFailures={scan.retryFailures}
        onScan={startScan}
        scopeLabel={scopeLabel}
        state={scan.state}
      />

      <section
        aria-labelledby="unattempted-segments-heading"
        className="space-y-3"
      >
        <h2 className="text-sm font-semibold" id="unattempted-segments-heading">
          Segment
        </h2>
        <div
          aria-label="Segment"
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          role="group"
        >
          {unattemptedSegments.map((segment) => {
            const active = segment === state.segment;
            const highlight = segment === "published";
            return (
              <button
                aria-pressed={active}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  active
                    ? "border-primary bg-primary-soft"
                    : highlight
                      ? "border-amber-200 bg-amber-50 hover:bg-amber-100/60"
                      : "border-border bg-surface hover:bg-surface-muted"
                }`}
                key={segment}
                onClick={() => onChange({ ...state, segment })}
                type="button"
              >
                <span className="block text-2xl font-semibold tabular-nums">
                  {counts[segment]}
                </span>
                <span className="mt-0.5 block text-sm text-muted">
                  {unattemptedSegmentLabels[segment]}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted">
          Sayılar yalnızca yüklenen sorulardan hesaplanır (kapsamda{" "}
          {loadedInScope} soru, {coverage.scannedUnits}/{coverage.totalUnits}{" "}
          ünite tarandı). &quot;Hiç çözülmemiş&quot; backend&apos;in deneme
          sayısının 0 olması demektir; soru hakkında bir hata yargısı değildir.
        </p>
      </section>

      {state.segment === "published" ? <PossibleCauses /> : null}

      <Filters
        courses={courses}
        onChange={onChange}
        state={state}
        topics={topics}
        units={units}
      />

      {results()}
    </div>
  );
}
