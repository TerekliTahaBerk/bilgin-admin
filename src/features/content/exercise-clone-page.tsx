"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Copy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";

import type {
  Course,
  Unit,
  UnitExercisesData,
} from "@/contracts/admin/content";
import type {
  CourseTopicsData,
  ExerciseDetail,
} from "@/contracts/admin/exercise-editor";
import { createExercise } from "@/features/content/content-client";
import { exerciseEditorHref } from "@/features/content/content-links";
import {
  courseScopeLabels,
  exerciseTypeLabels,
} from "@/features/content/content-labels";
import {
  courseTopicsQueryKey,
  courseTopicsQueryOptions,
  courseUnitsQueryKey,
  courseUnitsQueryOptions,
  coursesQueryOptions,
  exerciseDetailQueryOptions,
  unitExercisesQueryOptions,
  unitExercisesQueryPrefix,
} from "@/features/content/content-queries";
import { EditorAccessDenied } from "@/features/content/exercise-editor";
import {
  buildClonePayload,
  cloneErrorMessage,
  isClonable,
} from "@/features/content/exercise-clone";
import { recordExerciseEdit } from "@/features/content/exercise-history";
import { StatusBadge } from "@/features/content/status-badges";
import { toApiError, type ApiError } from "@/lib/api/error";

const primaryButton =
  "inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60";
const fieldClass =
  "mt-1 block w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm";

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const id = useId();

  return (
    <section
      aria-labelledby={id}
      className="rounded-lg border border-border bg-surface p-4 sm:p-5"
    >
      <h2 className="text-sm font-semibold" id={id}>
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-0.5 py-1.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function QueryFailure({
  title,
  error,
  onRetry,
  isRetrying,
}: {
  title: string;
  error: ApiError;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  return (
    <div className="text-sm" role="alert">
      <p className="font-medium">{title}</p>
      <p className="text-muted">{error.message}</p>
      {error.kind === "authorization" ? null : (
        <button
          className={`${secondaryButton} mt-2 px-3 py-1.5`}
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

export type ExerciseClonePageProps = Readonly<{
  canEdit: boolean;
  courseId: number;
  unitId: number;
  exerciseId: number;
}>;

/**
 * Soruyu çoğalt: the source is read, a target course/unit/topic is chosen,
 * a summary is shown, and only "Taslak kopyayı oluştur" creates the new
 * (draft) question — then the editor opens on it. The source is never
 * written to.
 */
export function ExerciseClonePage({
  canEdit,
  courseId,
  unitId,
  exerciseId,
}: ExerciseClonePageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const ids = {
    course: useId(),
    unit: useId(),
    topic: useId(),
  };

  // Explicit choices; `null` means "the default for the current target".
  const [chosenCourseId, setChosenCourseId] = useState<number | null>(null);
  const [chosenUnitId, setChosenUnitId] = useState<number | null>(null);
  const [chosenTopicId, setChosenTopicId] = useState<number | null>(null);

  const detailQuery = useQuery<ExerciseDetail, ApiError>({
    ...exerciseDetailQueryOptions(exerciseId),
    enabled: canEdit,
  });
  const coursesQuery = useQuery<Course[], ApiError>({
    ...coursesQueryOptions(),
    enabled: canEdit,
  });
  // The source list gives the backend's own preview text for the question.
  const sourceListQuery = useQuery<UnitExercisesData, ApiError>({
    ...unitExercisesQueryOptions(unitId, {}),
    enabled: canEdit,
  });
  const sourceTopicsQuery = useQuery<CourseTopicsData, ApiError>({
    ...courseTopicsQueryOptions(courseId),
    enabled: canEdit,
  });

  const targetCourseId = chosenCourseId ?? courseId;
  const targetUnitsQuery = useQuery<Unit[], ApiError>({
    ...courseUnitsQueryOptions(targetCourseId),
    enabled: canEdit,
  });
  const targetTopicsQuery = useQuery<CourseTopicsData, ApiError>({
    ...courseTopicsQueryOptions(targetCourseId),
    enabled: canEdit,
  });

  const createMutation = useMutation({
    mutationFn: createExercise,
    retry: 0,
  });

  const isSessionExpired = [
    detailQuery.error,
    coursesQuery.error,
    targetUnitsQuery.error,
    targetTopicsQuery.error,
    createMutation.error === null ? null : toApiError(createMutation.error),
  ].some((error) => error?.kind === "authentication");

  useEffect(() => {
    if (isSessionExpired) {
      router.replace("/login");
      router.refresh();
    }
  }, [isSessionExpired, router]);

  const detail = detailQuery.data;
  const courses = coursesQuery.data ?? [];
  const sourceCourse = courses.find((course) => course.id === courseId);
  const targetCourse = courses.find((course) => course.id === targetCourseId);
  const targetUnits = useMemo(
    () =>
      (targetUnitsQuery.data ?? []).filter(
        (unit) => unit.status !== "archived",
      ),
    [targetUnitsQuery.data],
  );
  const targetTopics = targetTopicsQuery.data?.topics ?? [];

  const targetUnitId =
    (chosenUnitId !== null &&
    targetUnits.some((unit) => unit.id === chosenUnitId)
      ? chosenUnitId
      : null) ??
    (targetCourseId === courseId &&
    targetUnits.some((unit) => unit.id === unitId)
      ? unitId
      : null);
  const targetUnit = targetUnits.find((unit) => unit.id === targetUnitId);

  const sourceTopicId = detail?.topic_id ?? null;
  const sourceTopicAvailable =
    sourceTopicId !== null &&
    targetTopics.some((topic) => topic.id === sourceTopicId);
  const targetTopicId =
    (chosenTopicId !== null &&
    targetTopics.some((topic) => topic.id === chosenTopicId)
      ? chosenTopicId
      : null) ?? (sourceTopicAvailable ? sourceTopicId : null);
  const targetTopic = targetTopics.find((topic) => topic.id === targetTopicId);

  const sourceTopicName =
    sourceTopicsQuery.data?.topics.find((topic) => topic.id === sourceTopicId)
      ?.name ?? (sourceTopicId === null ? "—" : `Konu #${sourceTopicId}`);
  const sourcePreview = sourceListQuery.data?.exercises.find(
    (exercise) => exercise.id === exerciseId,
  )?.preview;

  // Topics belong to a subject; the topic lists say which.
  const sameSubject =
    sourceTopicsQuery.data === undefined || targetTopicsQuery.data === undefined
      ? null
      : sourceTopicsQuery.data.subject_id === targetTopicsQuery.data.subject_id;

  const payload =
    detail === undefined || targetUnitId === null || targetTopicId === null
      ? null
      : buildClonePayload(detail, {
          unitId: targetUnitId,
          topicId: targetTopicId,
        });

  if (!canEdit) return <EditorAccessDenied />;

  if (isSessionExpired) {
    return (
      <p aria-busy="true" className="text-sm text-muted" role="status">
        Oturum yenileniyor…
      </p>
    );
  }

  const header = (
    <header className="border-b border-border pb-5">
      <Link
        className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-foreground"
        href={exerciseEditorHref(courseId, unitId, exerciseId)}
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Soruya dön
      </Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">
        Soruyu çoğalt
      </h1>
      <p className="mt-1.5 max-w-prose text-sm text-muted">
        Soru yeni bir taslak olarak kopyalanır; kaynak soru değişmez. Hedef
        ders, ünite ve konuyu seçin, özeti kontrol edip onaylayın.
      </p>
    </header>
  );

  if (detailQuery.isPending || coursesQuery.isPending) {
    return (
      <div className="space-y-6">
        {header}
        <p aria-busy="true" className="text-sm text-muted" role="status">
          Soru yükleniyor…
        </p>
      </div>
    );
  }

  if (detailQuery.isError || coursesQuery.isError) {
    const error = detailQuery.error ?? coursesQuery.error;
    return (
      <div className="space-y-6">
        {header}
        <div className="rounded-lg border border-border bg-surface p-6">
          <QueryFailure
            error={error!}
            isRetrying={detailQuery.isFetching || coursesQuery.isFetching}
            onRetry={() => {
              void detailQuery.refetch();
              void coursesQuery.refetch();
            }}
            title={
              error?.kind === "not_found"
                ? "Soru bulunamadı"
                : "Soru yüklenemedi"
            }
          />
        </div>
      </div>
    );
  }

  const loadedDetail = detailQuery.data;

  if (!isClonable(loadedDetail)) {
    return (
      <div className="space-y-6">
        {header}
        <div
          className="rounded-lg border border-border bg-surface p-6"
          role="alert"
        >
          <p className="text-sm font-medium">Bu soru kopyalanamıyor.</p>
          <p className="mt-1 text-sm text-muted">
            Türü veya içeriği editörde açılamıyor. Kopya, editörün
            kaydedebileceği biçimde oluşturulmak zorunda.
          </p>
        </div>
      </div>
    );
  }

  const isCreating = createMutation.isPending || createMutation.isSuccess;
  const createError =
    createMutation.error === null ? null : toApiError(createMutation.error);
  const failure =
    createError === null || createError.kind === "authentication"
      ? null
      : cloneErrorMessage(createError);
  const scopesText =
    loadedDetail.applicable_scopes
      .map((scope) => courseScopeLabels[scope])
      .join(", ") || "—";
  const scopeMissingTarget =
    targetCourse !== undefined &&
    !loadedDetail.applicable_scopes.includes(targetCourse.scope);

  async function create() {
    if (payload === null || !payload.ok || isCreating) return;

    try {
      const created = await createMutation.mutateAsync(payload.payload);
      const target = {
        courseId: targetCourseId,
        unitId: payload.payload.owner_unit_id,
      };

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: unitExercisesQueryPrefix(target.unitId),
        }),
        queryClient.invalidateQueries({
          queryKey: courseUnitsQueryKey(target.courseId),
        }),
        queryClient.invalidateQueries({
          queryKey: courseTopicsQueryKey(target.courseId),
        }),
      ]);
      recordExerciseEdit({
        exerciseId: created.id,
        courseId: target.courseId,
        unitId: target.unitId,
        label: `${targetCourse?.name ?? "Ders"} · ${targetUnit?.title ?? "Ünite"}`,
        editedAt: Date.now(),
      });
      router.push(
        exerciseEditorHref(target.courseId, target.unitId, created.id),
      );
    } catch {
      // The mutation holds the error; the page renders it.
    }
  }

  return (
    <div className="space-y-6">
      {header}

      <Panel title="Kaynak soru">
        <dl>
          <Row label="Soru">
            <span className="font-medium">
              {sourcePreview ?? `Soru #${exerciseId}`}
            </span>
            <span className="ml-2 text-xs text-muted">#{exerciseId}</span>
          </Row>
          <Row label="Konum">
            {sourceCourse?.name ?? `Ders #${courseId}`}
            {sourceListQuery.data === undefined
              ? null
              : ` › ${sourceListQuery.data.unit.title}`}
          </Row>
          <Row label="Tür">{exerciseTypeLabels[loadedDetail.type]}</Row>
          <Row label="Konu">{sourceTopicName}</Row>
          <Row label="Durum">
            <span className="inline-flex items-center gap-2">
              <StatusBadge status={loadedDetail.status} />
              <span className="text-xs text-muted">
                sürüm {loadedDetail.version}
              </span>
            </span>
          </Row>
        </dl>
      </Panel>

      <Panel title="Hedef">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="text-xs font-medium" htmlFor={ids.course}>
              Ders
            </label>
            <select
              className={fieldClass}
              disabled={isCreating}
              id={ids.course}
              onChange={(event) => {
                // Units and topics belong to a course: a new course starts
                // both over from its own defaults.
                setChosenCourseId(Number(event.target.value));
                setChosenUnitId(null);
                setChosenTopicId(null);
                createMutation.reset();
              }}
              value={targetCourseId}
            >
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium" htmlFor={ids.unit}>
              Ünite
            </label>
            {targetUnitsQuery.isError ? (
              <QueryFailure
                error={targetUnitsQuery.error}
                isRetrying={targetUnitsQuery.isFetching}
                onRetry={() => void targetUnitsQuery.refetch()}
                title="Üniteler yüklenemedi"
              />
            ) : (
              <select
                aria-busy={targetUnitsQuery.isPending}
                className={fieldClass}
                disabled={isCreating || targetUnitsQuery.isPending}
                id={ids.unit}
                onChange={(event) => {
                  setChosenUnitId(
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                  );
                  createMutation.reset();
                }}
                value={targetUnitId ?? ""}
              >
                <option value="">
                  {targetUnitsQuery.isPending
                    ? "Yükleniyor…"
                    : targetUnits.length === 0
                      ? "Bu derste ünite yok"
                      : "Ünite seçin"}
                </option>
                {targetUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="text-xs font-medium" htmlFor={ids.topic}>
              Konu
            </label>
            {targetTopicsQuery.isError ? (
              <QueryFailure
                error={targetTopicsQuery.error}
                isRetrying={targetTopicsQuery.isFetching}
                onRetry={() => void targetTopicsQuery.refetch()}
                title="Konular yüklenemedi"
              />
            ) : (
              <select
                aria-busy={targetTopicsQuery.isPending}
                aria-describedby={`${ids.topic}-hint`}
                className={fieldClass}
                disabled={isCreating || targetTopicsQuery.isPending}
                id={ids.topic}
                onChange={(event) => {
                  setChosenTopicId(
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                  );
                  createMutation.reset();
                }}
                value={targetTopicId ?? ""}
              >
                <option value="">
                  {targetTopicsQuery.isPending ? "Yükleniyor…" : "Konu seçin"}
                </option>
                {targetTopics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="mt-3 space-y-1.5 text-xs" id={`${ids.topic}-hint`}>
          <p className="text-muted">
            Konular yalnızca hedef dersin branşından listelenir; backend yine de
            konu–ders uyumunu ayrıca doğrular.
          </p>
          {sameSubject === false ? (
            <p className="text-amber-800">
              Hedef ders farklı bir branşta: kaynak sorunun konusu burada yok,
              bu branştan bir konu seçin.
            </p>
          ) : sameSubject === true &&
            !sourceTopicAvailable &&
            !targetTopicsQuery.isPending ? (
            <p className="text-amber-800">
              Kaynak konu hedef dersin güncel konu listesinde yok; bir konu
              seçin.
            </p>
          ) : null}
        </div>
      </Panel>

      <Panel title="Özet">
        <dl>
          <Row label="Oluşturulacak">
            Yeni bir <strong className="font-medium">taslak</strong> soru
            (backend her yeni soruyu taslak olarak oluşturur)
          </Row>
          <Row label="Hedef">
            {targetCourse?.name ?? "—"} ›{" "}
            {targetUnit?.title ?? (
              <span className="text-amber-800">ünite seçilmedi</span>
            )}
          </Row>
          <Row label="Konu">
            {targetTopic?.name ?? (
              <span className="text-amber-800">konu seçilmedi</span>
            )}
          </Row>
          <Row label="Kopyalanan">
            Tür ({exerciseTypeLabels[loadedDetail.type]}), içerik, cevap
            anahtarı, açıklama (
            {loadedDetail.explanation === null ||
            loadedDetail.explanation.trim() === ""
              ? "yok"
              : "var"}
            ), zorluk {loadedDetail.difficulty}, kapsamlar ({scopesText})
          </Row>
          <Row label="Kopyalanmayan">
            Kimlik, durum, sürüm ve istatistikler (yeni soru sürüm 1 ile,
            istatistiksiz başlar)
          </Row>
        </dl>
        {scopeMissingTarget ? (
          <p className="mt-2 text-xs text-amber-800">
            Kopyalanan kapsamlar hedef dersin kapsamını (
            {courseScopeLabels[targetCourse.scope]}) içermiyor. Gerekirse
            kopyayı oluşturduktan sonra editörde kapsamları güncelleyin.
          </p>
        ) : null}
        {payload !== null && !payload.ok ? (
          <p className="mt-3 text-sm text-danger" role="alert">
            {payload.reason}
          </p>
        ) : null}
      </Panel>

      {failure === null ? null : (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3"
          role="alert"
        >
          <p className="text-sm font-medium text-red-900">{failure.title}</p>
          {failure.details.length === 0 ? null : (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-red-800">
              {failure.details.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          className={primaryButton}
          disabled={payload === null || !payload.ok || isCreating}
          onClick={() => void create()}
          type="button"
        >
          <Copy aria-hidden="true" className="size-4" />
          {createMutation.isPending
            ? "Oluşturuluyor…"
            : createMutation.isSuccess
              ? "Editör açılıyor…"
              : "Taslak kopyayı oluştur"}
        </button>
        <Link
          className={secondaryButton}
          href={exerciseEditorHref(courseId, unitId, exerciseId)}
        >
          Vazgeç
        </Link>
        {payload === null ? (
          <span className="text-xs text-muted">
            Devam etmek için ünite ve konu seçin.
          </span>
        ) : null}
      </div>
    </div>
  );
}
