"use client";

import { useQuery } from "@tanstack/react-query";
import { RotateCw, ScanLine, Square } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import type { Course } from "@/contracts/admin/content";
import { coursesQueryOptions } from "@/features/content/content-queries";
import {
  scanCompletion,
  type ContentScanFailure,
  type ContentScanPhase,
  type ContentScanProgress,
} from "@/features/content/content-scan";
import { useContentScan } from "@/features/content/content-scan-provider";
import type {
  ContentScanOutcome,
  ContentScanRun,
} from "@/features/content/content-scan-store";
import {
  indexSnapshot,
  type ContentSnapshot,
} from "@/features/content/content-snapshot";
import type { ApiError } from "@/lib/api/error";

const primaryButton =
  "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60";

const phaseLabels: Readonly<Record<ContentScanPhase, string>> = {
  courses: "Ders listesi okunuyor",
  units: "Ünite listeleri okunuyor",
  exercises: "Soru listeleri okunuyor",
};

const dateFormat = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "long",
  timeStyle: "short",
});

export function formatScanTime(iso: string): string {
  return dateFormat.format(new Date(iso));
}

function count(value: number | null): string {
  return value === null ? "—" : String(value);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight">{value}</dd>
    </div>
  );
}

function RunProgress({ run }: { run: ContentScanRun }) {
  const progress: ContentScanProgress | null = run.progress;
  const completion =
    progress === null ? 0 : scanCompletion(progress, run.kind === "full");
  const percent = completion === null ? null : Math.round(completion * 100);
  const phase =
    progress === null ? "Tarama başlatılıyor" : phaseLabels[progress.phase];

  return (
    <section aria-labelledby="scan-progress-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold" id="scan-progress-heading">
          {run.kind === "retry" ? "Tekrar deneniyor" : "Tarama sürüyor"}
        </h2>
        <p aria-live="polite" className="text-sm text-muted">
          Mevcut aşama: <strong className="text-foreground">{phase}</strong>
          {percent === null ? null : ` · %${percent}`}
        </p>
      </div>

      <div
        aria-label="Tarama ilerlemesi"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent ?? undefined}
        aria-valuetext={
          percent === null
            ? `${phase}, oran hesaplanıyor`
            : `${phase}, %${percent}`
        }
        className="h-2.5 overflow-hidden rounded-full bg-surface-muted"
        role="progressbar"
      >
        <div
          className={`h-full rounded-full bg-primary transition-[width] ${percent === null ? "w-1/4 animate-pulse" : ""}`}
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Toplam ders"
          value={count(progress?.courses.total ?? null)}
        />
        <Stat
          label="Taranan ders"
          value={String(progress?.courses.scanned ?? 0)}
        />
        <Stat
          label="Toplam ünite"
          value={count(progress?.units.total ?? null)}
        />
        <Stat
          label="Taranan ünite"
          value={String(progress?.units.scanned ?? 0)}
        />
        <Stat label="Bulunan soru" value={String(progress?.exercises ?? 0)} />
        <Stat
          label="Tamamlanma"
          value={percent === null ? "—" : `%${percent}`}
        />
      </dl>

      {progress === null || progress.failed === 0 ? null : (
        <p className="text-sm text-danger">
          Şu ana kadar {progress.failed} liste okunamadı; tarama diğerleriyle
          sürüyor.
        </p>
      )}
    </section>
  );
}

function failureLabel(
  failure: ContentScanFailure,
  courseName: (courseId: number) => string,
): string {
  switch (failure.kind) {
    case "courses":
      return `Ders listesi okunamadı: ${failure.error.message}`;
    case "course":
      return `${courseName(failure.courseId)} — ünite listesi okunamadı: ${failure.error.message}`;
    case "unit":
      return `${courseName(failure.courseId)} › ${failure.title} — soru listesi okunamadı: ${failure.error.message}`;
  }
}

function failureKey(failure: ContentScanFailure): string {
  return failure.kind === "courses"
    ? "courses"
    : failure.kind === "course"
      ? `course-${failure.courseId}`
      : `unit-${failure.unitId}`;
}

function Failures({
  failures,
  courseName,
  onRetry,
  canRetry,
}: {
  failures: readonly ContentScanFailure[];
  courseName: (courseId: number) => string;
  onRetry: () => void;
  canRetry: boolean;
}) {
  return (
    <section
      aria-labelledby="scan-failures-heading"
      className="rounded-lg border border-danger/30 bg-danger/5 p-4"
    >
      <h2
        className="text-sm font-semibold text-danger"
        id="scan-failures-heading"
      >
        {failures.length} liste okunamadı
      </h2>
      <p className="mt-1 text-sm text-muted">
        Bu ders ve ünitelerin verisi taramada yok; sonuçlar eksik. Yalnızca
        bunları yeniden deneyebilirsiniz.
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {failures.map((failure) => (
          <li key={failureKey(failure)}>{failureLabel(failure, courseName)}</li>
        ))}
      </ul>
      <button
        className={`${secondaryButton} mt-3`}
        disabled={!canRetry}
        onClick={onRetry}
        type="button"
      >
        <RotateCw aria-hidden="true" className="size-4" />
        Başarısız olanları tekrar dene
      </button>
    </section>
  );
}

function OutcomeNotice({ outcome }: { outcome: ContentScanOutcome }) {
  switch (outcome.status) {
    case "complete":
      return (
        <p className="text-sm text-muted" role="status">
          {outcome.kind === "retry"
            ? "Tekrar deneme tamamlandı; tarama artık eksiksiz."
            : "Tarama eksiksiz tamamlandı."}
        </p>
      );
    case "partial":
      return (
        <p className="text-sm text-danger" role="status">
          Tarama tamamlandı ama bazı listeler okunamadı; sonuçlar eksik.
        </p>
      );
    case "cancelled":
      return (
        <p className="text-sm text-muted" role="status">
          Tarama iptal edildi. Önceki tarama sonucu (varsa) korunuyor.
        </p>
      );
    case "failed":
      return (
        <p className="text-sm text-danger" role="alert">
          Ders listesi okunamadığı için tarama yapılamadı.
        </p>
      );
    case "halted":
      return outcome.haltError?.kind === "rate_limit" ? (
        <p className="text-sm text-danger" role="alert">
          Sunucu çok fazla istek aldığını bildirdi; tarama durduruldu.
          {outcome.haltError.retryAfterSeconds === undefined
            ? " Bir süre sonra yeniden tarayın."
            : ` ${outcome.haltError.retryAfterSeconds} saniye sonra yeniden tarayın.`}{" "}
          Önceki tarama sonucu (varsa) korunuyor.
        </p>
      ) : null;
  }
}

function SnapshotSummary({ snapshot }: { snapshot: ContentSnapshot }) {
  const perCourse = useMemo(() => {
    const index = indexSnapshot(snapshot);
    const failedCourses = new Set(
      snapshot.errors.flatMap((error) =>
        error.kind === "course" ? [error.courseId] : [],
      ),
    );

    return snapshot.courses.map((course) => {
      const units = index.unitsByCourse.get(course.id) ?? [];
      const failedUnits = units.filter(
        (unit) => !index.scannedUnitIds.has(unit.id),
      ).length;

      return {
        course,
        units: units.length,
        exercises: units.reduce(
          (total, unit) =>
            total + (index.exercisesByUnit.get(unit.id)?.length ?? 0),
          0,
        ),
        failed: failedCourses.has(course.id) ? null : failedUnits,
      };
    });
  }, [snapshot]);

  return (
    <section aria-labelledby="snapshot-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold" id="snapshot-heading">
          Tarama sonucu
        </h2>
        <p className="text-sm text-muted">
          <time dateTime={snapshot.generatedAt}>
            {formatScanTime(snapshot.generatedAt)}
          </time>
          {snapshot.status === "partial" ? " · eksik" : " · eksiksiz"}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Ders" value={String(snapshot.courses.length)} />
        <Stat label="Ünite" value={String(snapshot.units.length)} />
        <Stat label="Soru" value={String(snapshot.exercises.length)} />
        <Stat label="Okunamayan liste" value={String(snapshot.errors.length)} />
      </dl>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <caption className="sr-only">Derse göre tarama sonucu</caption>
          <thead className="border-b border-border text-xs text-muted">
            <tr>
              <th className="px-4 py-2 font-medium" scope="col">
                Ders
              </th>
              <th className="px-4 py-2 text-right font-medium" scope="col">
                Ünite
              </th>
              <th className="px-4 py-2 text-right font-medium" scope="col">
                Soru
              </th>
              <th className="px-4 py-2 text-right font-medium" scope="col">
                Okunamayan
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {perCourse.map((row) => (
              <tr key={row.course.id}>
                <th className="px-4 py-2 font-medium" scope="row">
                  <Link
                    className="hover:text-primary hover:underline"
                    href={`/quality?course=${row.course.id}`}
                  >
                    {row.course.name}
                  </Link>
                </th>
                <td className="px-4 py-2 text-right">
                  {row.failed === null ? "—" : row.units}
                </td>
                <td className="px-4 py-2 text-right">
                  {row.failed === null ? "—" : row.exercises}
                </td>
                <td
                  className={`px-4 py-2 text-right ${row.failed !== 0 ? "font-medium text-danger" : ""}`}
                >
                  {row.failed === null ? "Ünite listesi" : row.failed}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        Ders adları Soru Kalite Merkezi&apos;nde o dersi açar. Bu sonuç Soru
        Kalite Merkezi tarafından da kullanılır.
      </p>
    </section>
  );
}

/**
 * The full catalogue scan: courses → units → exercises, read through the
 * existing list endpoints with bounded concurrency. The scan and its result
 * belong to the signed-in session (see `ContentScanController`), so it keeps
 * running across panel pages and is gone after sign-out or a reload.
 */
export function ContentScanCenter() {
  const router = useRouter();
  const { state, start, cancel, retryFailures } = useContentScan();
  const { run, lastOutcome, snapshot, lastFullScanAt } = state;

  // Observe only: course names for failure rows come from whatever the scan
  // (or any other page) already put in the cache — never a request of its own.
  const coursesQuery = useQuery<Course[], ApiError>({
    ...coursesQueryOptions(),
    enabled: false,
  });

  const isSessionExpired = lastOutcome?.haltError?.kind === "authentication";

  useEffect(() => {
    if (isSessionExpired) {
      router.replace("/login");
      router.refresh();
    }
  }, [isSessionExpired, router]);

  const courseName = (courseId: number) =>
    snapshot?.courses.find((course) => course.id === courseId)?.name ??
    coursesQuery.data?.find((course) => course.id === courseId)?.name ??
    `Ders #${courseId}`;

  const failures =
    lastOutcome?.status === "failed"
      ? lastOutcome.failures
      : (snapshot?.errors ?? []);
  const isRunning = run !== null;

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="scan-status-heading"
        className="rounded-lg border border-border bg-surface p-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold" id="scan-status-heading">
              Son tam tarama
            </h2>
            <p className="mt-1 text-sm">
              {lastFullScanAt === null ? (
                <span className="text-muted">
                  Bu oturumda henüz eksiksiz bir tarama yapılmadı.
                </span>
              ) : (
                <time dateTime={lastFullScanAt}>
                  {formatScanTime(lastFullScanAt)}
                </time>
              )}
            </p>
            {snapshot !== null && snapshot.status === "partial" ? (
              <p className="mt-1 text-sm text-danger">
                En son tarama ({formatScanTime(snapshot.generatedAt)}) eksik
                tamamlandı.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 sm:shrink-0">
            {isRunning ? (
              <button
                className={secondaryButton}
                disabled={run.isCancelling}
                onClick={cancel}
                type="button"
              >
                <Square aria-hidden="true" className="size-4" />
                {run.isCancelling ? "İptal ediliyor…" : "Taramayı iptal et"}
              </button>
            ) : snapshot === null ? (
              <button
                className={primaryButton}
                onClick={() => start()}
                type="button"
              >
                <ScanLine aria-hidden="true" className="size-4" />
                Taramayı başlat
              </button>
            ) : (
              <button
                className={primaryButton}
                onClick={() => start({ refresh: true })}
                type="button"
              >
                <RotateCw aria-hidden="true" className="size-4" />
                Yeniden tara
              </button>
            )}
          </div>
        </div>

        <div aria-live="polite" className="mt-3">
          {!isRunning && lastOutcome !== null ? (
            <OutcomeNotice outcome={lastOutcome} />
          ) : null}
        </div>

        <p className="mt-3 text-xs text-muted">
          Tarama mevcut liste uçlarını ders → ünite → soru sırasıyla, aynı anda
          en fazla birkaç istekle okur. Siz başka panel sayfalarına geçseniz de
          sürer. Sonuç yalnızca bu oturumun belleğinde tutulur: büyük
          kataloglarda tarayıcı depolama kotasını aşabileceği ve çıkıştan sonra
          cihazda içerik verisi bırakmaması gerektiği için sayfa yenilendiğinde
          veya çıkış yapıldığında silinir.
        </p>
      </section>

      {isRunning ? <RunProgress run={run} /> : null}

      {!isRunning && failures.length > 0 ? (
        <Failures
          canRetry={!isRunning}
          courseName={courseName}
          failures={failures}
          onRetry={retryFailures}
        />
      ) : null}

      {snapshot === null ? (
        isRunning ? null : (
          <div className="rounded-lg border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold">Henüz tarama sonucu yok.</h2>
            <p className="mt-1.5 max-w-prose text-sm text-muted">
              Taramayı başlattığınızda tüm derslerin ünite ve soru listeleri
              okunur; sonuç Soru Kalite Merkezi gibi ekranlarda kullanılır.
            </p>
          </div>
        )
      ) : (
        <SnapshotSummary snapshot={snapshot} />
      )}
    </div>
  );
}
