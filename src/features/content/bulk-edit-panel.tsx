"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import {
  courseScopes,
  type CourseScope,
  type ExerciseListItem,
  type Unit,
} from "@/contracts/admin/content";
import type { CourseTopicsData } from "@/contracts/admin/exercise-editor";
import {
  BULK_EDIT_CONCURRENCY,
  bulkEditKindLabels,
  bulkEditKinds,
  bulkErrorMessage,
  changeLabel,
  currentValues,
  planBulkEdit,
  retryItems,
  runBulkEdit,
  scopeEditModeLabels,
  scopeEditModes,
  type BulkEditChange,
  type BulkEditKind,
  type BulkItem,
  type BulkPlan,
  type BulkProgress,
  type BulkRunResult,
  type ScopeEditMode,
} from "@/features/content/bulk-edit";
import { updateExerciseMetadata } from "@/features/content/content-client";
import {
  courseScopeLabels,
  publishStatusLabels,
} from "@/features/content/content-labels";
import {
  courseTopicsQueryKey,
  courseTopicsQueryOptions,
  courseUnitsQueryKey,
  exerciseDetailQueryKey,
  nodePreviewQueryPrefix,
  unitExercisesQueryPrefix,
  unitNodesQueryKey,
} from "@/features/content/content-queries";
import { archiveExercise } from "@/features/workflows/workflow-client";
import type { ApiError } from "@/lib/api/error";

const primaryButton =
  "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const dangerButton =
  "inline-flex items-center gap-1.5 rounded-md bg-danger px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60";
const fieldClass =
  "mt-1 block w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm sm:max-w-sm";

type Draft = Readonly<{
  topicId: number | null;
  difficulty: number | null;
  scopeMode: ScopeEditMode;
  scopes: readonly CourseScope[];
  unitId: number | null;
}>;

const EMPTY_DRAFT: Draft = {
  topicId: null,
  difficulty: null,
  scopeMode: "replace",
  scopes: [],
  unitId: null,
};

type Run = Readonly<{
  change: BulkEditChange;
  /** The selection as it was confirmed; later list changes do not alter it. */
  exercises: readonly ExerciseListItem[];
  plan: BulkPlan;
  /** Items of the round in progress or last finished. */
  items: readonly BulkItem[];
  /** Ids that succeeded in any round so far — never sent again. */
  succeeded: readonly number[];
  progress: BulkProgress | null;
  result: BulkRunResult | null;
}>;

type Step =
  | Readonly<{ name: "edit"; kind: BulkEditKind }>
  | Readonly<{
      name: "review";
      kind: BulkEditKind;
      change: BulkEditChange;
      exercises: readonly ExerciseListItem[];
    }>
  | Readonly<{ name: "run"; kind: BulkEditKind; run: Run }>;

function buildChange(
  kind: BulkEditKind,
  draft: Draft,
  topics: CourseTopicsData | undefined,
  units: readonly Unit[],
): BulkEditChange | null {
  switch (kind) {
    case "topic": {
      const topic = topics?.topics.find((item) => item.id === draft.topicId);
      return topic === undefined
        ? null
        : { kind, topicId: topic.id, topicName: topic.name };
    }
    case "difficulty":
      return draft.difficulty === null
        ? null
        : { kind, difficulty: draft.difficulty };
    case "scopes":
      return draft.scopes.length === 0
        ? null
        : { kind, mode: draft.scopeMode, scopes: draft.scopes };
    case "unit": {
      const unit = units.find((item) => item.id === draft.unitId);
      return unit === undefined
        ? null
        : { kind, unitId: unit.id, unitTitle: unit.title };
    }
    case "archive":
      return { kind };
  }
}

function previewOf(exercises: readonly ExerciseListItem[], id: number) {
  return exercises.find((exercise) => exercise.id === id)?.preview ?? `#${id}`;
}

function CurrentValuesList({
  exercises,
  kind,
  unitTitle,
}: {
  exercises: readonly ExerciseListItem[];
  kind: BulkEditKind;
  unitTitle: string;
}) {
  const current = currentValues(
    exercises,
    kind,
    unitTitle,
    (status) => publishStatusLabels[status],
  );

  return (
    <div>
      <dt className="text-xs text-muted">
        {kind === "archive" ? "Mevcut durumlar" : "Mevcut değerler"}
      </dt>
      <dd className="mt-0.5 text-sm">
        {current.mixed ? (
          <>
            <span className="font-medium text-amber-800">
              Karışık ({current.values.length} farklı değer)
            </span>
            <ul className="mt-1 space-y-0.5 text-xs text-muted">
              {current.values.map((value) => (
                <li key={value.label}>
                  {value.label} · {value.count} soru
                </li>
              ))}
            </ul>
          </>
        ) : (
          <span className="font-medium">
            Hepsi aynı: {current.values[0]?.label ?? "—"}
          </span>
        )}
      </dd>
    </div>
  );
}

function EditFields({
  kind,
  draft,
  onDraft,
  topicsQuery,
  targetUnits,
}: {
  kind: BulkEditKind;
  draft: Draft;
  onDraft: (next: Draft) => void;
  topicsQuery: ReturnType<typeof useQuery<CourseTopicsData, ApiError>>;
  targetUnits: readonly Unit[];
}) {
  const fieldId = useId();

  switch (kind) {
    case "topic":
      if (topicsQuery.isPending) {
        return (
          <p aria-busy="true" className="text-sm text-muted">
            Konular yükleniyor…
          </p>
        );
      }
      if (topicsQuery.isError) {
        return (
          <div className="text-sm" role="alert">
            <p className="font-medium">Konular yüklenemedi</p>
            <p className="text-muted">{topicsQuery.error.message}</p>
            <button
              className={`${secondaryButton} mt-2`}
              disabled={topicsQuery.isFetching}
              onClick={() => void topicsQuery.refetch()}
              type="button"
            >
              {topicsQuery.isFetching ? "Deneniyor…" : "Tekrar dene"}
            </button>
          </div>
        );
      }
      return (
        <div>
          <label className="text-xs font-medium" htmlFor={fieldId}>
            Yeni konu
          </label>
          <select
            className={fieldClass}
            id={fieldId}
            onChange={(event) =>
              onDraft({
                ...draft,
                topicId:
                  event.target.value === "" ? null : Number(event.target.value),
              })
            }
            value={draft.topicId ?? ""}
          >
            <option value="">Konu seçin</option>
            {topicsQuery.data.topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">
            Yalnızca bu dersin branşındaki konular listelenir; başka branşın
            konusu soruların konu istatistiğini bozar.
          </p>
        </div>
      );
    case "difficulty":
      return (
        <fieldset>
          <legend className="text-xs font-medium">Yeni zorluk</legend>
          <div className="mt-1.5 flex flex-wrap gap-3">
            {[1, 2, 3, 4, 5].map((level) => (
              <label className="flex items-center gap-1.5 text-sm" key={level}>
                <input
                  checked={draft.difficulty === level}
                  name={`${fieldId}-difficulty`}
                  onChange={() => onDraft({ ...draft, difficulty: level })}
                  type="radio"
                />
                {level}
              </label>
            ))}
          </div>
        </fieldset>
      );
    case "scopes":
      return (
        <div className="space-y-3">
          <fieldset>
            <legend className="text-xs font-medium">İşlem</legend>
            <div className="mt-1.5 flex flex-wrap gap-3">
              {scopeEditModes.map((mode) => (
                <label className="flex items-center gap-1.5 text-sm" key={mode}>
                  <input
                    checked={draft.scopeMode === mode}
                    name={`${fieldId}-mode`}
                    onChange={() => onDraft({ ...draft, scopeMode: mode })}
                    type="radio"
                  />
                  {scopeEditModeLabels[mode]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-xs font-medium">Kapsamlar</legend>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-2">
              {courseScopes.map((scope) => (
                <label
                  className="flex items-center gap-1.5 text-sm"
                  key={scope}
                >
                  <input
                    checked={draft.scopes.includes(scope)}
                    onChange={(event) =>
                      onDraft({
                        ...draft,
                        scopes: event.target.checked
                          ? [...draft.scopes, scope]
                          : draft.scopes.filter((item) => item !== scope),
                      })
                    }
                    type="checkbox"
                  />
                  {courseScopeLabels[scope]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      );
    case "unit":
      if (targetUnits.length === 0) {
        return (
          <p className="text-sm text-muted">
            Bu derste taşınabilecek başka ünite yok.
          </p>
        );
      }
      return (
        <div>
          <label className="text-xs font-medium" htmlFor={fieldId}>
            Hedef ünite
          </label>
          <select
            className={fieldClass}
            id={fieldId}
            onChange={(event) =>
              onDraft({
                ...draft,
                unitId:
                  event.target.value === "" ? null : Number(event.target.value),
              })
            }
            value={draft.unitId ?? ""}
          >
            <option value="">Ünite seçin</option>
            {targetUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.title}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">
            Yalnızca aynı dersin üniteleri listelenir: backend, ünite
            değişikliğinde sorunun dersini güncellemez.
          </p>
        </div>
      );
    case "archive":
      return null;
  }
}

function Review({
  step,
  plan,
  unitTitle,
  onBack,
  onConfirm,
}: {
  step: Extract<Step, { name: "review" }>;
  plan: BulkPlan;
  unitTitle: string;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const isArchive = step.kind === "archive";
  const count = plan.items.length;

  return (
    <div className="space-y-3">
      <dl className="grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">Etkilenecek soru</dt>
          <dd className="mt-0.5 text-lg font-semibold">
            {count}
            <span className="text-sm font-normal text-muted">
              {" "}
              / {step.exercises.length} seçili
            </span>
          </dd>
        </div>
        <CurrentValuesList
          exercises={step.exercises}
          kind={step.kind}
          unitTitle={unitTitle}
        />
        <div>
          <dt className="text-xs text-muted">Yeni değer</dt>
          <dd className="mt-0.5 text-sm font-medium">
            {changeLabel(step.change)}
          </dd>
        </div>
      </dl>

      {plan.unchanged.length > 0 ? (
        <p className="text-sm text-muted">
          {plan.unchanged.length} soru zaten bu değerde; onlar için istek
          gönderilmeyecek.
        </p>
      ) : null}
      {plan.blocked.length > 0 ? (
        <div className="text-sm">
          <p className="font-medium text-amber-800">
            {plan.blocked.length} soru atlanacak:
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted">
            {plan.blocked.map((item) => (
              <li key={item.id}>
                {previewOf(step.exercises, item.id)}: {item.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-muted">
        {isArchive
          ? "Arşivlenen sorular yeni oturumlarda kullanılmaz; geçmiş kayıtları korunur. "
          : "Her soru için ayrı bir istek gönderilir ve her başarılı değişiklik sorunun sürümünü 1 artırır. "}
        {step.kind === "unit"
          ? "Taşınan sorular bu üniteden çıkar ve hedef ünitede görünür. "
          : ""}
        Bir soru başarısız olursa diğerleri yine uygulanır.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          className={isArchive ? dangerButton : primaryButton}
          disabled={count === 0}
          onClick={onConfirm}
          type="button"
        >
          {isArchive
            ? `Onayla: ${count} soruyu arşivle`
            : `Onayla: ${count} soruyu güncelle`}
        </button>
        <button className={secondaryButton} onClick={onBack} type="button">
          Geri
        </button>
      </div>
    </div>
  );
}

function RunStatus({
  run,
  isRunning,
  onCancel,
  onRetry,
  onClose,
}: {
  run: Run;
  isRunning: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const result = run.result;
  const pending =
    result === null ? 0 : result.failed.length + result.notAttempted.length;

  if (isRunning || result === null) {
    const progress = run.progress;
    return (
      <div aria-busy="true" className="space-y-2">
        <p aria-live="polite" className="text-sm">
          Uygulanıyor… {progress?.done ?? 0}/{run.items.length}
          {progress !== null && progress.failed > 0
            ? ` (${progress.failed} başarısız)`
            : ""}
        </p>
        <div
          aria-hidden="true"
          className="h-2 max-w-md rounded-full bg-surface-muted"
        >
          <div
            className="h-2 rounded-full bg-primary"
            style={{
              width: `${((progress?.done ?? 0) / Math.max(1, run.items.length)) * 100}%`,
            }}
          />
        </div>
        <button className={secondaryButton} onClick={onCancel} type="button">
          Durdur
        </button>
        <p className="text-xs text-muted">
          Durdurulursa gönderilmiş istekler tamamlanır, kalanlar gönderilmez.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p
        className={
          pending === 0
            ? "text-sm font-medium text-emerald-700"
            : "text-sm font-medium"
        }
        role={pending === 0 ? "status" : "alert"}
      >
        {run.succeeded.length} başarılı
        {result.failed.length > 0 ? ` · ${result.failed.length} başarısız` : ""}
        {result.notAttempted.length > 0
          ? ` · ${result.notAttempted.length} gönderilmedi`
          : ""}
      </p>

      {result.halt !== null ? (
        <p className="text-sm text-danger">
          {result.halt.kind === "authentication"
            ? "Oturum sona erdi; işlem durduruldu."
            : "Çok fazla istek gönderildi; işlem durduruldu. Biraz bekleyip kalanları tekrar deneyin."}
        </p>
      ) : result.cancelled ? (
        <p className="text-sm text-muted">İşlem durduruldu.</p>
      ) : null}

      {result.failed.length > 0 ? (
        <ul className="space-y-1.5 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm">
          {result.failed.map((failure) => (
            <li key={failure.id}>
              <span className="font-medium">
                {previewOf(run.exercises, failure.id)}
              </span>
              <span className="block text-xs text-danger">
                {bulkErrorMessage(failure.error)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {pending > 0 && result.halt?.kind !== "authentication" ? (
          <button className={primaryButton} onClick={onRetry} type="button">
            Başarısızları tekrar dene ({pending})
          </button>
        ) : null}
        <button className={secondaryButton} onClick={onClose} type="button">
          Kapat
        </button>
      </div>
      {pending > 0 ? (
        <p className="text-xs text-muted">
          Tekrar denemede yalnızca başarısız ve gönderilmemiş sorular
          gönderilir; başarılı olanlar yeniden gönderilmez.
        </p>
      ) : null}
    </div>
  );
}

export type BulkEditToolbarProps = Readonly<{
  courseId: number;
  unitId: number;
  unitTitle: string;
  /** Units of this course, for "Ünite değiştir". */
  units: readonly Unit[];
  /** The selected, visible, non-archived questions, in list order. */
  selected: readonly ExerciseListItem[];
  selectableCount: number;
  onSelectAll: (all: boolean) => void;
  /** True while a bulk action is open: the list locks its checkboxes. */
  onLockChange: (locked: boolean) => void;
  /** Ids a run changed, so the list can drop them from the selection. */
  onApplied: (ids: readonly number[]) => void;
}>;

/**
 * Selection toolbar with the bulk actions. Every action goes edit → review
 * (count, current values — mixed or not —, new value) → explicit "Onayla" →
 * run with bounded concurrency → result with per-question errors and a retry
 * that resends only what did not succeed.
 */
export function BulkEditToolbar({
  courseId,
  unitId,
  unitTitle,
  units,
  selected,
  selectableCount,
  onSelectAll,
  onLockChange,
  onApplied,
}: BulkEditToolbarProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [isRunning, setIsRunning] = useState(false);

  const topicsQuery = useQuery<CourseTopicsData, ApiError>({
    ...courseTopicsQueryOptions(courseId),
    enabled: step?.kind === "topic",
  });
  const targetUnits = units.filter(
    (unit) => unit.id !== unitId && unit.status !== "archived",
  );

  const stepKey = step === null ? null : `${step.kind}:${step.name}`;
  useEffect(() => {
    if (stepKey !== null) headingRef.current?.focus();
  }, [stepKey]);

  const isSessionExpired =
    step?.name === "run" && step.run.result?.halt?.kind === "authentication";
  useEffect(() => {
    if (isSessionExpired) {
      router.replace("/login");
      router.refresh();
    }
  }, [isSessionExpired, router]);

  function open(kind: BulkEditKind) {
    setDraft(EMPTY_DRAFT);
    if (kind === "archive") {
      setStep({
        name: "review",
        kind,
        change: { kind },
        exercises: selected,
      });
    } else {
      setStep({ name: "edit", kind });
    }
    onLockChange(true);
  }

  function close() {
    if (isRunning) return;
    setStep(null);
    setDraft(EMPTY_DRAFT);
    onLockChange(false);
  }

  async function invalidate(change: BulkEditChange, ids: readonly number[]) {
    const unitIds = change.kind === "unit" ? [unitId, change.unitId] : [unitId];

    await Promise.all([
      ...unitIds.flatMap((id) => [
        queryClient.invalidateQueries({
          queryKey: unitExercisesQueryPrefix(id),
        }),
        queryClient.invalidateQueries({ queryKey: unitNodesQueryKey(id) }),
      ]),
      queryClient.invalidateQueries({
        queryKey: courseUnitsQueryKey(courseId),
      }),
      queryClient.invalidateQueries({
        queryKey: courseTopicsQueryKey(courseId),
      }),
      // Selection pools filter by unit, topic, difficulty and scope.
      queryClient.invalidateQueries({ queryKey: nodePreviewQueryPrefix }),
      ...ids.map((id) =>
        queryClient.invalidateQueries({
          queryKey: exerciseDetailQueryKey(id),
        }),
      ),
    ]);
  }

  async function execute(base: Run, items: readonly BulkItem[]) {
    const controller = new AbortController();
    abort.current = controller;
    setIsRunning(true);
    setStep({
      name: "run",
      kind: base.change.kind,
      run: { ...base, items, progress: null, result: null },
    });

    const result = await runBulkEdit(
      items,
      (item) =>
        item.body === null
          ? archiveExercise(item.id)
          : updateExerciseMetadata(item.id, item.body),
      {
        concurrency: BULK_EDIT_CONCURRENCY,
        signal: controller.signal,
        onProgress: (progress) =>
          setStep((current) =>
            current?.name === "run"
              ? { ...current, run: { ...current.run, progress } }
              : current,
          ),
      },
    );

    abort.current = null;
    const succeeded = [...base.succeeded, ...result.succeeded];
    if (result.succeeded.length > 0) {
      await invalidate(base.change, result.succeeded);
      onApplied(result.succeeded);
    }
    setIsRunning(false);
    setStep({
      name: "run",
      kind: base.change.kind,
      run: { ...base, items, succeeded, progress: null, result },
    });
  }

  if (step === null) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted px-4 py-2.5 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              aria-label="Görünen tüm soruları seç"
              checked={selected.length === selectableCount}
              onChange={(event) => onSelectAll(event.target.checked)}
              type="checkbox"
            />
            Tümünü seç
          </label>
          <span className="text-sm text-muted" aria-live="polite">
            {selected.length} soru seçili
          </span>
        </div>
        <div
          aria-label="Toplu işlemler"
          className="flex flex-wrap gap-2 sm:ml-auto"
          role="group"
        >
          {bulkEditKinds.map((kind) => (
            <button
              className={
                kind === "archive"
                  ? "rounded-md border border-danger/40 px-3 py-1.5 text-sm font-semibold text-danger transition-colors hover:bg-danger/5 disabled:cursor-not-allowed disabled:opacity-60"
                  : secondaryButton
              }
              disabled={selected.length === 0}
              key={kind}
              onClick={() => open(kind)}
              type="button"
            >
              {bulkEditKindLabels[kind]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const change =
    step.name === "edit"
      ? buildChange(step.kind, draft, topicsQuery.data, targetUnits)
      : null;
  const plan =
    step.name === "review"
      ? planBulkEdit(step.exercises, step.change, unitId)
      : null;

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-3 rounded-lg border border-primary/30 bg-surface p-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          className="text-sm font-semibold outline-none"
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
        >
          Toplu işlem: {bulkEditKindLabels[step.kind]}
          <span className="ml-2 font-normal text-muted">
            {step.name === "run"
              ? `${step.run.exercises.length} soru`
              : step.name === "review"
                ? `${step.exercises.length} soru`
                : `${selected.length} soru seçili`}
          </span>
        </h2>
        {step.name === "edit" ? (
          <span className="text-xs text-muted">
            Adım 1/2 · Yeni değeri seçin
          </span>
        ) : step.name === "review" ? (
          <span className="text-xs text-muted">Adım 2/2 · Onaylayın</span>
        ) : null}
      </div>

      {step.name === "edit" ? (
        <div className="space-y-3">
          <dl>
            <CurrentValuesList
              exercises={selected}
              kind={step.kind}
              unitTitle={unitTitle}
            />
          </dl>
          <EditFields
            draft={draft}
            kind={step.kind}
            onDraft={setDraft}
            targetUnits={targetUnits}
            topicsQuery={topicsQuery}
          />
          <div className="flex flex-wrap gap-2">
            <button
              className={primaryButton}
              disabled={change === null || selected.length === 0}
              onClick={() =>
                change === null
                  ? undefined
                  : setStep({
                      name: "review",
                      kind: step.kind,
                      change,
                      exercises: selected,
                    })
              }
              type="button"
            >
              Önizle
            </button>
            <button className={secondaryButton} onClick={close} type="button">
              Vazgeç
            </button>
          </div>
        </div>
      ) : null}

      {step.name === "review" && plan !== null ? (
        <Review
          onBack={() =>
            step.kind === "archive"
              ? close()
              : setStep({ name: "edit", kind: step.kind })
          }
          onConfirm={() =>
            void execute(
              {
                change: step.change,
                exercises: step.exercises,
                plan,
                items: plan.items,
                succeeded: [],
                progress: null,
                result: null,
              },
              plan.items,
            )
          }
          plan={plan}
          step={step}
          unitTitle={unitTitle}
        />
      ) : null}

      {step.name === "run" ? (
        <RunStatus
          isRunning={isRunning}
          onCancel={() => abort.current?.abort()}
          onClose={close}
          onRetry={() =>
            step.run.result === null
              ? undefined
              : void execute(
                  step.run,
                  retryItems(step.run.items, step.run.result),
                )
          }
          run={step.run}
        />
      ) : null}
    </section>
  );
}
