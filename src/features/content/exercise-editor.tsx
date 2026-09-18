"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import type {
  Course,
  CourseScope,
  PublishStatus,
  Unit,
  UnitExercisesData,
} from "@/contracts/admin/content";
import type {
  CourseTopicsData,
  ExerciseDetail,
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
  correctAnswerAfterOptionRemoval,
  createMultipleChoiceDefaults,
  formValuesFromDetail,
  multipleChoiceFormSchema,
  nextOptionId,
  preserveEditorDefaults,
  serializeCreateExercise,
  serializeUpdateExercise,
  type MultipleChoiceFormValues,
} from "@/features/content/multiple-choice-form";
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

type SaveIntent = "save" | "save-new";

function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    "message" in error
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message === undefined ? null : (
    <p className="mt-1.5 text-xs text-red-700" id={id}>
      {message}
    </p>
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

function Preview({ values }: { values: MultipleChoiceFormValues }) {
  const correct = values.options.find(
    (option) => option.id === values.correctOptionId,
  );

  return (
    <aside
      className="lg:sticky lg:top-6 lg:self-start"
      aria-label="Canlı önizleme"
    >
      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Canlı önizleme</h2>
          <p className="mt-1 text-xs text-muted">
            Yönetici görünümü · doğru cevap görünür
          </p>
        </div>
        <div className="space-y-5 p-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Çoktan seçmeli · Zorluk {values.difficulty}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-base font-medium">
              {values.stem.trim() || "Soru kökü burada görünecek."}
            </p>
          </div>

          <ol className="space-y-2">
            {values.options.map((option) => {
              const isCorrect = option.id === values.correctOptionId;
              return (
                <li
                  className={`flex gap-3 rounded-md border px-3 py-2.5 text-sm ${
                    isCorrect
                      ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                      : "border-border bg-surface-muted"
                  }`}
                  key={option.id}
                >
                  <span className="font-semibold">{option.id}</span>
                  <span className="min-w-0 whitespace-pre-wrap">
                    {option.text.trim() || "Şık metni"}
                  </span>
                  {isCorrect ? (
                    <span className="ml-auto shrink-0 text-xs font-medium">
                      Doğru
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>

          <dl className="grid gap-3 border-t border-border pt-4 text-xs">
            <div>
              <dt className="font-medium text-muted">Kapsam</dt>
              <dd className="mt-0.5">
                {values.scopes.length === 0
                  ? "Seçilmedi"
                  : values.scopes
                      .map((scope) => courseScopeLabels[scope])
                      .join(", ")}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-muted">Doğru cevap</dt>
              <dd className="mt-0.5">
                {correct === undefined
                  ? "Seçilmedi"
                  : `${correct.id}: ${correct.text || "Şık metni"}`}
              </dd>
            </div>
            {values.explanation.trim().length === 0 ? null : (
              <div>
                <dt className="font-medium text-muted">Açıklama</dt>
                <dd className="mt-0.5 whitespace-pre-wrap">
                  {values.explanation}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </aside>
  );
}

export type ExerciseEditorProps = Readonly<{
  courseId: number;
  unitId: number;
  exerciseId?: number;
  canEdit: boolean;
}>;

export function ExerciseEditor({
  courseId,
  unitId,
  exerciseId,
  canEdit,
}: ExerciseEditorProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = exerciseId !== undefined;
  const [consumedDefaults] = useState(() => consumeEditorDefaults());
  const [initialDefaults] = useState(() =>
    createMultipleChoiceDefaults(consumedDefaults),
  );
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<ApiError | null>(null);
  const [schemaErrors, setSchemaErrors] = useState<string[]>([]);
  const hydratedExercise = useRef<number | null>(null);
  const scopedCreateDefaults = useRef(false);
  const mutationInFlight = useRef(false);

  const form = useForm<MultipleChoiceFormValues>({
    resolver: zodResolver(multipleChoiceFormSchema),
    mode: "onChange",
    defaultValues: initialDefaults,
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "options",
    keyName: "fieldKey",
  });
  const watched = useWatch({ control: form.control });
  const previewValues = {
    ...createMultipleChoiceDefaults(),
    ...watched,
    options: watched.options ?? [],
    scopes: watched.scopes ?? [],
  } as MultipleChoiceFormValues;

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
  const selectedTopicId = previewValues.topicId;
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

    const values = formValuesFromDetail(detailQuery.data);
    if (values === null) return;

    hydratedExercise.current = detailQuery.data.id;
    form.reset(values);
  }, [detailQuery.data, form, isEdit]);

  const createMutation = useMutation({
    mutationFn: createExercise,
    retry: 0,
  });
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: number;
      values: MultipleChoiceFormValues;
    }) => updateExercise(id, serializeUpdateExercise(values)),
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

  function applyMutationError(error: unknown) {
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

    const fieldMap = {
      topic_id: "topicId",
      difficulty: "difficulty",
      explanation: "explanation",
      applicable_scopes: "scopes",
      content: "stem",
      answer_key: "correctOptionId",
    } as const;

    for (const [backendField, messages] of Object.entries(error.fields ?? {})) {
      const field = fieldMap[backendField as keyof typeof fieldMap];
      if (field !== undefined && messages[0] !== undefined) {
        form.setError(field, { type: "server", message: messages[0] });
      }
    }
  }

  async function save(values: MultipleChoiceFormValues, intent: SaveIntent) {
    if (mutationInFlight.current || isPending || selectedTopicMissing) return;

    mutationInFlight.current = true;

    setRequestError(null);
    setSchemaErrors([]);
    setSuccessMessage(null);

    try {
      if (!isEdit) {
        const result = await createMutation.mutateAsync(
          serializeCreateExercise(values, unitId),
        );
        await invalidateAfterSave();

        if (intent === "save-new") {
          form.reset(
            createMultipleChoiceDefaults({
              topicId: values.topicId,
              difficulty: values.difficulty,
              scopes: [...values.scopes],
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
        values,
      });
      await invalidateAfterSave();

      if (intent === "save-new") {
        preserveEditorDefaults(values);
        router.replace(`/courses/${courseId}/units/${unitId}/exercises/new`);
        return;
      }

      setSavedVersion(result.version);
      setWarning(result.warning ?? null);
      setSuccessMessage("Kaydedildi");
      form.reset(values);
      queryClient.setQueryData<ExerciseDetail>(
        exerciseDetailQueryKey(exerciseId),
        (current) =>
          current === undefined
            ? current
            : {
                ...current,
                ...serializeUpdateExercise(values),
                version: result.version,
              },
      );
    } catch (error) {
      applyMutationError(error);
    } finally {
      mutationInFlight.current = false;
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = event.metaKey || event.ctrlKey;
      const saveNew = command && event.shiftKey && event.key === "Enter";
      const saveOnly =
        command && !event.shiftKey && event.key.toLowerCase() === "s";

      if (!saveNew && !saveOnly) return;
      event.preventDefault();
      if (mutationInFlight.current || isPending) return;

      void form.handleSubmit((values) =>
        save(values, saveNew ? "save-new" : "save"),
      )();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    void form.handleSubmit((values) => save(values, "save"))(event);
  }

  function handleSaveNewClick() {
    void form.handleSubmit((values) => save(values, "save-new"))();
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

  if (isEdit && detailQuery.data?.type !== "multiple_choice") {
    return (
      <SafeState
        message="Bu soru tipi M2 Step 01 kapsamındaki çoktan seçmeli editör tarafından değiştirilemez."
        title="Bu soru tipi henüz bu editörde desteklenmiyor."
      />
    );
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

  function removeOptionAt(index: number) {
    if (fields.length <= 2) return;
    const removedId = form.getValues(`options.${index}.id`);
    const nextCorrect = correctAnswerAfterOptionRemoval(
      form.getValues("correctOptionId"),
      removedId,
    );
    remove(index);
    form.setValue("correctOptionId", nextCorrect, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

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
              {isEdit
                ? "Çoktan seçmeli soruyu düzenle"
                : "Yeni çoktan seçmeli soru"}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {course?.name} · {unit?.title}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span>Tip: Çoktan seçmeli</span>
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

      <form
        aria-busy={isPending}
        className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]"
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
              Soru ve şıklar
            </h2>
            <div>
              <label className="text-sm font-medium" htmlFor="stem">
                Soru kökü
              </label>
              <textarea
                aria-describedby="stem-error"
                className="mt-1.5 min-h-28 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                id="stem"
                {...form.register("stem")}
              />
              <FieldError
                id="stem-error"
                message={form.formState.errors.stem?.message}
              />
            </div>

            <div className="space-y-3">
              {fields.map((field, index) => {
                const optionId = field.id;
                return (
                  <div
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3"
                    key={field.fieldKey}
                  >
                    <label
                      className="mt-2 inline-flex size-5 items-center justify-center"
                      title="Doğru cevap"
                    >
                      <input
                        aria-label={`${optionId} şıkkını doğru cevap seç`}
                        type="radio"
                        value={optionId}
                        {...form.register("correctOptionId")}
                      />
                    </label>
                    <div>
                      <div className="flex rounded-md border border-border bg-surface focus-within:outline-2 focus-within:outline-primary">
                        <input
                          type="hidden"
                          {...form.register(`options.${index}.id`)}
                        />
                        <span className="border-r border-border bg-surface-muted px-3 py-2 text-sm font-semibold">
                          {optionId}
                        </span>
                        <input
                          aria-label={`${optionId} şıkkı metni`}
                          className="min-w-0 flex-1 rounded-r-md px-3 py-2 text-sm outline-none"
                          {...form.register(`options.${index}.text`)}
                        />
                      </div>
                      <FieldError
                        id={`option-${index}-error`}
                        message={
                          form.formState.errors.options?.[index]?.text?.message
                        }
                      />
                    </div>
                    <button
                      aria-label={`${optionId} şıkkını kaldır`}
                      className="mt-0.5 inline-flex size-9 items-center justify-center rounded-md border border-border text-muted hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={fields.length <= 2}
                      onClick={() => removeOptionAt(index)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                );
              })}
              <FieldError
                id="options-error"
                message={
                  form.formState.errors.options?.root?.message ??
                  form.formState.errors.options?.message
                }
              />
              <FieldError
                id="correct-error"
                message={form.formState.errors.correctOptionId?.message}
              />
              <button
                className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-muted"
                onClick={() => {
                  const id = nextOptionId(
                    form.getValues("options").map((option) => option.id),
                  );
                  append({ id, text: "" });
                }}
                type="button"
              >
                <Plus aria-hidden="true" className="size-4" />
                Şık ekle
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium" htmlFor="explanation">
                  Açıklama
                </label>
                <span className="text-xs text-muted">
                  {previewValues.explanation.length}/2000
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

        <Preview values={previewValues} />
      </form>
    </div>
  );
}
