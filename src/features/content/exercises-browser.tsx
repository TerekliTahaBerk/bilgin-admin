"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import type {
  Course,
  ExerciseListItem,
  Unit,
  UnitExercisesData,
} from "@/contracts/admin/content";
import {
  courseScopeLabels,
  exerciseTypeLabels,
} from "@/features/content/content-labels";
import {
  courseUnitsQueryOptions,
  coursesQueryOptions,
  unitExercisesQueryOptions,
} from "@/features/content/content-queries";
import { ExerciseFilterBar } from "@/features/content/exercise-filter-bar";
import type { ExerciseFilterValues } from "@/features/content/exercise-filter-bar";
import {
  applyClientFilters,
  correctRateLabel,
  countNeedsReview,
  isEdited,
  prioritizeNeedsReview,
  topicOptions,
} from "@/features/content/exercise-list";
import { StatusBadge } from "@/features/content/status-badges";
import type { ApiError } from "@/lib/api/error";

function BackLink({ courseId }: { courseId: number }) {
  return (
    <Link
      className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-foreground"
      href={`/courses/${courseId}`}
    >
      <ChevronLeft aria-hidden="true" className="size-4" />
      Ünitelere dön
    </Link>
  );
}

function StatsLine({ exercise }: { exercise: ExerciseListItem }) {
  const { attempts, correct_rate, avg_seconds } = exercise.stats;

  // Null rate means the exercise has never been attempted — never render 0%.
  if (correct_rate === null) {
    return <span className="text-xs text-muted">Henüz çözülmedi</span>;
  }

  return (
    <span className="text-xs text-muted">
      {attempts} deneme · {correctRateLabel(correct_rate)}
      {avg_seconds === null ? null : ` · Ort. ${avg_seconds} sn`}
    </span>
  );
}

function ExerciseRow({
  canEdit,
  courseId,
  exercise,
  unitId,
}: {
  canEdit: boolean;
  courseId: number;
  exercise: ExerciseListItem;
  unitId: number;
}) {
  return (
    // Read-only: the exercise detail route arrives with the M2 editor.
    <li className="flex flex-col gap-2 px-4 py-3 sm:px-5">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{exercise.preview}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span>{exerciseTypeLabels[exercise.type]}</span>
            <span aria-hidden="true">·</span>
            <span>{exercise.topic.name}</span>
            <span aria-hidden="true">·</span>
            <span>Zorluk {exercise.difficulty}</span>
            {exercise.scopes.length === 0 ? null : (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {exercise.scopes
                    .map((scope) => courseScopeLabels[scope])
                    .join(", ")}
                </span>
              </>
            )}
            {isEdited(exercise) ? (
              <>
                <span aria-hidden="true">·</span>
                <span>Düzenlenmiş (v{exercise.version})</span>
              </>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:shrink-0 sm:justify-end">
          {exercise.stats.needs_review ? (
            <span className="inline-flex shrink-0 items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
              İnceleme gerekli
            </span>
          ) : null}
          <span className="inline-flex sm:w-24 sm:justify-end">
            <StatusBadge status={exercise.status} />
          </span>
        </div>
      </div>

      <StatsLine exercise={exercise} />
      {canEdit && exercise.type === "multiple_choice" ? (
        <div>
          <Link
            className="text-xs font-semibold text-primary hover:underline"
            href={`/courses/${courseId}/units/${unitId}/exercises/${exercise.id}`}
          >
            Düzenle
          </Link>
        </div>
      ) : null}
    </li>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="sr-only">Sorular yükleniyor.</p>
      <div className="divide-y divide-border rounded-lg border border-border bg-surface">
        {[0, 1, 2, 3].map((row) => (
          <div className="space-y-2 px-5 py-4" key={row}>
            <div className="h-3.5 w-3/4 max-w-lg rounded bg-border/70" />
            <div className="h-3 w-48 rounded bg-border/50" />
          </div>
        ))}
      </div>
    </div>
  );
}

function HeaderShell({
  courseId,
  title,
  subtitle,
}: {
  courseId: number;
  title: string;
  subtitle?: React.ReactNode;
}) {
  return (
    <header className="border-b border-border pb-5">
      <BackLink courseId={courseId} />
      <h1 className="mt-2 text-xl font-semibold tracking-tight">{title}</h1>
      {subtitle === undefined ? null : (
        <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
      )}
    </header>
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
        {isForbidden ? "Bu bölüme erişim yetkiniz yok" : "Sorular yüklenemedi"}
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

export type ExercisesBrowserProps = Readonly<{
  canEdit: boolean;
  courseId: number;
  unitId: number;
  filters: ExerciseFilterValues;
  onFiltersChange: (next: Partial<ExerciseFilterValues>) => void;
  onClearFilters: () => void;
}>;

export function ExercisesBrowser({
  canEdit,
  courseId,
  unitId,
  filters,
  onFiltersChange,
  onClearFilters,
}: ExercisesBrowserProps) {
  const router = useRouter();

  // All three queries start together; the exercise request never waits on
  // course or unit metadata.
  const coursesQuery = useQuery<Course[], ApiError>(coursesQueryOptions());
  const unitsQuery = useQuery<Unit[], ApiError>(
    courseUnitsQueryOptions(courseId),
  );
  const exercisesQuery = useQuery<UnitExercisesData, ApiError>(
    unitExercisesQueryOptions(unitId, {
      type: filters.type,
      status: filters.status,
    }),
  );

  const isSessionExpired = [
    coursesQuery.error,
    unitsQuery.error,
    exercisesQuery.error,
  ].some((error) => error?.kind === "authentication");

  useEffect(() => {
    if (isSessionExpired) {
      router.replace("/login");
      router.refresh();
    }
  }, [isSessionExpired, router]);

  const course = coursesQuery.data?.find((item) => item.id === courseId);
  const unit = unitsQuery.data?.find((item) => item.id === unitId);

  // The URL carries both ids, so a unit from another course must not render.
  const courseIsMissing = coursesQuery.isSuccess && course === undefined;
  const unitIsMissing = unitsQuery.isSuccess && unit === undefined;
  const unitMismatch =
    exercisesQuery.isSuccess && exercisesQuery.data.unit.id !== unitId;
  const notFound =
    courseIsMissing ||
    unitIsMissing ||
    unitMismatch ||
    exercisesQuery.error?.kind === "not_found";

  // Memoised so the `?? []` fallback does not produce a new array identity on
  // every render and defeat the memos below.
  const allExercises = useMemo(
    () => exercisesQuery.data?.exercises ?? [],
    [exercisesQuery.data],
  );
  const topics = useMemo(() => topicOptions(allExercises), [allExercises]);
  const visible = useMemo(
    () =>
      prioritizeNeedsReview(
        applyClientFilters(allExercises, {
          topicId: filters.topicId,
          difficulty: filters.difficulty,
        }),
      ),
    [allExercises, filters.topicId, filters.difficulty],
  );

  const hasActiveFilters =
    filters.type !== undefined ||
    filters.status !== undefined ||
    filters.topicId !== undefined ||
    filters.difficulty !== undefined;

  if (isSessionExpired) {
    return (
      <>
        <HeaderShell courseId={courseId} title="Sorular" />
        <div className="mt-6">
          <ListSkeleton />
        </div>
      </>
    );
  }

  if (notFound) {
    return (
      <>
        <HeaderShell courseId={courseId} title="Ünite bulunamadı" />
        <div className="mt-6">
          <div
            className="rounded-lg border border-border bg-surface p-6"
            role="status"
          >
            <p className="max-w-prose text-sm text-muted">
              Bu ünite kaldırılmış, adres hatalı olabilir veya bu derse ait
              değil. Ünite listesine dönmek için yukarıdaki bağlantıyı
              kullanabilirsiniz.
            </p>
          </div>
        </div>
      </>
    );
  }

  const unitTitle = exercisesQuery.data?.unit.title ?? unit?.title ?? "Sorular";
  const header = (
    <div className="relative">
      <HeaderShell
        courseId={courseId}
        subtitle={course === undefined ? undefined : course.name}
        title={unitTitle}
      />
      {canEdit ? (
        <Link
          className="mt-4 inline-flex rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white sm:absolute sm:bottom-5 sm:right-0 sm:mt-0"
          href={`/courses/${courseId}/units/${unitId}/exercises/new`}
        >
          Yeni çoktan seçmeli soru
        </Link>
      ) : null}
    </div>
  );

  function body() {
    if (exercisesQuery.isPending) {
      return <ListSkeleton />;
    }

    if (exercisesQuery.isError) {
      return (
        <ErrorState
          error={exercisesQuery.error}
          isRetrying={exercisesQuery.isFetching}
          onRetry={() => {
            void exercisesQuery.refetch();
          }}
        />
      );
    }

    return (
      <div className="space-y-4">
        <ExerciseFilterBar
          hasActiveFilters={hasActiveFilters}
          onChange={onFiltersChange}
          onClear={onClearFilters}
          topics={topics}
          values={filters}
        />

        {allExercises.length === 0 && !hasActiveFilters ? (
          <div className="rounded-lg border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold">
              Bu ünitede henüz soru bulunmuyor.
            </h2>
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold">
              Bu filtrelerle eşleşen soru bulunmuyor.
            </h2>
            <p className="mt-1.5 max-w-prose text-sm text-muted">
              Filtreleri temizleyerek tüm soruları görebilirsiniz.
            </p>
          </div>
        ) : (
          <>
            <dl
              aria-label="Soru özeti"
              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted"
            >
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">Gösterilen soru</dt>
                <dd>
                  <strong className="font-semibold text-foreground">
                    {visible.length}
                  </strong>{" "}
                  soru gösteriliyor
                </dd>
              </div>
              <span aria-hidden="true">·</span>
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">İnceleme gerektiren soru</dt>
                <dd>
                  <strong className="font-semibold text-foreground">
                    {countNeedsReview(visible)}
                  </strong>{" "}
                  inceleme gerekli
                </dd>
              </div>
            </dl>

            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {visible.map((exercise) => (
                <ExerciseRow
                  canEdit={canEdit}
                  courseId={courseId}
                  exercise={exercise}
                  key={exercise.id}
                  unitId={unitId}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      {header}
      <div className="mt-6">{body()}</div>
    </>
  );
}
