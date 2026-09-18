"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useForm, useWatch, type FieldPath } from "react-hook-form";
import { z } from "zod";

import type {
  Course,
  CourseScope,
  PublishStatus,
  Unit,
  UnitExercisesData,
} from "@/contracts/admin/content";
import {
  isSupportedEditorType,
  type CourseTopicsData,
  type ExerciseDetail,
  type SupportedEditorType,
} from "@/contracts/admin/exercise-editor";
import { courseScopeLabels } from "@/features/content/content-labels";
import {
  createExercise,
  updateExercise,
} from "@/features/content/content-client";
import {
  courseTopicsQueryKey,
  courseTopicsQueryOptions,
  courseUnitsQueryKey,
  courseUnitsQueryOptions,
  coursesQueryOptions,
  exerciseDetailQueryKey,
  exerciseDetailQueryOptions,
  unitExercisesQueryOptions,
  unitExercisesQueryPrefix,
} from "@/features/content/content-queries";
import {
  consumeEditorDefaults,
  createEditorDefaults,
  editorFormSchema,
  editorTypeHeadings,
  editorTypeLabels,
  formValuesFromDetail,
  preserveEditorDefaults,
  serializeCreateExercise,
  serializeUpdateExercise,
  type EditorFormValues,
} from "@/features/content/editor-form";
import { FieldError } from "@/features/content/editor-field-error";
import {
  MultipleChoiceFields,
  MultipleChoicePreview,
} from "@/features/content/multiple-choice-section";
import {
  TrueFalseFields,
  TrueFalsePreview,
} from "@/features/content/true-false-section";
import { StatusBadge } from "@/features/content/status-badges";
import type { ApiError } from "@/lib/api/error";

const DOMAIN_DETAILS_SCHEMA = z.object({
  schema_errors: z.array(z.string().trim().min(1)).optional(),
});

const SCOPE_OPTIONS: CourseScope[] = [
  "tyt",
  "ayt",
  "ydt",
  "lgs",
  "kpss",
  "ales",
  "yds",
];

/**
 * Backend field names map onto the active type's form paths. Only the two
 * question fields differ per type; everything else is shared.
 */
const SERVER_FIELD_PATHS: Record<
  SupportedEditorType,
  Record<string, FieldPath<EditorFormValues>>
> = {
  multiple_choice: {
    topic_id: "topicId",
    difficulty: "difficulty",
    explanation: "explanation",
    applicable_scopes: "scopes",
    content: "multipleChoice.stem",
    answer_key: "multipleChoice.correctOptionId",
  },
  true_false: {
    topic_id: "topicId",
    difficulty: "difficulty",
    explanation: "explanation",
    applicable_scopes: "scopes",
    content: "trueFalse.statement",
    answer_key: "trueFalse.answerValue",
  },
};

type SaveIntent = "save" | "save-new";

function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    "message" in error
  );
}

function LoadingState() {
  return (
    <div aria-busy="true" className="space-y-4" role="status">
      <span className="sr-only">Soru editörü yükleniyor.</span>
      <div className="h-8 w-64 rounded bg-border/70" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]">
        <div className="h-[32rem] rounded-lg border border-border bg-surface" />
        <div className="h-80 rounded-lg border border-border bg-surface" />
      </div>
    </div>
  );
}

function SafeState({ title, message }: { title: string; message: string }) {
  return (
    <div
      className="rounded-lg border border-border bg-surface p-6"
      role="alert"
    >
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-2 max-w-prose text-sm text-muted">{message}</p>
    </div>
  );
}

export function EditorAccessDenied() {
  return (
    <SafeState
      message="Bu sayfayı görüntüleyebilirsiniz ancak soru oluşturmak veya düzenlemek için edit_content yetkisi gerekir."
      title="Düzenleme yetkiniz yok."
    />
  );
}

export function EditorUnsupportedType() {
  return (
    <SafeState
      message="Bu soru tipi çoktan seçmeli ve doğru / yanlış editörleriyle değiştirilemez."
      title="Bu soru tipi henüz bu editörde desteklenmiyor."
    />
  );
}

/** Create routes carry only this safe enum — never question content. */
export function createExercisePath(
  courseId: number,
  unitId: number,
  type: SupportedEditorType,
): string {
  const base = `/courses/${courseId}/units/${unitId}/exercises/new`;
  return type === "multiple_choice" ? base : `${base}?type=${type}`;
}

export type ExerciseEditorProps = Readonly<{
  courseId: number;
  unitId: number;
  exerciseId?: number;
  canEdit: boolean;
  /** Which editor a create route opens. Ignored in edit mode. */
  createType?: SupportedEditorType;
}>;

export function ExerciseEditor({
  courseId,
  unitId,
  exerciseId,
  canEdit,
  createType = "multiple_choice",
}: ExerciseEditorProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = exerciseId !== undefined;
  const [consumedDefaults] = useState(() => consumeEditorDefaults());
  const [initialDefaults] = useState(() =>
    createEditorDefaults(createType, consumedDefaults),
  );
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<ApiError | null>(null);
  const [schemaErrors, setSchemaErrors] = useState<string[]>([]);
  const hydratedExercise = useRef<number | null>(null);
  const scopedCreateDefaults = useRef(false);
  const mutationInFlight = useRef(false);

  const form = useForm<EditorFormValues>({
    resolver: zodResolver(editorFormSchema),
    mode: "onChange",
    defaultValues: initialDefaults,
  });
  // useWatch subscribes this component to every change; getValues then reads
  // the complete, fully typed values — no partial merge and no cast.
  useWatch({ control: form.control });
  const values = form.getValues();
  const activeType = values.type;

  const coursesQuery = useQuery<Course[], ApiError>(coursesQueryOptions());
  const unitsQuery = useQuery<Unit[], ApiError>(
    courseUnitsQueryOptions(courseId),
  );
  const topicsQuery = useQuery<CourseTopicsData, ApiError>(
    courseTopicsQueryOptions(courseId),
  );
  const listQuery = useQuery<UnitExercisesData, ApiError>(
    unitExercisesQueryOptions(unitId, {}),
  );
  const detailQuery = useQuery<ExerciseDetail, ApiError>({
    ...exerciseDetailQueryOptions(exerciseId ?? 1),
    enabled: isEdit,
  });

  const course = coursesQuery.data?.find((item) => item.id === courseId);
  const unit = unitsQuery.data?.find((item) => item.id === unitId);
  const topicIds = useMemo(
    () => new Set(topicsQuery.data?.topics.map((topic) => topic.id) ?? []),
    [topicsQuery.data],
  );
  const selectedTopicId = values.topicId;
  const selectedTopicMissing =
    selectedTopicId !== null &&
    topicsQuery.isSuccess &&
    !topicIds.has(selectedTopicId);

  useEffect(() => {
    if (
      isEdit ||
      scopedCreateDefaults.current ||
      course === undefined ||
      consumedDefaults !== undefined
    ) {
      return;
    }

    scopedCreateDefaults.current = true;
    form.reset({ ...form.getValues(), scopes: [course.scope] });
  }, [consumedDefaults, course, form, isEdit]);

  useEffect(() => {
    if (
      !isEdit ||
      detailQuery.data === undefined ||
      hydratedExercise.current === detailQuery.data.id
    ) {
      return;
    }

    const hydrated = formValuesFromDetail(detailQuery.data);
    if (hydrated === null) return;

    hydratedExercise.current = detailQuery.data.id;
    form.reset(hydrated);
  }, [detailQuery.data, form, isEdit]);

  const createMutation = useMutation({
    mutationFn: createExercise,
    retry: 0,
  });
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      values: input,
    }: {
      id: number;
      values: EditorFormValues;
    }) => updateExercise(id, serializeUpdateExercise(input)),
    retry: 0,
  });
  const isPending = createMutation.isPending || updateMutation.isPending;

  async function invalidateAfterSave() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: unitExercisesQueryPrefix(unitId),
      }),
      queryClient.invalidateQueries({
        queryKey: courseUnitsQueryKey(courseId),
      }),
      queryClient.invalidateQueries({
        queryKey: courseTopicsQueryKey(courseId),
      }),
    ]);
  }

  function applyMutationError(error: unknown, type: SupportedEditorType) {
    setSuccessMessage(null);
    setSchemaErrors([]);

    if (!isApiError(error)) {
      setRequestError({
        kind: "unknown",
        status: null,
        message: "İstek tamamlanamadı.",
      });
      return;
    }

    setRequestError(error);

    if (error.kind === "authentication") {
      router.replace("/login");
      router.refresh();
      return;
    }

    if (error.code === "TOPIC_MISMATCH") {
      form.setError("topicId", {
        type: "server",
        message: "Seçilen konu bu derse ait değil.",
      });
    }

    if (error.code === "INVALID_EXERCISE_CONTENT") {
      const parsed = DOMAIN_DETAILS_SCHEMA.safeParse(error.details);
      setSchemaErrors(parsed.success ? (parsed.data.schema_errors ?? []) : []);
    }

    const paths = SERVER_FIELD_PATHS[type];

    for (const [backendField, messages] of Object.entries(error.fields ?? {})) {
      const path = paths[backendField];
      if (path !== undefined && messages[0] !== undefined) {
        form.setError(path, { type: "server", message: messages[0] });
      }
    }
  }

  async function save(input: EditorFormValues, intent: SaveIntent) {
    if (mutationInFlight.current || isPending || selectedTopicMissing) return;

    mutationInFlight.current = true;

    setRequestError(null);
    setSchemaErrors([]);
    setSuccessMessage(null);

    try {
      if (!isEdit) {
        const result = await createMutation.mutateAsync(
          serializeCreateExercise(input, unitId),
        );
        await invalidateAfterSave();

        if (intent === "save-new") {
          // The next question keeps the shared context and the editor type,
          // and starts with an empty statement/stem and no answer at all.
          form.reset(
            createEditorDefaults(input.type, {
              type: input.type,
              topicId: input.topicId,
              difficulty: input.difficulty,
              scopes: [...input.scopes],
            }),
          );
          setSavedVersion(null);
          setWarning(null);
          setSuccessMessage("Kaydedildi. Yeni soru hazır.");
        } else {
          router.replace(
            `/courses/${courseId}/units/${unitId}/exercises/${result.id}`,
          );
        }
        return;
      }

      const result = await updateMutation.mutateAsync({
        id: exerciseId,
        values: input,
      });
      await invalidateAfterSave();

      if (intent === "save-new") {
        preserveEditorDefaults(input);
        router.replace(createExercisePath(courseId, unitId, input.type));
        return;
      }

      setSavedVersion(result.version);
      setWarning(result.warning ?? null);
      setSuccessMessage("Kaydedildi");
      form.reset(input);
      queryClient.setQueryData<ExerciseDetail>(
        exerciseDetailQueryKey(exerciseId),
        (current) =>
          current === undefined
            ? current
            : {
                ...current,
                ...serializeUpdateExercise(input),
                version: result.version,
              },
      );
    } catch (error) {
      applyMutationError(error, input.type);
    } finally {
      mutationInFlight.current = false;
    }
  }

  // One keyboard listener for every editor type: the type-specific sections
  // never register their own, so a shortcut can only fire a single save.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = event.metaKey || event.ctrlKey;
      const saveNew = command && event.shiftKey && event.key === "Enter";
      const saveOnly =
        command && !event.shiftKey && event.key.toLowerCase() === "s";

      if (!saveNew && !saveOnly) return;
      event.preventDefault();
      if (mutationInFlight.current || isPending) return;

      void form.handleSubmit((submitted) =>
        save(submitted, saveNew ? "save-new" : "save"),
      )();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    void form.handleSubmit((submitted) => save(submitted, "save"))(event);
  }

  function handleSaveNewClick() {
    void form.handleSubmit((submitted) => save(submitted, "save-new"))();
  }

  if (!canEdit) return <EditorAccessDenied />;

  const errors = [
    coursesQuery.error,
    unitsQuery.error,
    topicsQuery.error,
    listQuery.error,
    isEdit ? detailQuery.error : null,
  ];
  const expired = errors.some((error) => error?.kind === "authentication");

  if (expired) {
    router.replace("/login");
    return <LoadingState />;
  }

  const pending =
    coursesQuery.isPending ||
    unitsQuery.isPending ||
    topicsQuery.isPending ||
    listQuery.isPending ||
    (isEdit && detailQuery.isPending);
  if (pending) return <LoadingState />;

  const notFound =
    course === undefined ||
    unit === undefined ||
    topicsQuery.data?.course.id !== courseId ||
    listQuery.data?.unit.id !== unitId ||
    (isEdit &&
      !listQuery.data?.exercises.some(
        (exercise) => exercise.id === exerciseId,
      )) ||
    errors.some((error) => error?.kind === "not_found");

  if (notFound) {
    return (
      <SafeState
        message="Ders, ünite veya soru route bağlamıyla eşleşmiyor. Listeye dönüp tekrar deneyin."
        title="Editör bağlamı bulunamadı"
      />
    );
  }

  const fatalError = errors.find(
    (error) => error !== null && error !== undefined,
  );
  if (fatalError !== undefined) {
    return (
      <SafeState
        message={
          fatalError.kind === "authorization"
            ? "Bu içeriği görüntüleme yetkiniz yok."
            : "Editör verileri güvenli biçimde yüklenemedi. Lütfen tekrar deneyin."
        }
        title="Editör yüklenemedi"
      />
    );
  }

  // Types this editor cannot mutate stay readable in the list and the detail
  // API; only the editing surface is withheld.
  if (isEdit && !isSupportedEditorType(detailQuery.data?.type ?? "")) {
    return <EditorUnsupportedType />;
  }

  const disableSave =
    !form.formState.isValid ||
    isPending ||
    selectedTopicMissing ||
    (isEdit && !form.formState.isDirty);
  const version =
    savedVersion ?? (isEdit ? (detailQuery.data?.version ?? null) : null);
  const status: PublishStatus = isEdit
    ? (detailQuery.data?.status ?? "draft")
    : "draft";
  const headings = editorTypeHeadings[activeType];

  return (
    <div className="space-y-6">
      <header className="border-b border-border pb-5">
        <Link
          className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-foreground"
          href={`/courses/${courseId}/units/${unitId}`}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          Sorulara dön
        </Link>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {isEdit ? headings.edit : headings.create}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {course?.name} · {unit?.title}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span>Tip: {editorTypeLabels[activeType]}</span>
            <StatusBadge status={status} />
            {version === null ? null : <span>v{version}</span>}
          </div>
        </div>
      </header>

      {warning === null ? null : (
        <div
          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          {warning}
        </div>
      )}

      {requestError === null ? null : (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3"
          role="alert"
        >
          <p className="text-sm font-medium text-red-900">
            {requestError.kind === "authorization"
              ? "Düzenleme yetkiniz yok."
              : requestError.kind === "not_found"
                ? "Soru bulunamadı."
                : requestError.code === "TOPIC_MISMATCH"
                  ? "Seçilen konu bu derse ait değil."
                  : requestError.code === "INVALID_EXERCISE_CONTENT"
                    ? "Soru içeriği doğrulanamadı."
                    : requestError.message}
          </p>
          {schemaErrors.length === 0 ? null : (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-800">
              {schemaErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/*
       * method="post" is a security fallback, not a second mutation path, and
       * there is exactly one form element for every editor type. A form
       * without an explicit method submits natively with GET, so a submit that
       * lands before React hydrates (or with JavaScript disabled or broken)
       * would serialise every field — statement, stem, option texts, the
       * answer, explanation — into the URL query string, and from there into
       * history, referrers and access logs. POST keeps the answer key in the
       * request body; the page route does not handle POST, so the native
       * submit simply fails instead of leaking.
       *
       * Once hydrated, handleFormSubmit preventDefaults and the normal
       * react-hook-form -> createExercise/updateExercise -> same-origin JSON
       * BFF flow runs unchanged.
       */}
      <form
        aria-busy={isPending}
        className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]"
        method="post"
        onSubmit={handleFormSubmit}
      >
        <div className="space-y-6 rounded-lg border border-border bg-surface p-4 sm:p-6">
          <section aria-labelledby="common-fields" className="space-y-4">
            <h2 className="text-sm font-semibold" id="common-fields">
              Ortak alanlar
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium" htmlFor="topicId">
                  Konu
                </label>
                <select
                  aria-describedby="topicId-error"
                  className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  id="topicId"
                  {...form.register("topicId", {
                    setValueAs: (value) =>
                      value === "" ? null : Number(value),
                  })}
                >
                  <option value="">Konu seçin</option>
                  {topicsQuery.data?.topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name} ({topic.exercise_count})
                    </option>
                  ))}
                </select>
                <FieldError
                  id="topicId-error"
                  message={form.formState.errors.topicId?.message}
                />
                {selectedTopicMissing ? (
                  <p className="mt-1.5 text-xs text-amber-800" role="alert">
                    Mevcut konu bu dersin güncel konu listesinde yok. Kaydetmek
                    için geçerli bir konu seçin.
                  </p>
                ) : null}
              </div>
              <div>
                <label className="text-sm font-medium" htmlFor="difficulty">
                  Zorluk
                </label>
                <select
                  className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  id="difficulty"
                  {...form.register("difficulty", { valueAsNumber: true })}
                >
                  {[1, 2, 3, 4, 5].map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <fieldset>
              <legend className="text-sm font-medium">
                Uygulanabilir kapsamlar
              </legend>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                {SCOPE_OPTIONS.map((scope) => (
                  <label
                    className="inline-flex items-center gap-2 text-sm"
                    key={scope}
                  >
                    <input
                      type="checkbox"
                      value={scope}
                      {...form.register("scopes")}
                    />
                    {courseScopeLabels[scope]}
                  </label>
                ))}
              </div>
              <FieldError
                id="scopes-error"
                message={form.formState.errors.scopes?.message}
              />
            </fieldset>
          </section>

          <section
            aria-labelledby="question-fields"
            className="space-y-4 border-t border-border pt-5"
          >
            <h2 className="text-sm font-semibold" id="question-fields">
              {activeType === "multiple_choice"
                ? "Soru ve şıklar"
                : "Soru içeriği"}
            </h2>

            {activeType === "multiple_choice" ? (
              <MultipleChoiceFields form={form} />
            ) : (
              <TrueFalseFields form={form} />
            )}

            <div>
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium" htmlFor="explanation">
                  Açıklama
                </label>
                <span className="text-xs text-muted">
                  {values.explanation.length}/2000
                </span>
              </div>
              <textarea
                aria-describedby="explanation-error"
                className="mt-1.5 min-h-24 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                id="explanation"
                maxLength={2001}
                {...form.register("explanation")}
              />
              <FieldError
                id="explanation-error"
                message={form.formState.errors.explanation?.message}
              />
            </div>
          </section>

          <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center">
            <button
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disableSave}
              type="submit"
            >
              {isPending ? "Kaydediliyor…" : "Kaydet"}
            </button>
            <button
              className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disableSave}
              onClick={handleSaveNewClick}
              type="button"
            >
              Kaydet ve Yeni
            </button>
            <div className="text-xs text-muted sm:ml-auto">
              <span>⌘/Ctrl + S · ⌘/Ctrl + Shift + Enter</span>
              {form.formState.isDirty ? (
                <span className="ml-3 font-medium text-amber-700">
                  Kaydedilmemiş değişiklikler
                </span>
              ) : null}
              {successMessage === null ? null : (
                <span
                  className="ml-3 font-medium text-emerald-700"
                  role="status"
                >
                  {successMessage}
                </span>
              )}
            </div>
          </div>
        </div>

        {activeType === "multiple_choice" ? (
          <MultipleChoicePreview values={values} />
        ) : (
          <TrueFalsePreview values={values} />
        )}
      </form>
    </div>
  );
}
