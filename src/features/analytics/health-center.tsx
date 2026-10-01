"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useEffect, useMemo, useState } from "react";

import { BarList } from "@/features/analytics/bar-list";
import {
  computeHealthMetrics,
  LOW_UNIT_EXERCISE_MAX,
  statusDistribution,
  topicCoverage,
  topicsBySubject,
  type HealthMetrics,
  type TopicCoverageRow,
} from "@/features/analytics/health-metrics";
import {
  buildHealthProblems,
  countProblemsByKind,
  problemKindLabels,
  problemKinds,
  severityLabels,
  type HealthProblem,
  type ProblemKind,
  type ProblemSeverity,
} from "@/features/analytics/health-problems";
import {
  computeHealthScore,
  healthBand,
  type HealthScore,
} from "@/features/analytics/health-score";
import { useCourseTopicLists } from "@/features/content/use-course-topic-lists";
import { useContentScan } from "@/features/content/content-scan-provider";
import {
  ScanRequiredNotice,
  SnapshotSourceBar,
} from "@/features/content/snapshot-notices";
import { topicCoverageRanges } from "@/features/content/topic-coverage";
import type { ContentSnapshot } from "@/features/content/content-snapshot";

/** Problems rendered per step; the rest wait behind "Daha fazla göster". */
export const PROBLEM_PAGE_SIZE = 30;

const secondaryButton =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60";

const severityStyles: Readonly<Record<ProblemSeverity, string>> = {
  high: "border-red-200 bg-red-50 text-red-800",
  medium: "border-amber-200 bg-amber-50 text-amber-800",
  low: "border-border bg-surface-muted text-muted",
};

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight">{value}</dd>
    </div>
  );
}

function percent(value: number | null): string {
  return value === null ? "—" : `%${Math.round(value * 100)}`;
}

/* ------------------------------------------------------------ score -- */

const bandLabels = { good: "İyi", fair: "Orta", poor: "Zayıf" } as const;
const bandStyles = {
  good: "text-emerald-800",
  fair: "text-amber-800",
  poor: "text-red-800",
} as const;

export function HealthScoreCard({
  health,
  caveats,
}: {
  health: HealthScore;
  caveats: readonly string[];
}) {
  const band = health.score === null ? null : healthBand(health.score);

  return (
    <section
      aria-labelledby="health-score-heading"
      className="rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold" id="health-score-heading">
            İçerik Sağlığı Skoru
          </h2>
          <p className="mt-1 max-w-prose text-xs text-muted">
            Bu skor yönetim panelinin aşağıdaki sinyallerden hesapladığı bir
            ürün göstergesidir; backend&apos;in resmi bir metriği değildir. Asıl
            yapılacaklar aşağıdaki problem listesindedir.
          </p>
        </div>
        <p className="text-right">
          <span
            className={`text-4xl font-semibold tracking-tight ${band === null ? "" : bandStyles[band]}`}
          >
            {health.score ?? "—"}
          </span>
          <span className="text-sm text-muted"> / 100</span>
          {band === null ? null : (
            <span className={`block text-sm font-medium ${bandStyles[band]}`}>
              {bandLabels[band]}
            </span>
          )}
        </p>
      </div>

      {caveats.length === 0 ? null : (
        <ul className="mt-2 space-y-1 text-xs text-amber-800">
          {caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-primary">
          Skor nasıl hesaplanıyor?
        </summary>
        <p className="mt-2 text-xs text-muted">
          Ağırlıklı ortalama: skor = 100 × Σ(ağırlık × oran) / Σ(ağırlık).
          Ölçülecek verisi olmayan sinyal hesaba katılmaz; kalan ağırlıklar
          yeniden dağıtılır. Bantlar: 80 ve üstü iyi, 50–79 orta, 50 altı zayıf.
        </p>
        <table className="mt-2 w-full text-left text-xs">
          <caption className="sr-only">Skoru oluşturan sinyaller</caption>
          <thead className="text-muted">
            <tr>
              <th className="py-1 pr-2 font-medium" scope="col">
                Sinyal
              </th>
              <th className="py-1 pr-2 text-right font-medium" scope="col">
                Ağırlık
              </th>
              <th className="py-1 text-right font-medium" scope="col">
                Değer
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {health.signals.map((signal) => (
              <tr key={signal.id}>
                <th className="py-1.5 pr-2 font-normal" scope="row">
                  <span className="font-medium">{signal.label}</span>
                  <span className="block text-muted">{signal.description}</span>
                </th>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {signal.weight}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {signal.ratio === null ? (
                    <span className="text-muted">Hesaba katılmadı</span>
                  ) : (
                    `${percent(signal.ratio)} (${signal.numerator}/${signal.denominator})`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

/* --------------------------------------------------------- problems -- */

export const HealthProblemList = memo(function HealthProblemList({
  problems,
}: {
  problems: readonly HealthProblem[];
}) {
  const [kind, setKind] = useState<ProblemKind | null>(null);
  const [visible, setVisible] = useState(PROBLEM_PAGE_SIZE);
  const counts = useMemo(() => countProblemsByKind(problems), [problems]);
  const shown = useMemo(
    () =>
      kind === null
        ? problems
        : problems.filter((problem) => problem.kind === kind),
    [problems, kind],
  );
  const chip = (isActive: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
      isActive
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-surface hover:bg-surface-muted"
    }`;

  return (
    <section aria-labelledby="health-problems-heading" className="space-y-3">
      <h2 className="text-sm font-semibold" id="health-problems-heading">
        Yapılacaklar
        <span className="ml-1.5 font-normal text-muted">
          ({problems.length})
        </span>
      </h2>

      {problems.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="text-sm text-muted">
            Taranan içerikte bu ekranın aradığı bir problem bulunamadı.
          </p>
        </div>
      ) : (
        <>
          <div
            aria-label="Problem türü"
            className="flex flex-wrap gap-2"
            role="group"
          >
            <button
              aria-pressed={kind === null}
              className={chip(kind === null)}
              onClick={() => {
                setKind(null);
                setVisible(PROBLEM_PAGE_SIZE);
              }}
              type="button"
            >
              Tümü ({problems.length})
            </button>
            {problemKinds
              .filter((item) => counts[item] > 0)
              .map((item) => (
                <button
                  aria-pressed={kind === item}
                  className={chip(kind === item)}
                  key={item}
                  onClick={() => {
                    setKind(item);
                    setVisible(PROBLEM_PAGE_SIZE);
                  }}
                  type="button"
                >
                  {problemKindLabels[item]} ({counts[item]})
                </button>
              ))}
          </div>

          <ul
            aria-label="Problem listesi"
            className="divide-y divide-border rounded-lg border border-border bg-surface"
          >
            {shown.slice(0, visible).map((problem) => (
              <li
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                key={problem.id}
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${severityStyles[problem.severity]}`}
                    >
                      {severityLabels[problem.severity]}
                    </span>
                    <span className="text-muted">
                      {problemKindLabels[problem.kind]}
                    </span>
                  </p>
                  <p className="mt-1 text-sm font-medium break-words">
                    {problem.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{problem.detail}</p>
                </div>
                <Link
                  aria-label={`${problem.linkLabel}: ${problem.title}`}
                  className="shrink-0 text-sm font-semibold text-primary hover:underline"
                  href={problem.href}
                >
                  {problem.linkLabel}
                </Link>
              </li>
            ))}
          </ul>

          {shown.length > visible ? (
            <div className="flex justify-center">
              <button
                className={secondaryButton}
                onClick={() => setVisible((value) => value + PROBLEM_PAGE_SIZE)}
                type="button"
              >
                Daha fazla göster (
                {Math.min(PROBLEM_PAGE_SIZE, shown.length - visible)} problem
                daha)
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
});

/* ---------------------------------------------------------- metrics -- */

function MetricSections({
  metrics,
  topics,
  topicsState,
}: {
  metrics: HealthMetrics;
  topics: readonly TopicCoverageRow[];
  topicsState: Readonly<{
    isLoading: boolean;
    failed: number;
    onRetry: () => void;
  }>;
}) {
  const highCoverage = topics.filter((row) => row.coverage === "good");

  return (
    <div className="space-y-8">
      <section aria-labelledby="health-courses-heading" className="space-y-3">
        <h2 className="text-sm font-semibold" id="health-courses-heading">
          Dersler
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Toplam ders" value={metrics.courses.total} />
          <Stat label="Ünitesi olmayan" value={metrics.courses.withoutUnits} />
        </dl>
        <BarList
          entries={statusDistribution(metrics.courses.byStatus)}
          title="Ders yayın durumu"
          valueLabel="ders"
        />
      </section>

      <section aria-labelledby="health-units-heading" className="space-y-3">
        <h2 className="text-sm font-semibold" id="health-units-heading">
          Üniteler
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Toplam ünite" value={metrics.units.total} />
          <Stat label="Sorusu olmayan" value={metrics.units.withoutExercises} />
          <Stat
            label={`Az aktif sorulu (1–${LOW_UNIT_EXERCISE_MAX})`}
            value={metrics.units.fewExercises}
          />
          <Stat label="Toplam adım" value={metrics.units.totalNodes} />
          <Stat label="Adımı olmayan" value={metrics.units.withoutNodes} />
        </dl>
        <BarList
          entries={statusDistribution(metrics.units.byStatus)}
          title="Ünite yayın durumu"
          valueLabel="ünite"
        />
      </section>

      <section aria-labelledby="health-exercises-heading" className="space-y-3">
        <h2 className="text-sm font-semibold" id="health-exercises-heading">
          Sorular
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Toplam soru" value={metrics.exercises.total} />
          <Stat label="Hiç çözülmemiş" value={metrics.exercises.unattempted} />
          <Stat
            label="İnceleme gerekli"
            value={metrics.exercises.needsReview}
          />
          <Stat
            label="Düzenlenmiş (sürüm > 1)"
            value={metrics.exercises.edited}
          />
        </dl>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <BarList
            entries={statusDistribution(metrics.exercises.byStatus)}
            title="Soru yayın durumu"
            valueLabel="soru"
          />
          <BarList
            entries={metrics.exercises.byDifficulty}
            title="Zorluk dağılımı"
            valueLabel="soru"
          />
          <BarList
            entries={metrics.exercises.byType}
            title="Soru tipi dağılımı"
            valueLabel="soru"
          />
          <BarList
            entries={metrics.exercises.byScope}
            title="Sınav kapsamı dağılımı (bir soru birden çok kapsamda olabilir)"
            valueLabel="soru"
          />
        </div>
      </section>

      <section aria-labelledby="health-topics-heading" className="space-y-3">
        <h2 className="text-sm font-semibold" id="health-topics-heading">
          Konular
        </h2>
        <p className="max-w-prose text-xs text-muted">
          Konu başına soru sayısı sunucunun saydığı tüm sorulardır (her ders ve
          durum dâhil). Kapsam bantları uygulama içi bir sınıflandırmadır: düşük{" "}
          {topicCoverageRanges.low}, orta {topicCoverageRanges.medium}, iyi{" "}
          {topicCoverageRanges.good}. Ayrıntılı tablo için{" "}
          <Link className="text-primary underline" href="/coverage">
            İçerik Kapsama Analizi
          </Link>
          .
        </p>

        {topicsState.isLoading ? (
          <p aria-busy="true" aria-live="polite" className="text-sm text-muted">
            Konu listeleri yükleniyor…
          </p>
        ) : null}

        {topicsState.failed > 0 ? (
          <div
            className="flex flex-wrap items-center gap-3 rounded-lg border border-danger/30 bg-danger/5 p-3"
            role="alert"
          >
            <p className="text-sm text-danger">
              {topicsState.failed} dersin konu listesi okunamadı; konu sayıları
              eksik.
            </p>
            <button
              className={secondaryButton}
              onClick={topicsState.onRetry}
              type="button"
            >
              Tekrar dene
            </button>
          </div>
        ) : null}

        {metrics.topics === null ? null : (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Toplam konu" value={metrics.topics.total} />
              <Stat
                label="Sorusu olmayan"
                value={metrics.topics.withoutExercises}
              />
              <Stat label="Düşük kapsam" value={metrics.topics.lowCoverage} />
              <Stat label="İyi kapsam" value={metrics.topics.highCoverage} />
            </dl>
            {highCoverage.length === 0 ? null : (
              <div className="rounded-lg border border-border bg-surface p-4">
                <h3 className="text-sm font-semibold">
                  İyi kapsamlı konular ({topicCoverageRanges.good})
                </h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {highCoverage.map((row) => (
                    <li key={row.topic.id}>
                      <Link
                        className="hover:text-primary hover:underline"
                        href={`/quality?course=${row.subject.courseId}&topic=${row.topic.id}`}
                      >
                        {row.topic.name}
                      </Link>
                      <span className="text-muted">
                        {" "}
                        · {row.topic.exercise_count} soru
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/* ----------------------------------------------------------- center -- */

function SnapshotHealth({
  snapshot,
  canEdit,
}: {
  snapshot: ContentSnapshot;
  canEdit: boolean;
}) {
  const router = useRouter();
  const courseIds = useMemo(
    () => snapshot.courses.map((course) => course.id),
    [snapshot],
  );
  const topicsQuery = useCourseTopicLists(courseIds);

  const isSessionExpired = topicsQuery.haltError?.kind === "authentication";

  useEffect(() => {
    if (isSessionExpired) {
      router.replace("/login");
      router.refresh();
    }
  }, [isSessionExpired, router]);

  const topics = useMemo(
    () => topicCoverage(topicsBySubject(topicsQuery.lists)),
    [topicsQuery.lists],
  );
  // Topic numbers are shown only once every course answered, or once the
  // reads are over (then marked as incomplete) — never half-loaded.
  const topicsForMetrics =
    topicsQuery.isComplete || !topicsQuery.isLoading ? topics : null;
  const metrics = useMemo(
    () => computeHealthMetrics(snapshot, topicsForMetrics),
    [snapshot, topicsForMetrics],
  );
  const health = useMemo(() => computeHealthScore(metrics), [metrics]);
  const problems = useMemo(
    () => buildHealthProblems(snapshot, topicsForMetrics, canEdit),
    [snapshot, topicsForMetrics, canEdit],
  );

  const caveats = [
    ...(snapshot.status === "partial"
      ? [
          `Tarama eksik: ${snapshot.errors.length} liste okunamadı; skor yalnızca okunan veriyi yansıtır.`,
        ]
      : []),
    ...(topicsQuery.isLoading
      ? ["Konu listeleri yükleniyor; konu sinyali henüz hesaba katılmadı."]
      : topicsQuery.failedCourseIds.length > 0
        ? [
            "Bazı derslerin konu listesi okunamadı; konu sinyali eksik veriyle hesaplandı.",
          ]
        : []),
  ];

  return (
    <div className="space-y-6">
      <SnapshotSourceBar snapshot={snapshot} />

      <HealthProblemList problems={problems} />

      <HealthScoreCard caveats={caveats} health={health} />

      <MetricSections
        metrics={metrics}
        topics={topicsForMetrics ?? []}
        topicsState={{
          isLoading: topicsQuery.isLoading,
          failed: topicsQuery.failedCourseIds.length,
          onRetry: topicsQuery.retry,
        }}
      />
    </div>
  );
}

/**
 * The Content Health Center. It is built only on the session's full-scan
 * snapshot (plus the topic lists): without one it says so and offers the
 * scan, rather than presenting whatever happens to be cached as if it were
 * the whole catalogue.
 */
export function HealthCenter({ canEdit }: { canEdit: boolean }) {
  const { state } = useContentScan();

  return state.snapshot === null ? (
    <ScanRequiredNotice>
      İçerik sağlığı tüm kataloğun taranmış hâline göre hesaplanır. Yalnızca
      gezilen sayfaların verisiyle bir pano göstermek, sistemin tamamını temsil
      ediyormuş gibi yanıltıcı olurdu; bu yüzden önce tam tarama gerekir.
    </ScanRequiredNotice>
  ) : (
    <SnapshotHealth canEdit={canEdit} snapshot={state.snapshot} />
  );
}
