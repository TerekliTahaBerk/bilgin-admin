"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import type { Course, Unit } from "@/contracts/admin/content";
import {
  courseScopeLabels,
  gradeLevelLabel,
} from "@/features/content/content-labels";
import {
  courseUnitsQueryOptions,
  coursesQueryOptions,
} from "@/features/content/content-queries";
import { AccessBadge, StatusBadge } from "@/features/content/status-badges";
import {
  isAwaitingExercises,
  summarizeUnits,
} from "@/features/content/units-summary";
import type { ApiError } from "@/lib/api/error";

function BackLink() {
  return (
    <Link
      className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-foreground"
      href="/courses"
    >
      <ChevronLeft aria-hidden="true" className="size-4" />
      Derslere dön
    </Link>
  );
}

function SummaryStrip({ units }: { units: readonly Unit[] }) {
  const summary = summarizeUnits(units);

  const entries: readonly [string, number, string][] = [
    ["Toplam ünite", summary.totalUnits, "ünite"],
    ["Yayındaki ünite", summary.publishedUnits, "yayında"],
    ["Toplam adım", summary.totalNodes, "adım"],
    ["Toplam soru", summary.totalExercises, "soru"],
  ];

  return (
    <dl
      aria-label="Ünite özeti"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted"
    >
      {entries.map(([term, value, suffix], index) => (
        <div className="flex items-center gap-1.5" key={term}>
          {index === 0 ? null : (
            <span aria-hidden="true" className="mr-1.5">
              ·
            </span>
          )}
          <dt className="sr-only">{term}</dt>
          <dd>
            <strong className="font-semibold text-foreground">{value}</strong>{" "}
            {suffix}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function UnitRow({ unit }: { unit: Unit }) {
  const grade = gradeLevelLabel(unit.grade_level);

  return (
    // Not a link and not a button: the exercise list route does not exist yet.
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{unit.title}</p>
        <p className="truncate text-xs text-muted">
          {grade === null ? null : <span>{grade} · </span>}
          <span>{unit.node_count} adım</span>
          <span>
            {" · "}
            {isAwaitingExercises(unit)
              ? "Soru bekliyor"
              : `${unit.exercise_count} soru`}
          </span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:shrink-0 sm:justify-end">
        <span className="inline-flex sm:w-24">
          <StatusBadge status={unit.status} />
        </span>
        <span className="inline-flex sm:w-24 sm:justify-end">
          <AccessBadge access={unit.access} />
        </span>
      </div>
    </li>
  );
}

function CourseHeader({ course }: { course: Course }) {
  return (
    <header className="border-b border-border pb-5">
      <BackLink />
      <h1 className="mt-2 text-xl font-semibold tracking-tight">
        {course.name}
      </h1>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <span className="font-mono text-xs">{course.code}</span>
        <span aria-hidden="true">·</span>
        <span>{courseScopeLabels[course.scope]}</span>
        <StatusBadge status={course.status} />
      </p>
    </header>
  );
}

function HeaderFallback({ title }: { title: string }) {
  return (
    <header className="border-b border-border pb-5">
      <BackLink />
      <h1 className="mt-2 text-xl font-semibold tracking-tight">{title}</h1>
    </header>
  );
}

function HeaderSkeleton() {
  return (
    <header className="border-b border-border pb-5">
      <BackLink />
      <div className="mt-3 h-6 w-64 max-w-full rounded bg-border/70" />
      <div className="mt-2 h-3.5 w-40 rounded bg-border/50" />
    </header>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="sr-only">Üniteler yükleniyor.</p>
      <div className="divide-y divide-border rounded-lg border border-border bg-surface">
        {[0, 1, 2].map((row) => (
          <div className="flex items-center gap-4 px-5 py-4" key={row}>
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-56 max-w-full rounded bg-border/70" />
              <div className="h-3 w-32 rounded bg-border/50" />
            </div>
            <div className="h-5 w-16 rounded-full bg-border/50" />
          </div>
        ))}
      </div>
    </div>
  );
}

function NotFoundState() {
  // The heading already says it; this only explains and points back.
  return (
    <div
      className="rounded-lg border border-border bg-surface p-6"
      role="status"
    >
      <p className="max-w-prose text-sm text-muted">
        Bu ders kaldırılmış veya adres hatalı olabilir. Ders listesine dönmek
        için yukarıdaki bağlantıyı kullanabilirsiniz.
      </p>
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
        {isForbidden ? "Bu bölüme erişim yetkiniz yok" : "Üniteler yüklenemedi"}
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

function EmptyState() {
  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold">
        Bu derste henüz ünite bulunmuyor.
      </h2>
      <p className="mt-1.5 max-w-prose text-sm text-muted">
        Üniteler backend tarafından oluşturulur.
      </p>
    </div>
  );
}

export function UnitsBrowser({ courseId }: { courseId: number }) {
  const router = useRouter();

  // Both queries start together: the unit list never waits for course metadata,
  // and on arrival from /courses the course list is usually already cached.
  const coursesQuery = useQuery<Course[], ApiError>(coursesQueryOptions());
  const unitsQuery = useQuery<Unit[], ApiError>(
    courseUnitsQueryOptions(courseId),
  );

  const isSessionExpired =
    unitsQuery.error?.kind === "authentication" ||
    coursesQuery.error?.kind === "authentication";

  useEffect(() => {
    if (isSessionExpired) {
      router.replace("/login");
      router.refresh();
    }
  }, [isSessionExpired, router]);

  const course = coursesQuery.data?.find((item) => item.id === courseId);
  const courseIsMissing = coursesQuery.isSuccess && course === undefined;
  const unitsNotFound = unitsQuery.error?.kind === "not_found";

  if (isSessionExpired) {
    return (
      <>
        <HeaderSkeleton />
        <div className="mt-6">
          <ListSkeleton />
        </div>
      </>
    );
  }

  // A 404 from the units endpoint wins over a cached course entry: showing the
  // course name above a "not found" body would contradict itself.
  const header =
    unitsNotFound || courseIsMissing ? (
      <HeaderFallback title="Ders bulunamadı" />
    ) : course !== undefined ? (
      <CourseHeader course={course} />
    ) : coursesQuery.isPending ? (
      <HeaderSkeleton />
    ) : (
      <HeaderFallback title="Ders" />
    );

  function body() {
    if (unitsNotFound || courseIsMissing) {
      return <NotFoundState />;
    }

    if (unitsQuery.isPending) {
      return <ListSkeleton />;
    }

    if (unitsQuery.isError) {
      return (
        <ErrorState
          error={unitsQuery.error}
          isRetrying={unitsQuery.isFetching}
          onRetry={() => {
            void unitsQuery.refetch();
          }}
        />
      );
    }

    if (unitsQuery.data.length === 0) {
      return <EmptyState />;
    }

    return (
      <div className="space-y-4">
        <SummaryStrip units={unitsQuery.data} />
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {unitsQuery.data.map((unit) => (
            <UnitRow key={unit.id} unit={unit} />
          ))}
        </ul>
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
