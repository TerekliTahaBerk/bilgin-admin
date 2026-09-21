"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { Course, Unit } from "@/contracts/admin/content";
import type { SafeAdmin } from "@/contracts/admin/session";
import type { AdminAccountsData } from "@/contracts/admin/workflows";
import {
  adminCountByRole,
  countByPublishStatus,
  courseCountByScope,
  courseUnitCounts,
  summarizeAdminRoster,
  unitExerciseCounts,
} from "@/features/analytics/analytics-aggregations";
import { AttentionPanel } from "@/features/analytics/attention-panel";
import { BarList } from "@/features/analytics/bar-list";
import {
  coursesQueryOptions,
  courseUnitsQueryOptions,
} from "@/features/content/content-queries";
import { getAdminAccounts } from "@/features/workflows/workflow-client";
import type { ApiError } from "@/lib/api/error";
import { can } from "@/lib/authz/abilities";

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <dd className="text-2xl font-semibold tracking-tight">{value}</dd>
      <dt className="mt-1 text-sm text-muted">{label}</dt>
    </div>
  );
}

function SectionErrorState({
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
      className="rounded-lg border border-border bg-surface p-4"
      role="alert"
    >
      <p className="text-sm font-medium">
        {isForbidden ? "Bu bölüme erişim yetkiniz yok" : "Veri yüklenemedi"}
      </p>
      <p className="mt-1 text-sm text-muted">{error.message}</p>
      {isForbidden ? null : (
        <button
          className="mt-3 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
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

function SectionLoadingState() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="h-40 animate-pulse rounded-lg border border-border bg-surface"
    >
      <span className="sr-only">Yükleniyor.</span>
    </div>
  );
}

/**
 * Everything in this row comes from the `/courses` payload — the same
 * request the dashboard and courses browser already cache. No extra fetch.
 */
function ContentOverview({ courses }: { courses: readonly Course[] }) {
  const totalUnits = courses.reduce(
    (total, course) => total + course.unit_count,
    0,
  );

  return (
    <section aria-labelledby="content-overview-heading" className="space-y-3">
      <h2 className="text-sm font-semibold" id="content-overview-heading">
        İçerik genel bakış
      </h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Toplam ders" value={courses.length} />
        <StatTile
          label="Yayında"
          value={
            courses.filter((course) => course.status === "published").length
          }
        />
        <StatTile label="Toplam ünite" value={totalUnits} />
      </dl>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <BarList
          entries={courseCountByScope(courses)}
          title="Scope'a göre ders sayısı"
          valueLabel="ders"
        />
        <BarList
          entries={countByPublishStatus(courses)}
          title="Ders yayın durumu dağılımı"
          valueLabel="ders"
        />
      </div>
      <BarList
        entries={courseUnitCounts(courses)}
        title="Derse göre ünite sayısı"
        valueLabel="ünite"
      />
    </section>
  );
}

/**
 * Drills into one course at a time — units are fetched only for the selected
 * course, the same request the course detail page already makes and caches
 * under the same key. Selecting every course at once would be a request
 * waterfall; this page never does that.
 */
function CourseDrilldown({ courses }: { courses: readonly Course[] }) {
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(
    courses[0]?.id ?? null,
  );

  const unitsQuery = useQuery<Unit[], ApiError>({
    ...courseUnitsQueryOptions(selectedCourseId ?? 0),
    enabled: selectedCourseId !== null,
  });

  if (courses.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="course-drilldown-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold" id="course-drilldown-heading">
          Ünite detayı
        </h2>
        <select
          aria-label="Ders seç"
          className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm"
          onChange={(event) => {
            setSelectedCourseId(Number(event.target.value));
          }}
          value={selectedCourseId ?? ""}
        >
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}
            </option>
          ))}
        </select>
      </div>

      {unitsQuery.isPending ? <SectionLoadingState /> : null}

      {unitsQuery.isError ? (
        <SectionErrorState
          error={unitsQuery.error}
          isRetrying={unitsQuery.isFetching}
          onRetry={() => {
            void unitsQuery.refetch();
          }}
        />
      ) : null}

      {unitsQuery.isSuccess ? (
        unitsQuery.data.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-sm text-muted">Bu derste henüz ünite yok.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <BarList
              entries={countByPublishStatus(unitsQuery.data)}
              title="Ünite yayın durumu dağılımı"
              valueLabel="ünite"
            />
            <BarList
              entries={unitExerciseCounts(unitsQuery.data)}
              title="Üniteye göre soru sayısı"
              valueLabel="soru"
            />
          </div>
        )
      ) : null}
    </section>
  );
}

/** Gated behind `edit_curriculum` — the same ability that gates the Admins page. */
function AdminRoster() {
  const query = useQuery<AdminAccountsData, ApiError>({
    queryKey: ["admins"],
    queryFn: getAdminAccounts,
  });

  return (
    <section aria-labelledby="admin-roster-heading" className="space-y-3">
      <h2 className="text-sm font-semibold" id="admin-roster-heading">
        Yönetici özeti
      </h2>

      {query.isPending ? <SectionLoadingState /> : null}

      {query.isError ? (
        <SectionErrorState
          error={query.error}
          isRetrying={query.isFetching}
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : null}

      {query.isSuccess
        ? (() => {
            const summary = summarizeAdminRoster(query.data.admins);

            return (
              <>
                <dl className="grid grid-cols-3 gap-3">
                  <StatTile label="Toplam yönetici" value={summary.total} />
                  <StatTile label="Aktif" value={summary.active} />
                  <StatTile label="Pasif" value={summary.inactive} />
                </dl>
                <BarList
                  entries={adminCountByRole(query.data)}
                  title="Role göre yönetici sayısı"
                  valueLabel="yönetici"
                />
              </>
            );
          })()
        : null}
    </section>
  );
}

export function AnalyticsDashboard({ admin }: { admin: SafeAdmin }) {
  const router = useRouter();
  const coursesQuery = useQuery<Course[], ApiError>(coursesQueryOptions());

  const isSessionExpired = coursesQuery.error?.kind === "authentication";

  useEffect(() => {
    if (isSessionExpired) {
      router.replace("/login");
      router.refresh();
    }
  }, [isSessionExpired, router]);

  if (coursesQuery.isPending || isSessionExpired) {
    return <SectionLoadingState />;
  }

  if (coursesQuery.isError) {
    return (
      <SectionErrorState
        error={coursesQuery.error}
        isRetrying={coursesQuery.isFetching}
        onRetry={() => {
          void coursesQuery.refetch();
        }}
      />
    );
  }

  if (coursesQuery.data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">Henüz ders bulunmuyor.</h2>
        <p className="mt-1.5 max-w-prose text-sm text-muted">
          Grafikler ders kataloğu doldukça görünür.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AttentionPanel />
      <ContentOverview courses={coursesQuery.data} />
      <CourseDrilldown courses={coursesQuery.data} />
      {can(admin, "edit_curriculum") ? <AdminRoster /> : null}
    </div>
  );
}
