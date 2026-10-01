"use client";

import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";

import type { Unit } from "@/contracts/admin/content";
import {
  updateCurriculumRequestSchema,
  type CurriculumOptions,
  type CurriculumRow,
  type UpdateCurriculumRequest,
} from "@/contracts/admin/workflows";
import { publishStatusLabels } from "@/features/content/content-labels";
import {
  courseUnitsQueryOptions,
  coursesQueryOptions,
} from "@/features/content/content-queries";
import {
  countSignals,
  curriculumSignals,
  fieldSeverity,
  mapServerErrors,
  signalsByCourse,
  type CurriculumField,
  type CurriculumSignal,
  type ServerRowErrors,
} from "@/features/workflows/curriculum-health";
import {
  CurriculumHealthOverview,
  SignalCount,
  VariantHealthDetail,
} from "@/features/workflows/curriculum-health-panel";
import {
  curriculumMappingQueryKey,
  curriculumMappingQueryOptions,
  curriculumOptionsQueryOptions,
  type CurriculumMapping,
} from "@/features/workflows/curriculum-queries";
import { updateCurriculum } from "@/features/workflows/workflow-client";
import type { ApiError } from "@/lib/api/error";

function rowAnchorId(courseId: number) {
  return `curriculum-row-${courseId}`;
}

/** The request body for the rows as they are (every field the PUT takes). */
function requestRows(rows: readonly CurriculumRow[]) {
  return rows.map(
    ({
      course_id,
      exam_section_id,
      sort_order,
      access,
      exam_weight,
      is_required,
    }) => ({
      course_id,
      exam_section_id,
      sort_order,
      access,
      exam_weight,
      is_required,
    }),
  );
}

/**
 * Field styling from the client signals and the backend's mapped errors:
 * an error (either source) outranks a warning.
 */
function fieldState(
  signals: readonly CurriculumSignal[] | undefined,
  server: ReadonlyMap<string, readonly string[]> | undefined,
  field: CurriculumField,
) {
  const severity =
    (server?.get(field)?.length ?? 0) > 0
      ? "error"
      : fieldSeverity(signals, field);

  return {
    "aria-invalid": severity === "error" ? true : undefined,
    className:
      severity === "error"
        ? "border-danger ring-1 ring-danger/40"
        : severity === "warning"
          ? "border-amber-400"
          : "border-border",
  };
}

/** `aria-invalid` and the class list for one editor field. */
function fieldProps(
  signals: readonly CurriculumSignal[] | undefined,
  server: ReadonlyMap<string, readonly string[]> | undefined,
  field: CurriculumField,
  base: string,
) {
  const state = fieldState(signals, server, field);
  return {
    "aria-invalid": state["aria-invalid"],
    className: `${base} ${state.className}`.trim(),
  };
}

const serverFieldLabels: Readonly<Record<string, string>> = {
  course_id: "Ders",
  exam_section_id: "Oturum",
  sort_order: "Sıra",
  access: "Erişim",
  exam_weight: "Ağırlık",
  is_required: "Zorunlu",
};

const inputClass =
  "rounded-md border border-border bg-surface px-2 py-1.5 text-sm";
/** `inputClass` without the border colour, which `fieldProps` decides. */
const fieldInputClass = "rounded-md border bg-surface px-2 py-1.5 text-sm";

export function CurriculumManager() {
  const queryClient = useQueryClient();
  const options = useQuery<CurriculumOptions, ApiError>(
    curriculumOptionsQueryOptions(),
  );
  const courses = useQuery(coursesQueryOptions());
  const [variantId, setVariantId] = useState<number | null>(null);
  const [draftRows, setDraftRows] = useState<CurriculumRow[] | null>(null);
  // The backend's errors from the last save, mapped onto the rows sent.
  // Any edit clears them: they described the list as it was sent.
  const [serverErrors, setServerErrors] = useState<ServerRowErrors | null>(
    null,
  );
  const mapping = useQuery<CurriculumMapping, ApiError>({
    ...curriculumMappingQueryOptions(variantId ?? 0),
    enabled: variantId !== null,
  });
  const rows = useMemo(
    () => draftRows ?? mapping.data?.courses ?? [],
    [draftRows, mapping.data],
  );
  const variant = options.data?.variants.find((item) => item.id === variantId);
  const sections = useMemo(
    () =>
      options.data?.sections.filter(
        (item) => item.exam_id === variant?.exam_id,
      ) ?? [],
    [options.data, variant?.exam_id],
  );
  const original = mapping.data?.courses ?? [];
  const added = rows.filter(
    (row) => !original.some((old) => old.course_id === row.course_id),
  ).length;
  const removed = original.filter(
    (old) => !rows.some((row) => row.course_id === old.course_id),
  ).length;
  const changed = rows.filter((row) => {
    const old = original.find((item) => item.course_id === row.course_id);
    return old && JSON.stringify(old) !== JSON.stringify(row);
  }).length;
  // The edited variant's courses' unit lists (the content browser's own
  // entries), for the "no published unit" check.
  const courseIds = useMemo(
    () => [...new Set(rows.map((row) => row.course_id))],
    [rows],
  );
  const unitQueries = useQueries({
    queries: courseIds.map((id) => courseUnitsQueryOptions(id)),
  }) as UseQueryResult<Unit[], ApiError>[];
  const unitsByCourse = new Map<number, Unit[]>();
  courseIds.forEach((id, index) => {
    const data = unitQueries[index]?.data;
    if (data !== undefined) unitsByCourse.set(id, data);
  });
  const signals =
    variant === undefined || mapping.data === undefined
      ? []
      : curriculumSignals(
          variant,
          rows,
          options.data?.sections ?? [],
          courses.data,
          { mode: "draft", unitsByCourse },
        );
  const rowSignals = signalsByCourse(signals);
  const signalTotals = countSignals(signals);

  function selectVariant(next: number | null) {
    if (
      draftRows !== null &&
      next !== variantId &&
      !window.confirm(
        "Kaydedilmemiş değişiklikler var. Başka varyanta geçerseniz kaybolur. Devam edilsin mi?",
      )
    ) {
      return;
    }
    setVariantId(next);
    setDraftRows(null);
    setServerErrors(null);
    mutation.reset();
  }

  function focusRow(courseId: number) {
    const row = document.getElementById(rowAnchorId(courseId));
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
    row?.focus({ preventScroll: true });
  }

  const mutation = useMutation<unknown, ApiError, UpdateCurriculumRequest>({
    mutationFn: (input) => updateCurriculum(variantId!, input),
    retry: 0,
    onSuccess: async () => {
      setServerErrors(null);
      setDraftRows(null);
      await queryClient.invalidateQueries({
        queryKey: curriculumMappingQueryKey(variantId!),
      });
    },
    onError: (error, input) => {
      // The backend stays the final word: its field errors are put back on
      // the rows that were sent (`courses.{index}.{field}`).
      setServerErrors(
        mapServerErrors(
          error.kind === "validation" ? error.fields : undefined,
          input.courses,
          error.kind === "authorization"
            ? "Müfredatı düzenleme yetkiniz yok."
            : error.kind === "not_found"
              ? "Sınav varyantı bulunamadı; sayfayı yenileyin."
              : error.message,
        ),
      );
    },
  });

  function patch(index: number, next: Partial<CurriculumRow>) {
    changeRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...next } : row)),
    );
  }
  function changeRows(updater: (current: CurriculumRow[]) => CurriculumRow[]) {
    setDraftRows((current) => updater(current ?? mapping.data?.courses ?? []));
    setServerErrors(null);
  }
  function move(index: number, delta: number) {
    changeRows((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next.map((row, i) => ({ ...row, sort_order: i + 1 }));
    });
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">Müfredat eşlemesi</h1>
      <p className="mt-1 text-sm text-muted">
        Kaydetme tam değiştirmedir; listede olmayan ders varyanttan kaldırılır.
      </p>
      <div className="mt-6">
        {options.isError ? (
          <p className="text-sm text-danger" role="alert">
            Sınav varyantları yüklenemedi: {options.error.message}
          </p>
        ) : options.data === undefined ? (
          <p aria-busy="true" className="text-sm text-muted">
            Varyantlar yükleniyor…
          </p>
        ) : (
          <CurriculumHealthOverview
            courses={courses.data}
            onSelect={(id) => selectVariant(id)}
            sections={options.data.sections}
            selectedId={variantId}
            variants={options.data.variants}
          />
        )}
      </div>
      <label className="mt-8 block max-w-md text-sm font-medium">
        Sınav varyantı
        <select
          className={`${inputClass} mt-1 w-full`}
          onChange={(event) =>
            selectVariant(
              event.target.value ? Number(event.target.value) : null,
            )
          }
          value={variantId ?? ""}
        >
          <option value="">Varyant seçin</option>
          {options.data?.variants.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.code}
              {item.is_active ? "" : " · Pasif"}
            </option>
          ))}
        </select>
      </label>
      {variantId !== null && mapping.isPending ? (
        <p className="mt-5">Eşleme yükleniyor…</p>
      ) : null}
      {mapping.isError ? (
        <p className="mt-5 text-danger" role="alert">
          {mapping.error.message}
        </p>
      ) : null}
      {mapping.data ? (
        <div className="mt-6 space-y-4">
          {variant === undefined ? null : (
            <VariantHealthDetail
              courses={courses.data}
              hasUnsavedChanges={draftRows !== null}
              onFocusCourse={focusRow}
              rows={rows}
              sections={options.data?.sections ?? []}
              signals={signals}
              variant={variant}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Eklenecek ders"
              className={inputClass}
              defaultValue=""
              onChange={(event) => {
                const course = courses.data?.find(
                  (item) => item.id === Number(event.target.value),
                );
                const section = sections[0];
                if (
                  course &&
                  section &&
                  !rows.some((row) => row.course_id === course.id)
                )
                  changeRows((current) => [
                    ...current,
                    {
                      course_id: course.id,
                      code: course.code,
                      name: course.name,
                      status: course.status,
                      section_code: section.code,
                      exam_section_id: section.id,
                      sort_order: current.length + 1,
                      access: "free",
                      exam_weight: null,
                      is_required: true,
                    },
                  ]);
                event.target.value = "";
              }}
            >
              <option value="">Ders ekle</option>
              {courses.data
                ?.filter(
                  (course) => !rows.some((row) => row.course_id === course.id),
                )
                .map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table
              aria-label="Ders eşlemesi"
              className="w-full min-w-[850px] text-left text-sm"
            >
              <thead>
                <tr className="border-b border-border">
                  <th className="p-2">Ders</th>
                  <th>Oturum</th>
                  <th>Erişim</th>
                  <th>Ağırlık</th>
                  <th>Zorunlu</th>
                  <th>Sıra</th>
                  <th>Sağlık</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const own = rowSignals.get(row.course_id);
                  const server = serverErrors?.byCourse.get(row.course_id);
                  const blocking = (own ?? []).filter(
                    (signal) => signal.severity === "error",
                  );
                  const currentSectionKnown = sections.some(
                    (section) => section.id === row.exam_section_id,
                  );
                  const foreignSection = options.data?.sections.find(
                    (section) => section.id === row.exam_section_id,
                  );
                  return (
                    <tr
                      className="border-b border-border focus:outline-2 focus:outline-primary"
                      id={rowAnchorId(row.course_id)}
                      key={row.course_id}
                      tabIndex={-1}
                    >
                      <td className="p-2">
                        <span className="font-medium">{row.name}</span>
                        <br />
                        <span className="text-xs text-muted">
                          {row.code} · {publishStatusLabels[row.status]}
                          {(() => {
                            const course = courses.data?.find(
                              (item) => item.id === row.course_id,
                            );
                            return course === undefined
                              ? null
                              : ` · ${course.unit_count} ünite`;
                          })()}
                        </span>
                        {blocking.length === 0 &&
                        server === undefined ? null : (
                          <ul className="mt-1 space-y-0.5 text-xs text-danger">
                            {blocking.map((signal) => (
                              <li key={signal.id}>{signal.message}</li>
                            ))}
                            {[...(server ?? new Map()).entries()].flatMap(
                              ([field, messages]: [
                                string,
                                readonly string[],
                              ]) =>
                                messages.map((message) => (
                                  <li key={`${field}-${message}`}>
                                    Backend ·{" "}
                                    {serverFieldLabels[field] ?? field}:{" "}
                                    {message}
                                  </li>
                                )),
                            )}
                          </ul>
                        )}
                      </td>
                      <td>
                        <select
                          aria-label={`${row.name} oturumu`}
                          {...fieldProps(
                            own,
                            server,
                            "exam_section_id",
                            fieldInputClass,
                          )}
                          onChange={(event) => {
                            const section = sections.find(
                              (item) => item.id === Number(event.target.value),
                            );
                            if (section)
                              patch(index, {
                                exam_section_id: section.id,
                                section_code: section.code,
                              });
                          }}
                          value={row.exam_section_id}
                        >
                          {currentSectionKnown ? null : (
                            // Keeps a section of another exam visible instead
                            // of silently showing the first valid one.
                            <option value={row.exam_section_id}>
                              ⚠{" "}
                              {foreignSection?.name ??
                                `Oturum #${row.exam_section_id}`}{" "}
                              (bu sınava ait değil)
                            </option>
                          )}
                          {sections.map((section) => (
                            <option key={section.id} value={section.id}>
                              {section.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          aria-label={`${row.name} erişimi`}
                          {...fieldProps(
                            own,
                            server,
                            "access",
                            fieldInputClass,
                          )}
                          onChange={(event) =>
                            patch(index, {
                              access: event.target.value as "free" | "premium",
                            })
                          }
                          value={row.access}
                        >
                          <option value="free">Ücretsiz</option>
                          <option value="premium">Premium</option>
                        </select>
                      </td>
                      <td>
                        <input
                          aria-label={`${row.name} sınav ağırlığı`}
                          {...fieldProps(
                            own,
                            server,
                            "exam_weight",
                            `${fieldInputClass} w-24`,
                          )}
                          max={200}
                          min={0}
                          step={1}
                          onChange={(event) =>
                            patch(index, {
                              exam_weight:
                                event.target.value === ""
                                  ? null
                                  : Number(event.target.value),
                            })
                          }
                          type="number"
                          value={row.exam_weight ?? ""}
                        />
                      </td>
                      <td>
                        <input
                          checked={row.is_required}
                          onChange={(event) =>
                            patch(index, { is_required: event.target.checked })
                          }
                          type="checkbox"
                        />
                      </td>
                      <td>
                        <span
                          {...fieldProps(
                            own,
                            server,
                            "sort_order",
                            "mr-1 inline-block min-w-6 rounded border px-1 text-xs text-muted tabular-nums",
                          )}
                          title="Sıra numarası"
                        >
                          {row.sort_order}
                        </span>
                        <button onClick={() => move(index, -1)} type="button">
                          ↑
                        </button>{" "}
                        <button onClick={() => move(index, 1)} type="button">
                          ↓
                        </button>
                      </td>
                      <td className="p-2">
                        <span
                          title={(own ?? [])
                            .map((signal) => signal.message)
                            .join("\n")}
                        >
                          <SignalCount compact signals={own ?? []} />
                        </span>
                      </td>
                      <td>
                        <button
                          className="text-danger"
                          onClick={() =>
                            changeRows((current) =>
                              current
                                .filter((_, i) => i !== index)
                                .map((item, i) => ({
                                  ...item,
                                  sort_order: i + 1,
                                })),
                            )
                          }
                          type="button"
                        >
                          Kaldır
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="rounded-md bg-surface-muted p-4 text-sm">
            <strong>Değişiklik özeti:</strong> {added} eklendi · {removed}{" "}
            kaldırıldı · {changed} değişti.
            {removed > 0 ? (
              <p className="mt-1 text-amber-800">
                Kaldırılan dersler bu varyantta öğrencilerden kaybolur;
                ilerlemeleri silinmez.
              </p>
            ) : null}
          </div>
          {signalTotals.errors > 0 ? (
            <p className="text-sm text-danger" id="curriculum-save-blocked">
              Kaydetmeden önce {signalTotals.errors} hatayı düzeltin. Uyarılar
              kaydı engellemez.
            </p>
          ) : signalTotals.warnings > 0 ? (
            <p className="text-sm text-amber-800">
              {signalTotals.warnings} uyarı var; kaydı engellemez. Backend yine
              kendi doğrulamasını yapar.
            </p>
          ) : null}
          <button
            aria-describedby={
              signalTotals.errors > 0 ? "curriculum-save-blocked" : undefined
            }
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={
              rows.length === 0 || mutation.isPending || signalTotals.errors > 0
            }
            onClick={() => {
              const body = { courses: requestRows(rows) };
              // Last client-side guard: the same schema the BFF applies.
              if (!updateCurriculumRequestSchema.safeParse(body).success) {
                setServerErrors({
                  byCourse: new Map(),
                  general: [
                    "Liste kaydedilebilir biçimde değil; işaretli alanları kontrol edin.",
                  ],
                });
                return;
              }
              if (
                !window.confirm(
                  `${added} eklenen, ${removed} kaldırılan ve ${changed} değişen satırla tam listeyi kaydetmek istiyor musunuz?` +
                    (signalTotals.warnings > 0
                      ? `\n\n${signalTotals.warnings} uyarı var (kaydı engellemez).`
                      : ""),
                )
              )
                return;
              mutation.mutate(body);
            }}
            type="button"
          >
            {mutation.isPending ? "Kaydediliyor…" : "Tam listeyi kaydet"}
          </button>
          {mutation.isSuccess ? (
            <span className="ml-3 text-sm text-emerald-700" role="status">
              Müfredat kaydedildi.
            </span>
          ) : null}
          {serverErrors !== null ? (
            <div
              className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
              role="alert"
            >
              <p className="font-medium">
                {mutation.isError
                  ? "Backend kaydı kabul etmedi."
                  : "Kaydedilemedi."}
              </p>
              {serverErrors.general.length === 0 ? null : (
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {serverErrors.general.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              )}
              {serverErrors.byCourse.size === 0 ? null : (
                <p className="mt-1">
                  {serverErrors.byCourse.size} satırdaki hatalar ilgili
                  alanlarda gösteriliyor.
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
