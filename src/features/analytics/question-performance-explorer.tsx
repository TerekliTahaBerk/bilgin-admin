"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { publishStatuses } from "@/contracts/admin/content";
import { BarList, type BarEntry } from "@/features/analytics/bar-list";
import {
  BACKEND_REVIEW_MIN_ATTEMPTS,
  buildPerformanceReport,
  formatPercent,
  formatSeconds,
  MIN_ATTEMPT_OPTIONS,
  RANKING_SIZE,
  rankingKinds,
  rankingTitles,
  type Aggregate,
  type GroupPerformance,
  type MinAttempts,
  type PerformanceFilters,
  type RankingKind,
} from "@/features/analytics/question-performance";
import { exerciseHref } from "@/features/content/content-links";
import {
  exerciseTypeLabels,
  publishStatusLabels,
} from "@/features/content/content-labels";
import { useContentScan } from "@/features/content/content-scan-provider";
import type {
  ContentSnapshot,
  SnapshotExercise,
} from "@/features/content/content-snapshot";
import {
  ScanRequiredNotice,
  SnapshotSourceBar,
} from "@/features/content/snapshot-notices";

/** Topics shown before "Tümünü göster". */
export const TOPIC_PREVIEW_SIZE = 15;

const fieldClass =
  "mt-1 block w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm";
const chipClass = (active: boolean) =>
  active
    ? "rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
    : "rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted";

const RATE_METHOD =
  "Ağırlıklı ortalama: grup içindeki tüm cevapların doğru olan payı, Σ(doğru oranı × deneme) / Σ deneme. Hiç çözülmemiş sorular hesaba katılmaz.";
const TIME_METHOD =
  "Deneme sayısıyla ağırlıklı ortalama; süre bilgisi olmayan sorular hesaba katılmaz.";

function rateEntries(groups: readonly GroupPerformance<unknown>[]): BarEntry[] {
  return groups.map((group) => ({
    id: String(group.key),
    label: group.label,
    value: group.correctRate.weighted,
    detail: aggregateDetail(group.correctRate, formatPercent),
  }));
}

function timeEntries(groups: readonly GroupPerformance<unknown>[]): BarEntry[] {
  return groups.map((group) => ({
    id: String(group.key),
    label: group.label,
    value: group.avgSeconds.weighted,
    detail: aggregateDetail(group.avgSeconds, formatSeconds),
  }));
}

function aggregateDetail(
  value: Aggregate,
  format: (value: number | null) => string,
): string | undefined {
  if (value.questions === 0) return undefined;

  return `${value.questions} soru · ${value.attempts} deneme · ağırlıksız ${format(value.unweighted)}`;
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </dd>
      {hint === undefined ? null : (
        <dd className="mt-1 text-xs text-muted">{hint}</dd>
      )}
    </div>
  );
}

function Filters({
  snapshot,
  filters,
  onChange,
}: {
  snapshot: ContentSnapshot;
  filters: PerformanceFilters;
  onChange: (next: PerformanceFilters) => void;
}) {
  return (
    <section aria-labelledby="performance-filters-heading">
      <h2 className="sr-only" id="performance-filters-heading">
        Filtreler
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label
            className="block text-xs font-medium"
            htmlFor="performance-course"
          >
            Ders
          </label>
          <select
            className={fieldClass}
            id="performance-course"
            onChange={(event) =>
              onChange({
                ...filters,
                courseId:
                  event.target.value === ""
                    ? undefined
                    : Number(event.target.value),
              })
            }
            value={filters.courseId ?? ""}
          >
            <option value="">Tüm dersler</option>
            {snapshot.courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            className="block text-xs font-medium"
            htmlFor="performance-status"
          >
            Durum
          </label>
          <select
            className={fieldClass}
            id="performance-status"
            onChange={(event) =>
              onChange({
                ...filters,
                status: publishStatuses.find(
                  (status) => status === event.target.value,
                ),
              })
            }
            value={filters.status ?? ""}
          >
            <option value="">Tüm durumlar</option>
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
            htmlFor="performance-min"
          >
            Minimum örneklem
          </label>
          <select
            aria-describedby="performance-min-hint"
            className={fieldClass}
            id="performance-min"
            onChange={(event) =>
              onChange({
                ...filters,
                minAttempts:
                  MIN_ATTEMPT_OPTIONS.find(
                    (option) => option === Number(event.target.value),
                  ) ?? (1 satisfies MinAttempts),
              })
            }
            value={filters.minAttempts}
          >
            {MIN_ATTEMPT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === 1
                  ? "En az 1 deneme (tümü)"
                  : `En az ${option} deneme${
                      option === BACKEND_REVIEW_MIN_ATTEMPTS
                        ? " (backend inceleme eşiği)"
                        : ""
                    }`}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted" id="performance-min-hint">
            Doğru oranı, süre ve sıralamalara uygulanır; soru sayısı
            dağılımlarına uygulanmaz.
          </p>
        </div>
      </div>
    </section>
  );
}

function Method() {
  return (
    <details className="rounded-lg border border-border bg-surface p-4 text-sm">
      <summary className="cursor-pointer font-medium">
        Ortalamalar nasıl hesaplanıyor?
      </summary>
      <div className="mt-2 max-w-prose space-y-2 text-muted">
        <p>
          Her sorunun deneme sayısı, doğru oranı ve ortalama süresi backend’in
          kendi istatistiğidir; bu ekran onları yalnızca gruplar.
        </p>
        <p>
          <strong className="font-medium text-foreground">
            Ağırlıklı doğru oranı
          </strong>{" "}
          (çubuklardaki değer): gruptaki tüm cevapların doğru olan payı —
          Σ(doğru oranı × deneme) / Σ deneme. Çok çözülen soru sonucu daha çok
          etkiler. Backend oranı tam sayıya yuvarladığı için sonuç en fazla
          yarım puan sapabilir.
        </p>
        <p>
          <strong className="font-medium text-foreground">
            Ağırlıksız ortalama
          </strong>{" "}
          (alt satırda): soru başına oranların düz ortalaması — “tipik bir soru”
          nasıl gidiyor. 3 denemeli bir soru 3 000 denemeli biriyle aynı
          ağırlıktadır; bu yüzden minimum örneklem filtresi önemlidir.
        </p>
        <p>
          Hiç çözülmemiş (0 deneme) sorular oran ve süre hesabına girmez; doğru
          oranları “yok”tur, sıfır değildir. Ortalama süre de denemeyle
          ağırlıklıdır; backend süreyi yalnızca süre kaydı olan denemelerden
          hesapladığı için bu ağırlık yaklaşıktır.
        </p>
      </div>
    </details>
  );
}

function TopicCounts({ entries }: { entries: readonly BarEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? entries : entries.slice(0, TOPIC_PREVIEW_SIZE);

  return (
    <div>
      <BarList
        description={
          entries.length > TOPIC_PREVIEW_SIZE && !expanded
            ? `En çok sorusu olan ${TOPIC_PREVIEW_SIZE} konu (toplam ${entries.length}).`
            : undefined
        }
        entries={shown}
        title="Konuya göre soru sayısı"
        valueLabel="soru"
      />
      {entries.length > TOPIC_PREVIEW_SIZE ? (
        <button
          aria-expanded={expanded}
          className="mt-2 text-sm font-medium text-primary underline"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? "Daha az göster" : `Tümünü göster (${entries.length})`}
        </button>
      ) : null}
    </div>
  );
}

function RankingTable({
  kind,
  rows,
  snapshot,
  canEdit,
}: {
  kind: RankingKind;
  rows: readonly SnapshotExercise[];
  snapshot: ContentSnapshot;
  canEdit: boolean;
}) {
  const courseNames = useMemo(
    () => new Map(snapshot.courses.map((course) => [course.id, course.name])),
    [snapshot],
  );
  const unitTitles = useMemo(
    () => new Map(snapshot.units.map((unit) => [unit.id, unit.title])),
    [snapshot],
  );

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
        {kind === "longest_time" || kind === "shortest_time"
          ? "Örneklem eşiğini geçen ve süre bilgisi olan soru yok."
          : "Örneklem eşiğini geçen soru yok."}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <caption className="sr-only">{rankingTitles[kind]}</caption>
        <thead className="border-b border-border text-xs text-muted">
          <tr>
            <th className="px-3 py-2 font-medium" scope="col">
              #
            </th>
            <th className="px-3 py-2 font-medium" scope="col">
              Soru
            </th>
            <th className="px-3 py-2 font-medium" scope="col">
              Ders / Ünite
            </th>
            <th className="px-3 py-2 font-medium" scope="col">
              Tür
            </th>
            <th className="px-3 py-2 text-right font-medium" scope="col">
              Zorluk
            </th>
            <th className="px-3 py-2 text-right font-medium" scope="col">
              Deneme
            </th>
            <th className="px-3 py-2 text-right font-medium" scope="col">
              Doğru oranı
            </th>
            <th className="px-3 py-2 text-right font-medium" scope="col">
              Ort. süre
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((exercise, index) => (
            <tr key={exercise.id}>
              <td className="px-3 py-2 tabular-nums text-muted">{index + 1}</td>
              <th className="max-w-xs px-3 py-2 font-normal" scope="row">
                <Link
                  className="line-clamp-2 hover:text-primary hover:underline"
                  href={exerciseHref(
                    {
                      courseId: exercise.courseId,
                      unitId: exercise.unitId,
                      exerciseId: exercise.id,
                      type: exercise.type,
                    },
                    canEdit,
                  )}
                >
                  {exercise.preview}
                </Link>
                <span className="block text-xs text-muted">
                  #{exercise.id} · {exercise.topic.name}
                </span>
              </th>
              <td className="px-3 py-2">
                <span className="block">
                  {courseNames.get(exercise.courseId) ?? "—"}
                </span>
                <span className="block text-xs text-muted">
                  {unitTitles.get(exercise.unitId) ?? "—"}
                </span>
              </td>
              <td className="px-3 py-2">{exerciseTypeLabels[exercise.type]}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {exercise.difficulty}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {exercise.stats.attempts}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatPercent(exercise.stats.correct_rate)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatSeconds(exercise.stats.avg_seconds)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Rankings({
  rankings,
  snapshot,
  canEdit,
}: {
  rankings: Readonly<Record<RankingKind, SnapshotExercise[]>>;
  snapshot: ContentSnapshot;
  canEdit: boolean;
}) {
  const [kind, setKind] = useState<RankingKind>("most_attempts");

  return (
    <section aria-labelledby="rankings-heading" className="space-y-3">
      <div>
        <h2 className="text-base font-semibold" id="rankings-heading">
          Soru sıralamaları
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          Her liste en fazla {RANKING_SIZE} soru gösterir; eşitlikte daha çok
          denenen soru önce gelir.
        </p>
      </div>
      <div aria-label="Sıralama" className="flex flex-wrap gap-2" role="group">
        {rankingKinds.map((item) => (
          <button
            aria-pressed={item === kind}
            className={chipClass(item === kind)}
            key={item}
            onClick={() => setKind(item)}
            type="button"
          >
            {rankingTitles[item]}
          </button>
        ))}
      </div>
      <RankingTable
        canEdit={canEdit}
        kind={kind}
        rows={rankings[kind]}
        snapshot={snapshot}
      />
    </section>
  );
}

function Report({
  snapshot,
  filters,
  onChange,
  canEdit,
}: {
  snapshot: ContentSnapshot;
  filters: PerformanceFilters;
  onChange: (next: PerformanceFilters) => void;
  canEdit: boolean;
}) {
  const report = useMemo(
    () => buildPerformanceReport(snapshot, filters),
    [snapshot, filters],
  );

  return (
    <div className="space-y-6">
      <SnapshotSourceBar snapshot={snapshot} />

      {snapshot.status === "partial" ? (
        <p className="text-sm text-danger" role="status">
          Tarama eksik: {snapshot.errors.length} liste okunamadı; analizler
          yalnızca okunan soruları kapsar.
        </p>
      ) : null}

      <Filters filters={filters} onChange={onChange} snapshot={snapshot} />

      {report.population === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold">
            Bu filtrelerle eşleşen soru yok.
          </h2>
          <button
            className="mt-3 text-sm font-medium text-primary underline"
            onClick={() => onChange({ minAttempts: filters.minAttempts })}
            type="button"
          >
            Ders ve durum filtresini kaldır
          </button>
        </div>
      ) : (
        <>
          <section aria-labelledby="sample-heading" className="space-y-3">
            <h2 className="text-base font-semibold" id="sample-heading">
              Örneklem
            </h2>
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
              <Stat label="Kapsamdaki soru" value={report.population} />
              <Stat label="Hiç çözülmemiş" value={report.unattempted} />
              <Stat
                hint={`${filters.minAttempts} denemeden az`}
                label="Örneklem altında"
                value={report.belowSample}
              />
              <Stat label="Analize giren" value={report.measured} />
              <Stat
                hint={
                  report.overall.correctRate.unweighted === null
                    ? undefined
                    : `Ağırlıksız ${formatPercent(report.overall.correctRate.unweighted)}`
                }
                label="Doğru oranı (ağırlıklı)"
                value={formatPercent(report.overall.correctRate.weighted)}
              />
              <Stat
                hint={
                  report.overall.avgSeconds.unweighted === null
                    ? undefined
                    : `Ağırlıksız ${formatSeconds(report.overall.avgSeconds.unweighted)}`
                }
                label="Ort. süre (ağırlıklı)"
                value={formatSeconds(report.overall.avgSeconds.weighted)}
              />
            </dl>
            <Method />
          </section>

          <section aria-labelledby="performance-heading" className="space-y-3">
            <h2 className="text-base font-semibold" id="performance-heading">
              Performans
            </h2>
            {report.measured === 0 ? (
              <p className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
                En az {filters.minAttempts} denemesi olan soru yok; oran ve süre
                analizleri için örneklem eşiğini düşürün.
              </p>
            ) : null}
            <div className="grid gap-4 lg:grid-cols-2">
              <BarList
                description={RATE_METHOD}
                entries={rateEntries(report.byDifficulty)}
                formatValue={formatPercent}
                scaleMax={100}
                title="Zorluğa göre doğru oranı"
                valueLabel="doğru oranı"
              />
              <BarList
                description={TIME_METHOD}
                entries={timeEntries(report.byDifficulty)}
                formatValue={formatSeconds}
                title="Zorluğa göre ortalama süre"
                valueLabel="ortalama süre"
              />
              <BarList
                description={RATE_METHOD}
                entries={rateEntries(report.byType)}
                formatValue={formatPercent}
                scaleMax={100}
                title="Soru türüne göre doğru oranı"
                valueLabel="doğru oranı"
              />
              <BarList
                description="Kapsamdaki tüm soruların toplam denemesi; örneklem filtresi uygulanmaz."
                entries={report.attemptsByType}
                title="Soru türüne göre deneme sayısı"
                valueLabel="deneme"
              />
            </div>
          </section>

          <section aria-labelledby="distribution-heading" className="space-y-3">
            <h2 className="text-base font-semibold" id="distribution-heading">
              Soru dağılımı
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <TopicCounts entries={report.countByTopic} />
              <BarList
                entries={report.countByStatus}
                title="Duruma göre soru sayısı"
                valueLabel="soru"
              />
              <BarList
                description="Bir soru birden çok sınav kapsamına ait olabilir; her birinde sayılır, toplam soru sayısını aşabilir."
                entries={report.countByScope}
                title="Sınav kapsamına göre soru sayısı"
                valueLabel="soru"
              />
              <BarList
                entries={report.countByDifficulty}
                title="Zorluğa göre soru sayısı"
                valueLabel="soru"
              />
            </div>
          </section>

          <Rankings
            canEdit={canEdit}
            rankings={report.rankings}
            snapshot={snapshot}
          />
        </>
      )}
    </div>
  );
}

/**
 * Question Performance Explorer: groups the backend's per-question stats from
 * the session's full-scan snapshot. Without a snapshot it says so and offers
 * the scan — a partial, browse-driven cache would misrepresent the catalogue.
 */
export function QuestionPerformanceExplorer({
  filters,
  onChange,
  canEdit,
}: {
  filters: PerformanceFilters;
  onChange: (next: PerformanceFilters) => void;
  canEdit: boolean;
}) {
  const { state } = useContentScan();

  if (state.snapshot === null) {
    return (
      <ScanRequiredNotice>
        Soru performansı tüm kataloğun taranmış istatistiklerine göre
        hesaplanır. Yalnızca gezilen ünitelerin verisiyle ortalama göstermek
        yanıltıcı olurdu; bu yüzden önce tam tarama gerekir.
      </ScanRequiredNotice>
    );
  }

  return (
    <Report
      canEdit={canEdit}
      filters={filters}
      onChange={onChange}
      snapshot={state.snapshot}
    />
  );
}
