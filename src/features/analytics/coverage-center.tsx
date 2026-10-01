"use client";

import { useQuery } from "@tanstack/react-query";
import { ScanLine } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useState } from "react";

import type { Course } from "@/contracts/admin/content";
import type { CourseTopicsData } from "@/contracts/admin/exercise-editor";
import { ExportCsvButton } from "@/components/export-csv-button";
import {
  applyCoverageFilters,
  buildCourseMatrix,
  buildCoverageRows,
  buildScopeMatrix,
  countByCoverageState,
  coverageCsvColumns,
  coverageSortLabels,
  coverageSorts,
  coverageViewLabels,
  coverageViews,
  gradeOptions,
  matrixCsvColumns,
  matrixScopes,
  parentOptions,
  sortCoverageRows,
  type CoverageMatrix,
  type CoverageMode,
  type CoverageRow,
  type CoverageSort,
  type CoverageState,
} from "@/features/analytics/coverage-model";
import {
  coursesQueryOptions,
  courseTopicsQueryOptions,
} from "@/features/content/content-queries";
import { formatScanTime } from "@/features/content/content-scan-center";
import { useContentScan } from "@/features/content/content-scan-provider";
import type { ContentSnapshot } from "@/features/content/content-snapshot";
import {
  topicCoverageLabels,
  topicCoverageRanges,
  topicCoverageStates,
  topicCoverageStyles,
  type TopicCoverageState,
} from "@/features/content/topic-coverage";
import { useCourseTopicLists } from "@/features/content/use-course-topic-lists";
import type { ApiError } from "@/lib/api/error";

const NO_COURSES: readonly Course[] = [];

/** How long a typed search waits before it is applied. */
export const SEARCH_COMMIT_DELAY_MS = 300;

const fieldClass =
  "mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft";
const secondaryButton =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60";

function chip(isActive: boolean) {
  return `rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-surface hover:bg-surface-muted"
  }`;
}

function CoverageBadge({ state }: { state: TopicCoverageState }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${topicCoverageStyles[state]}`}
    >
      {topicCoverageLabels[state]}
    </span>
  );
}

function ScannedCount({ row }: { row: CoverageRow }) {
  if (row.scannedCount === null) {
    return <span className="text-muted">Bilinmiyor</span>;
  }

  // The backend's count covers every course of the subject, so a larger
  // scanned count for one course means the two were read at different
  // times. Neither number is "corrected"; the mismatch is just shown.
  if (row.scannedCount > row.backendCount) {
    return (
      <span title="Backend sayısından fazla: iki veri farklı zamanlarda okunmuş olabilir; yeniden taramak tutarlı bir görüntü verir.">
        {row.scannedCount}
        {row.scannedIncomplete ? <span aria-hidden="true">+</span> : null}
        <span aria-hidden="true" className="ml-1 text-amber-800">
          !
        </span>
        <span className="sr-only">
          {" "}
          (backend sayısıyla tutarsız; veriler farklı zamanlarda okunmuş
          olabilir)
        </span>
      </span>
    );
  }

  return row.scannedIncomplete ? (
    <span title="Bu dersin bazı listeleri taramada okunamadı; gerçek sayı daha yüksek olabilir.">
      {row.scannedCount}
      <span aria-hidden="true">+</span>
      <span className="sr-only"> (en az; bazı listeler okunamadı)</span>
    </span>
  ) : (
    <span>{row.scannedCount}</span>
  );
}

/**
 * A search box that applies itself after a short pause, not on every
 * keystroke. Its own commit coming back from the URL never overwrites what
 * is being typed; any other change (clearing the filters, back/forward) does.
 */
function SearchField({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  const [lastCommitted, setLastCommitted] = useState(value);

  if (value !== seen) {
    setSeen(value);
    if (value !== lastCommitted) {
      setDraft(value);
      setLastCommitted(value);
    }
  }

  useEffect(() => {
    if (draft.trim() === value.trim()) return;

    const timer = window.setTimeout(() => {
      setLastCommitted(draft.trim());
      onCommit(draft.trim());
    }, SEARCH_COMMIT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [draft, value, onCommit]);

  return (
    <div>
      <label className="block text-xs font-medium" htmlFor={id}>
        Ara
      </label>
      <input
        className={fieldClass}
        id={id}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Konu adı veya kodu"
        type="search"
        value={draft}
      />
    </div>
  );
}

function Legend() {
  return (
    <section
      aria-labelledby="coverage-legend-heading"
      className="rounded-lg border border-border bg-surface p-4"
    >
      <h2 className="text-sm font-semibold" id="coverage-legend-heading">
        Kapsam durumu nasıl belirleniyor?
      </h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {topicCoverageStates.map((state) => (
          <li className="flex items-center gap-1.5 text-sm" key={state}>
            <CoverageBadge state={state} />
            <span className="text-muted">{topicCoverageRanges[state]}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 max-w-prose text-xs text-muted">
        Bu bantlar uygulama içi bir sınıflandırmadır, backend&apos;in resmi bir
        metriği değildir; yayınlanabilirlik hakkında da bir şey söylemez.
        Sınıflandırma backend&apos;in konu başına verdiği soru sayısına göre
        yapılır: o sayı konunun bu branştaki tüm derslerdeki, her durumdaki
        sorularını kapsar. &quot;Bu dersin taranan sorusu&quot; ise tam taramada
        bu dersin ünitelerinde bulunan sorulardır.
      </p>
    </section>
  );
}

function SnapshotNotice({
  snapshot,
  isScanning,
  onScan,
}: {
  snapshot: ContentSnapshot | null;
  isScanning: boolean;
  onScan: () => void;
}) {
  if (snapshot !== null) {
    return (
      <p className="text-sm text-muted">
        Taranan sayılar{" "}
        <time dateTime={snapshot.generatedAt}>
          {formatScanTime(snapshot.generatedAt)}
        </time>{" "}
        tarihli tam taramadan
        {snapshot.status === "partial" ? (
          <span className="text-danger">
            {" "}
            (eksik: bazı listeler okunamadı; &quot;+&quot; ile işaretli sayılar
            en az değerlerdir)
          </span>
        ) : null}
        .
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-muted p-3">
      <p className="text-sm text-muted">
        Tam içerik taraması yapılmadı: ders başına taranan soru sayıları ve
        matris hücreleri bilinmiyor. Backend sayıları ve kapsam durumu taramasız
        da doğrudur.
      </p>
      <button
        className={secondaryButton}
        disabled={isScanning}
        onClick={onScan}
        type="button"
      >
        <ScanLine aria-hidden="true" className="size-4" />
        {isScanning ? "Tarama sürüyor…" : "Taramayı başlat"}
      </button>
    </div>
  );
}

function CoverageTable({
  rows,
  courseId,
}: {
  rows: readonly CoverageRow[];
  courseId: number;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <caption className="sr-only">Konu kapsam tablosu</caption>
        <thead className="border-b border-border text-xs text-muted">
          <tr>
            <th className="px-4 py-2 font-medium" scope="col">
              Konu
            </th>
            <th className="px-4 py-2 font-medium" scope="col">
              Üst konu
            </th>
            <th className="px-4 py-2 font-medium" scope="col">
              Sınıf
            </th>
            <th className="px-4 py-2 text-right font-medium" scope="col">
              Backend soru sayısı
            </th>
            <th className="px-4 py-2 text-right font-medium" scope="col">
              Bu dersin taranan sorusu
            </th>
            <th className="px-4 py-2 font-medium" scope="col">
              Kapsam
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.topic.id}>
              <th className="px-4 py-2 font-medium" scope="row">
                <Link
                  className="hover:text-primary hover:underline"
                  href={`/quality?course=${courseId}&topic=${row.topic.id}`}
                >
                  {row.topic.name}
                </Link>
                <span className="block text-xs font-normal text-muted">
                  {row.topic.code}
                </span>
              </th>
              <td className="px-4 py-2">
                {row.parentName ?? <span className="text-muted">—</span>}
              </td>
              <td className="px-4 py-2">
                {row.topic.grade_level === undefined ? (
                  <span className="text-muted">—</span>
                ) : (
                  `${row.topic.grade_level}. sınıf`
                )}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {row.backendCount}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                <ScannedCount row={row} />
              </td>
              <td className="px-4 py-2">
                <CoverageBadge state={row.state} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatrixTable({
  rows,
  matrix,
  caption,
}: {
  rows: readonly CoverageRow[];
  matrix: CoverageMatrix;
  caption: string;
}) {
  const hasIncomplete = matrix.columns.some((column) => column.incomplete);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b border-border text-xs text-muted">
            <tr>
              <th className="px-4 py-2 font-medium" scope="col">
                Konu
              </th>
              <th className="px-4 py-2 text-right font-medium" scope="col">
                Backend (konu geneli)
              </th>
              {matrix.columns.map((column) => (
                <th
                  className="px-4 py-2 text-right font-medium"
                  key={column.id}
                  scope="col"
                >
                  {column.label}
                  {column.incomplete ? (
                    <span title="Bu sütunun bazı listeleri taramada okunamadı">
                      {" "}
                      *
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.topic.id}>
                <th className="px-4 py-2 font-medium" scope="row">
                  {row.topic.name}
                </th>
                <td className="px-4 py-2 text-right tabular-nums">
                  {row.backendCount}
                </td>
                {matrix.columns.map((column) => {
                  const value = matrix.cell(row.topic.id, column.id);

                  return (
                    <td
                      className={`px-4 py-2 text-right tabular-nums ${value === 0 ? "text-danger" : ""}`}
                      key={column.id}
                    >
                      {value === null ? (
                        <span className="text-muted">Bilinmiyor</span>
                      ) : (
                        value
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasIncomplete ? (
        <p className="text-xs text-muted">
          * Bu sütunun bazı listeleri taramada okunamadı; sayılar eksik
          olabilir.
        </p>
      ) : null}
    </div>
  );
}

function CourseMatrix({
  rows,
  courses,
  selected,
  snapshot,
}: {
  rows: readonly CoverageRow[];
  courses: readonly Course[];
  selected: CourseTopicsData;
  snapshot: ContentSnapshot | null;
}) {
  const ids = useMemo(() => courses.map((course) => course.id), [courses]);
  const lists = useCourseTopicLists(ids);
  const subjectCourses = useMemo(() => {
    const sameSubject = new Set(
      lists.lists
        .filter((list) => list.subject_id === selected.subject_id)
        .map((list) => list.course.id),
    );
    sameSubject.add(selected.course.id);

    return courses.filter((course) => sameSubject.has(course.id));
  }, [courses, lists.lists, selected]);
  const matrix = useMemo(
    () => buildCourseMatrix(subjectCourses, snapshot),
    [subjectCourses, snapshot],
  );

  return (
    <div className="space-y-3">
      <p className="max-w-prose text-xs text-muted">
        Sütunlar bu konuları paylaşan derslerdir (aynı branş). Hücre, tam
        taramada o dersin ünitelerinde bu konuya ait bulunan soru sayısıdır.
        Backend&apos;in konu sayısı derslere bölünmez; tarama yoksa hücreler
        bilinmiyor.
      </p>
      {lists.isLoading ? (
        <p aria-busy="true" aria-live="polite" className="text-sm text-muted">
          Aynı branştaki dersler belirleniyor…
        </p>
      ) : null}
      {lists.failedCourseIds.length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg border border-danger/30 bg-danger/5 p-3"
          role="alert"
        >
          <p className="text-sm text-danger">
            {lists.failedCourseIds.length} dersin konu listesi okunamadı; bu
            dersler matriste eksik olabilir.
          </p>
          <button
            className={secondaryButton}
            onClick={lists.retry}
            type="button"
          >
            Tekrar dene
          </button>
        </div>
      ) : null}
      <div className="flex justify-end">
        <ExportCsvButton
          columns={matrixCsvColumns(matrix)}
          filename={`kapsam-matrisi-ders-${selected.course.id}.csv`}
          label="Matrisi CSV indir"
          rows={rows}
        />
      </div>
      <MatrixTable caption="Konu × ders matrisi" matrix={matrix} rows={rows} />
    </div>
  );
}

function ScopeMatrix({
  rows,
  courses,
  selected,
  snapshot,
}: {
  rows: readonly CoverageRow[];
  courses: readonly Course[];
  selected: CourseTopicsData;
  snapshot: ContentSnapshot | null;
}) {
  const matrix = useMemo(() => {
    const course = courses.filter((item) => item.id === selected.course.id);
    const topicIds = new Set(selected.topics.map((topic) => topic.id));

    return buildScopeMatrix(matrixScopes(topicIds, course, snapshot), snapshot);
  }, [courses, selected, snapshot]);

  return (
    <div className="space-y-3">
      <p className="max-w-prose text-xs text-muted">
        Hücre, tam taramada bu konuya ait olup o sınav kapsamını taşıyan soru
        sayısıdır. Bir soru birden çok kapsamda olabildiği için satır toplamı
        backend sayısına eşit olmak zorunda değildir. Backend kapsam başına konu
        sayısı vermez; tarama yoksa hücreler bilinmiyor.
      </p>
      <div className="flex justify-end">
        <ExportCsvButton
          columns={matrixCsvColumns(matrix)}
          filename={`kapsam-matrisi-sinav-${selected.course.id}.csv`}
          label="Matrisi CSV indir"
          rows={rows}
        />
      </div>
      <MatrixTable
        caption="Konu × sınav kapsamı matrisi"
        matrix={matrix}
        rows={rows}
      />
    </div>
  );
}

const modeLabels: Readonly<Record<CoverageMode, string>> = {
  table: "Tablo",
  course: "Konu × Ders",
  scope: "Konu × Sınav kapsamı",
};

export type CoverageCenterProps = Readonly<{
  state: CoverageState;
  onChange: (next: CoverageState) => void;
}>;

/**
 * Where content is thin or missing, topic by topic. Topic counts come from
 * the existing topics endpoint (one request for the selected course);
 * per-course and per-scope figures come only from the session's full-scan
 * snapshot and are shown as unknown without one.
 */
export function CoverageCenter({ state, onChange }: CoverageCenterProps) {
  const router = useRouter();
  const scan = useContentScan();
  const snapshot = scan.state.snapshot;
  const coursesQuery = useQuery<Course[], ApiError>(coursesQueryOptions());
  const courses = coursesQuery.data ?? NO_COURSES;
  const courseId =
    state.courseId !== undefined &&
    courses.some((course) => course.id === state.courseId)
      ? state.courseId
      : courses[0]?.id;

  const topicsQuery = useQuery<CourseTopicsData, ApiError>({
    ...courseTopicsQueryOptions(courseId ?? 0),
    enabled: courseId !== undefined,
  });

  const isSessionExpired =
    coursesQuery.error?.kind === "authentication" ||
    topicsQuery.error?.kind === "authentication";

  useEffect(() => {
    if (isSessionExpired) {
      router.replace("/login");
      router.refresh();
    }
  }, [isSessionExpired, router]);

  const rows = useMemo(
    () =>
      topicsQuery.data === undefined
        ? []
        : buildCoverageRows(topicsQuery.data, snapshot),
    [topicsQuery.data, snapshot],
  );
  const counts = useMemo(() => countByCoverageState(rows), [rows]);
  const grades = useMemo(() => gradeOptions(rows), [rows]);
  const parents = useMemo(() => parentOptions(rows), [rows]);
  const visible = useMemo(
    () => sortCoverageRows(applyCoverageFilters(rows, state), state.sort),
    [rows, state],
  );

  const commitQuery = useCallback(
    (query: string) => onChange({ ...state, query }),
    [onChange, state],
  );

  const set = (patch: Partial<CoverageState>) =>
    onChange({ ...state, ...patch });
  const hasFilters =
    state.view !== "all" ||
    state.grade !== undefined ||
    state.parent !== undefined ||
    state.query !== "";

  if (coursesQuery.isPending || isSessionExpired) {
    return (
      <div aria-busy="true" aria-live="polite" className="space-y-3">
        <p className="sr-only">Kapsam verileri yükleniyor.</p>
        <div className="h-24 animate-pulse rounded-lg border border-border bg-surface" />
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
            onClick={() => {
              void coursesQuery.refetch();
            }}
            type="button"
          >
            {coursesQuery.isFetching ? "Deneniyor…" : "Tekrar dene"}
          </button>
        )}
      </div>
    );
  }

  if (courses.length === 0 || courseId === undefined) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">Henüz ders bulunmuyor.</h2>
      </div>
    );
  }

  const course = courses.find((item) => item.id === courseId);

  function body() {
    if (topicsQuery.isPending) {
      return (
        <p aria-busy="true" aria-live="polite" className="text-sm text-muted">
          Konular yükleniyor…
        </p>
      );
    }

    if (topicsQuery.isError) {
      return (
        <div
          className="rounded-lg border border-border bg-surface p-4"
          role="alert"
        >
          <p className="text-sm font-medium">Konular yüklenemedi</p>
          <p className="mt-1 text-sm text-muted">{topicsQuery.error.message}</p>
          <button
            className={`${secondaryButton} mt-3`}
            disabled={topicsQuery.isFetching}
            onClick={() => {
              void topicsQuery.refetch();
            }}
            type="button"
          >
            Tekrar dene
          </button>
        </div>
      );
    }

    if (rows.length === 0) {
      return (
        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="text-sm text-muted">Bu dersin branşında konu yok.</p>
        </div>
      );
    }

    if (visible.length === 0) {
      return (
        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="text-sm font-semibold">
            Bu filtrelerle eşleşen konu bulunmuyor.
          </p>
          <button
            className={`${secondaryButton} mt-3`}
            onClick={() =>
              set({
                view: "all",
                grade: undefined,
                parent: undefined,
                query: "",
              })
            }
            type="button"
          >
            Filtreleri temizle
          </button>
        </div>
      );
    }

    if (state.mode === "course") {
      return (
        <CourseMatrix
          courses={courses}
          rows={visible}
          selected={topicsQuery.data}
          snapshot={snapshot}
        />
      );
    }

    if (state.mode === "scope") {
      return (
        <ScopeMatrix
          courses={courses}
          rows={visible}
          selected={topicsQuery.data}
          snapshot={snapshot}
        />
      );
    }

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p aria-live="polite" className="text-sm text-muted">
            <strong className="text-foreground">{visible.length}</strong> /{" "}
            {rows.length} konu
          </p>
          <ExportCsvButton
            columns={coverageCsvColumns(course?.name ?? "")}
            filename={`kapsam-${course?.code ?? courseId}.csv`}
            rows={visible}
          />
        </div>
        <CoverageTable courseId={courseId} rows={visible} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section aria-label="Ders ve veri" className="space-y-3">
        <div className="max-w-sm">
          <label
            className="block text-xs font-medium"
            htmlFor="coverage-course"
          >
            Ders
          </label>
          <select
            className={fieldClass}
            id="coverage-course"
            onChange={(event) =>
              // Topic ids belong to a subject: a new course drops the
              // grade and parent picks.
              set({
                courseId: Number(event.target.value),
                grade: undefined,
                parent: undefined,
              })
            }
            value={courseId}
          >
            {courses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <SnapshotNotice
          isScanning={scan.state.run !== null}
          onScan={() => scan.start()}
          snapshot={snapshot}
        />
      </section>

      <Legend />

      {rows.length === 0 ? null : (
        <dl
          aria-label="Kapsam özeti"
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {topicCoverageStates.map((item: TopicCoverageState) => (
            <div
              className="rounded-lg border border-border bg-surface p-4"
              key={item}
            >
              <dt className="text-sm text-muted">
                {topicCoverageLabels[item]} ({topicCoverageRanges[item]})
              </dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight">
                {counts[item]}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <section aria-labelledby="coverage-filters-heading" className="space-y-3">
        <h2 className="text-sm font-semibold" id="coverage-filters-heading">
          Görünüm
        </h2>
        <div
          aria-label="Gösterim"
          className="flex flex-wrap gap-2"
          role="group"
        >
          {(["table", "course", "scope"] as const).map((mode) => (
            <button
              aria-pressed={state.mode === mode}
              className={chip(state.mode === mode)}
              key={mode}
              onClick={() => set({ mode })}
              type="button"
            >
              {modeLabels[mode]}
            </button>
          ))}
        </div>
        <div
          aria-label="Kapsam filtresi"
          className="flex flex-wrap gap-2"
          role="group"
        >
          {coverageViews.map((view) => (
            <button
              aria-pressed={state.view === view}
              className={chip(state.view === view)}
              key={view}
              onClick={() => set({ view })}
              type="button"
            >
              {coverageViewLabels[view]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
          <SearchField onCommit={commitQuery} value={state.query} />
          <div>
            <label
              className="block text-xs font-medium"
              htmlFor="coverage-grade"
            >
              Sınıf düzeyi
            </label>
            <select
              className={fieldClass}
              id="coverage-grade"
              onChange={(event) => {
                const value = event.target.value;
                set({
                  grade:
                    value === ""
                      ? undefined
                      : value === "none"
                        ? "none"
                        : Number(value),
                });
              }}
              value={state.grade === undefined ? "" : String(state.grade)}
            >
              <option value="">Tümü</option>
              {grades.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}. sınıf
                </option>
              ))}
              <option value="none">Belirtilmemiş</option>
            </select>
          </div>
          <div>
            <label
              className="block text-xs font-medium"
              htmlFor="coverage-parent"
            >
              Üst konu
            </label>
            <select
              className={fieldClass}
              id="coverage-parent"
              onChange={(event) => {
                const value = event.target.value;
                set({
                  parent:
                    value === ""
                      ? undefined
                      : value === "root"
                        ? "root"
                        : Number(value),
                });
              }}
              value={state.parent === undefined ? "" : String(state.parent)}
            >
              <option value="">Tümü</option>
              <option value="root">Üst konusu olmayanlar</option>
              {parents.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="block text-xs font-medium"
              htmlFor="coverage-sort"
            >
              Sırala
            </label>
            <select
              className={fieldClass}
              id="coverage-sort"
              onChange={(event) =>
                set({ sort: event.target.value as CoverageSort })
              }
              value={state.sort}
            >
              {coverageSorts.map((sort) => (
                <option key={sort} value={sort}>
                  {coverageSortLabels[sort]}
                </option>
              ))}
            </select>
          </div>
        </div>
        {hasFilters ? (
          <button
            className={secondaryButton}
            onClick={() =>
              set({
                view: "all",
                grade: undefined,
                parent: undefined,
                query: "",
              })
            }
            type="button"
          >
            Filtreleri temizle
          </button>
        ) : null}
      </section>

      {body()}
    </div>
  );
}
