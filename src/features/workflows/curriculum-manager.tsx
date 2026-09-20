"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import type {
  CurriculumRow,
  UpdateCurriculumRequest,
} from "@/contracts/admin/workflows";
import { coursesQueryOptions } from "@/features/content/content-queries";
import {
  getCurriculumMapping,
  getCurriculumOptions,
  updateCurriculum,
} from "@/features/workflows/workflow-client";
import type { ApiError } from "@/lib/api/error";

const inputClass =
  "rounded-md border border-border bg-surface px-2 py-1.5 text-sm";

export function CurriculumManager() {
  const queryClient = useQueryClient();
  const options = useQuery({
    queryKey: ["curriculum", "options"],
    queryFn: getCurriculumOptions,
    staleTime: 300_000,
  });
  const courses = useQuery(coursesQueryOptions());
  const [variantId, setVariantId] = useState<number | null>(null);
  const [draftRows, setDraftRows] = useState<CurriculumRow[] | null>(null);
  const mapping = useQuery<
    { exam_variant: { code: string; name: string }; courses: CurriculumRow[] },
    ApiError
  >({
    queryKey: ["curriculum", "mapping", variantId],
    queryFn: () => getCurriculumMapping(variantId!),
    enabled: variantId !== null,
    refetchOnWindowFocus: false,
  });
  const rows = draftRows ?? mapping.data?.courses ?? [];
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
  const mutation = useMutation<unknown, ApiError, UpdateCurriculumRequest>({
    mutationFn: (input) => updateCurriculum(variantId!, input),
    retry: 0,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["curriculum", "mapping", variantId],
      });
    },
  });

  function patch(index: number, next: Partial<CurriculumRow>) {
    changeRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...next } : row)),
    );
  }
  function changeRows(updater: (current: CurriculumRow[]) => CurriculumRow[]) {
    setDraftRows((current) => updater(current ?? mapping.data?.courses ?? []));
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
      <label className="mt-5 block max-w-md text-sm font-medium">
        Sınav varyantı
        <select
          className={`${inputClass} mt-1 w-full`}
          onChange={(event) => {
            setVariantId(
              event.target.value ? Number(event.target.value) : null,
            );
            setDraftRows(null);
          }}
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
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-2">Ders</th>
                  <th>Oturum</th>
                  <th>Erişim</th>
                  <th>Ağırlık</th>
                  <th>Zorunlu</th>
                  <th>Sıra</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr className="border-b border-border" key={row.course_id}>
                    <td className="p-2">
                      <span className="font-medium">{row.name}</span>
                      <br />
                      <span className="text-xs text-muted">
                        {row.code} · {row.status}
                      </span>
                    </td>
                    <td>
                      <select
                        className={inputClass}
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
                        {sections.map((section) => (
                          <option key={section.id} value={section.id}>
                            {section.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className={inputClass}
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
                        className={`${inputClass} w-24`}
                        max={200}
                        min={0}
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
                      <button onClick={() => move(index, -1)} type="button">
                        ↑
                      </button>{" "}
                      <button onClick={() => move(index, 1)} type="button">
                        ↓
                      </button>
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
                ))}
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
          <button
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={rows.length === 0 || mutation.isPending}
            onClick={() => {
              if (
                !window.confirm(
                  `${added} eklenen, ${removed} kaldırılan ve ${changed} değişen satırla tam listeyi kaydetmek istiyor musunuz?`,
                )
              )
                return;
              mutation.mutate({
                courses: rows.map(
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
                ),
              });
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
          {mutation.isError ? (
            <p className="text-sm text-danger" role="alert">
              {mutation.error.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
