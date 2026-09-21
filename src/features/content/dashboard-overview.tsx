"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import type { Course } from "@/contracts/admin/content";
import type { SafeAdmin } from "@/contracts/admin/session";
import { coursesQueryOptions } from "@/features/content/content-queries";
import {
  isAwaitingContent,
  summarizeCourses,
} from "@/features/content/courses-summary";
import { StatusBadge } from "@/features/content/status-badges";
import type { ApiError } from "@/lib/api/error";
import { adminNavigation, filterNavigation } from "@/lib/authz/navigation";

/**
 * Every figure here comes from the `/courses` payload alone — the same
 * request `CoursesBrowser` already makes and React Query already caches
 * (`coursesQueryKey`). No extra endpoint, no waterfall.
 */

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <dd className="text-2xl font-semibold tracking-tight">{value}</dd>
      <dt className="mt-1 text-sm text-muted">{label}</dt>
    </div>
  );
}

function StatGrid({ courses }: { courses: readonly Course[] }) {
  const summary = summarizeCourses(courses);
  const awaitingCount = courses.filter(isAwaitingContent).length;

  return (
    <dl
      aria-label="Panel özeti"
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      <StatCard label="Ders" value={summary.totalCourses} />
      <StatCard label="Yayında" value={summary.publishedCourses} />
      <StatCard label="Ünite" value={summary.totalUnits} />
      <StatCard label="İçerik bekleyen ders" value={awaitingCount} />
    </dl>
  );
}

function QuickLinks({ admin }: { admin: SafeAdmin }) {
  const items = filterNavigation(adminNavigation, admin).filter(
    (item) => item.id !== "home",
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Hızlı erişim">
      <h2 className="text-sm font-semibold">Hızlı erişim</h2>
      <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium transition-colors hover:bg-surface-muted"
              href={item.href}
            >
              {item.label}
              <ArrowRight aria-hidden="true" className="size-4 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * A course needs attention when it has no units yet, or when it is sitting
 * in review waiting on a publisher. Archived and draft-with-units courses
 * are not — draft is the normal working state while content is authored.
 */
function needsAttention(course: Course): boolean {
  return isAwaitingContent(course) || course.status === "review";
}

function attentionReason(course: Course): string {
  return isAwaitingContent(course) ? "İçerik bekliyor" : "İncelemede";
}

function AttentionList({ courses }: { courses: readonly Course[] }) {
  const attention = courses.filter(needsAttention);

  if (attention.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">Dikkat gerektiren ders yok</h2>
        <p className="mt-1.5 max-w-prose text-sm text-muted">
          Tüm dersler içerikle geliyor ve incelemede bekleyen ders yok.
        </p>
      </div>
    );
  }

  return (
    <section aria-labelledby="attention-heading">
      <h2 className="text-sm font-semibold" id="attention-heading">
        Dikkat gerektirenler
        <span className="ml-2 font-normal text-muted">
          ({attention.length})
        </span>
      </h2>
      <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
        {attention.map((course) => (
          <li key={course.id}>
            <Link
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-surface-muted sm:px-5"
              href={`/courses/${course.id}`}
            >
              <span className="min-w-0 flex-1 truncate font-medium">
                {course.name}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <StatusBadge status={course.status} />
                <span className="hidden text-xs text-muted sm:inline">
                  {attentionReason(course)}
                </span>
                <ArrowRight aria-hidden="true" className="size-4 text-muted" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LoadingState() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <p className="sr-only">Panel özeti yükleniyor.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((card) => (
          <div
            className="h-20 rounded-lg border border-border bg-surface p-4"
            key={card}
          >
            <div className="h-6 w-10 rounded bg-border/70" />
            <div className="mt-2 h-3 w-16 rounded bg-border/50" />
          </div>
        ))}
      </div>
      <div className="divide-y divide-border rounded-lg border border-border bg-surface">
        {[0, 1, 2].map((row) => (
          <div className="flex items-center gap-4 px-5 py-4" key={row}>
            <div className="h-3.5 flex-1 rounded bg-border/70" />
            <div className="h-5 w-16 rounded-full bg-border/50" />
          </div>
        ))}
      </div>
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
        {isForbidden ? "Bu bölüme erişim yetkiniz yok" : "Özet yüklenemedi"}
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

export function DashboardOverview({ admin }: { admin: SafeAdmin }) {
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
      <StatGrid courses={query.data} />
      <QuickLinks admin={admin} />
      <AttentionList courses={query.data} />
    </div>
  );
}
