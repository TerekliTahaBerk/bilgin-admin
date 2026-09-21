"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import type { Course } from "@/contracts/admin/content";
import { ExportCsvButton } from "@/components/export-csv-button";
import { coursesQueryOptions } from "@/features/content/content-queries";
import { courseScopeLabels, publishStatusLabels } from "@/features/content/content-labels";
import { StatusBadge } from "@/features/content/status-badges";
import {
  groupCoursesByScope,
  isAwaitingContent,
  summarizeCourses,
} from "@/features/content/courses-summary";
import type { ApiError } from "@/lib/api/error";
import type { CsvColumn } from "@/lib/export/csv";

const COURSE_CSV_COLUMNS: readonly CsvColumn<Course>[] = [
  { header: "Kod", value: (course) => course.code },
  { header: "Ad", value: (course) => course.name },
  { header: "Kapsam", value: (course) => courseScopeLabels[course.scope] },
  { header: "Durum", value: (course) => publishStatusLabels[course.status] },
  { header: "Ünite Sayısı", value: (course) => course.unit_count },
];

function SummaryStrip({ courses }: { courses: readonly Course[] }) {
  const summary = summarizeCourses(courses);

  return (
    <dl
      aria-label="Ders özeti"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted"
    >
      <div className="flex items-center gap-1.5">
        <dt className="sr-only">Toplam ders</dt>
        <dd>
          <strong className="font-semibold text-foreground">
            {summary.totalCourses}
          </strong>{" "}
          ders
        </dd>
      </div>
      <span aria-hidden="true">·</span>
      <div className="flex items-center gap-1.5">
        <dt className="sr-only">Yayındaki ders</dt>
        <dd>
          <strong className="font-semibold text-foreground">
            {summary.publishedCourses}
          </strong>{" "}
          yayında
        </dd>
      </div>
      <span aria-hidden="true">·</span>
      <div className="flex items-center gap-1.5">
        <dt className="sr-only">Toplam ünite</dt>
        <dd>
          <strong className="font-semibold text-foreground">
            {summary.totalUnits}
          </strong>{" "}
          ünite
        </dd>
      </div>
    </dl>
  );
}

function CourseRow({ course }: { course: Course }) {
  const awaiting = isAwaitingContent(course);

  return (
    <li>
      {/* The unit list route exists now, so the whole row is a real link. */}
      <Link
        className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-surface-muted sm:flex-row sm:items-center sm:gap-4 sm:px-5"
        href={`/courses/${course.id}`}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{course.name}</p>
          <p className="truncate font-mono text-xs text-muted">{course.code}</p>
        </div>

        {/* Fixed columns from sm up so badges and counts line up down the list
            instead of tracking each row's text width. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:shrink-0 sm:justify-end">
          <span className="inline-flex sm:w-24">
            <StatusBadge status={course.status} />
          </span>
          <span className="inline-block text-xs text-muted sm:w-28 sm:text-right">
            {awaiting ? "İçerik bekliyor" : `${course.unit_count} ünite`}
          </span>
          <ChevronRight
            aria-hidden="true"
            className="hidden size-4 shrink-0 text-muted sm:block"
          />
        </div>
      </Link>
    </li>
  );
}

function ScopeGroup({
  label,
  courses,
}: {
  label: string;
  courses: readonly Course[];
}) {
  const headingId = `scope-${label.toLowerCase()}`;

  return (
    <section aria-labelledby={headingId}>
      <h2 className="text-sm font-semibold tracking-wide" id={headingId}>
        {label}
        <span className="ml-2 font-normal text-muted">
          ({courses.length} ders)
        </span>
      </h2>
      <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
        {courses.map((course) => (
          <CourseRow course={course} key={course.id} />
        ))}
      </ul>
    </section>
  );
}

function LoadingState() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <p className="sr-only">Dersler yükleniyor.</p>
      {[0, 1].map((group) => (
        <div key={group}>
          <div className="h-4 w-16 rounded bg-border/70" />
          <div className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
            {[0, 1, 2].map((row) => (
              <div className="flex items-center gap-4 px-5 py-4" key={row}>
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-48 max-w-full rounded bg-border/70" />
                  <div className="h-3 w-24 rounded bg-border/50" />
                </div>
                <div className="h-5 w-16 rounded-full bg-border/50" />
              </div>
            ))}
          </div>
        </div>
      ))}
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

function EmptyState() {
  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold">Henüz ders bulunmuyor.</h2>
      <p className="mt-1.5 max-w-prose text-sm text-muted">
        Ders kataloğu backend tarafından beslenir.
      </p>
    </div>
  );
}

export function CoursesBrowser() {
  const router = useRouter();
  const query = useQuery<Course[], ApiError>(coursesQueryOptions());

  const isSessionExpired = query.error?.kind === "authentication";

  // A rejected session is not an error state to render: the session is gone.
  useEffect(() => {
    if (isSessionExpired) {
      router.replace("/login");
      router.refresh();
    }
  }, [isSessionExpired, router]);

  if (query.isPending || isSessionExpired) {
    return <LoadingState />;
  }

  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        isRetrying={query.isFetching}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }

  if (query.data.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SummaryStrip courses={query.data} />
        <ExportCsvButton
          columns={COURSE_CSV_COLUMNS}
          filename="dersler.csv"
          rows={query.data}
        />
      </div>
      {groupCoursesByScope(query.data).map((group) => (
        <ScopeGroup
          courses={group.courses}
          key={group.scope}
          label={group.label}
        />
      ))}
    </div>
  );
}
