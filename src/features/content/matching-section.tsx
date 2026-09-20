"use client";

import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";

import { FieldError } from "@/features/content/editor-field-error";
import type { EditorFormValues } from "@/features/content/editor-form";
import { PreviewShell } from "@/features/content/editor-preview";
import {
  nextLeftId,
  nextRightId,
  pairsAfterLeftAdded,
  pairsAfterLeftRemoval,
  pairsAfterRightRemoval,
} from "@/features/content/matching-form";

const MUTATE = { shouldDirty: true, shouldValidate: true } as const;

/** Never renders an empty string, so every control keeps a usable label. */
function itemLabel(text: string, index: number, prefix: string): string {
  const trimmed = text.trim();
  return trimmed.length === 0 ? `${prefix} ${index + 1}` : trimmed;
}

export function MatchingFields({
  form,
}: {
  form: UseFormReturn<EditorFormValues>;
}) {
  const {
    fields: leftFields,
    append: appendLeft,
    remove: removeLeft,
  } = useFieldArray({
    control: form.control,
    name: "matching.left",
    keyName: "fieldKey",
  });
  const {
    fields: rightFields,
    append: appendRight,
    remove: removeRight,
  } = useFieldArray({
    control: form.control,
    name: "matching.right",
    keyName: "fieldKey",
  });

  const branch = form.getValues("matching");
  const errors = form.formState.errors.matching;

  function addLeft() {
    const id = nextLeftId(
      form.getValues("matching.left").map((item) => item.id),
    );
    appendLeft({ id, text: "" });
    // The new row arrives unselected: adding a left item can never invent an
    // answer, so the form stays invalid until the author picks a target.
    form.setValue(
      "matching.pairs",
      pairsAfterLeftAdded(form.getValues("matching.pairs"), id),
      MUTATE,
    );
  }

  function removeLeftAt(index: number) {
    if (leftFields.length <= 2) return;
    const removedId = form.getValues(`matching.left.${index}.id`);
    removeLeft(index);
    // Only this row's pair goes; every remaining id and selection is untouched.
    form.setValue(
      "matching.pairs",
      pairsAfterLeftRemoval(form.getValues("matching.pairs"), removedId),
      MUTATE,
    );
  }

  function addRight() {
    const id = nextRightId(
      form.getValues("matching.right").map((item) => item.id),
    );
    appendRight({ id, text: "" });
  }

  function removeRightAt(index: number) {
    if (rightFields.length <= 2) return;
    const removedId = form.getValues(`matching.right.${index}.id`);
    removeRight(index);
    // Selections pointing at the removed item are cleared, never re-pointed at
    // a neighbour: a silently rewritten answer key is worse than an invalid one.
    form.setValue(
      "matching.pairs",
      pairsAfterRightRemoval(form.getValues("matching.pairs"), removedId),
      MUTATE,
    );
  }

  return (
    <>
      <div>
        <label className="text-sm font-medium" htmlFor="matching-instruction">
          Yönerge (opsiyonel)
        </label>
        <input
          className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          id="matching-instruction"
          {...form.register("matching.instruction")}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="matching-left-heading" className="space-y-3">
          <h3 className="text-sm font-semibold" id="matching-left-heading">
            Sol sütun ve eşleşmeler
          </h3>
          <ul className="space-y-3">
            {leftFields.map((field, index) => {
              const leftId = field.id;
              const label = itemLabel(
                branch.left[index]?.text ?? "",
                index,
                "Sol öğe",
              );
              const pairIndex = branch.pairs.findIndex(
                (pair) => pair.leftId === leftId,
              );

              return (
                <li className="space-y-2" key={field.fieldKey}>
                  <div className="flex gap-2">
                    <input
                      type="hidden"
                      {...form.register(`matching.left.${index}.id`)}
                    />
                    <div className="flex min-w-0 flex-1 rounded-md border border-border bg-surface focus-within:outline-2 focus-within:outline-primary">
                      <span className="border-r border-border bg-surface-muted px-3 py-2 text-sm font-semibold">
                        {leftId}
                      </span>
                      <input
                        aria-label={`Sol öğe ${index + 1} metni`}
                        className="min-w-0 flex-1 rounded-r-md px-3 py-2 text-sm outline-none"
                        {...form.register(`matching.left.${index}.text`)}
                      />
                    </div>
                    <button
                      aria-label={`${label} sol öğesini kaldır`}
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={leftFields.length <= 2}
                      onClick={() => removeLeftAt(index)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                  <FieldError
                    id={`matching-left-${index}-error`}
                    message={errors?.left?.[index]?.text?.message}
                  />
                  {pairIndex === -1 ? null : (
                    <div className="flex items-center gap-2 pl-3">
                      <span aria-hidden="true" className="text-sm text-muted">
                        →
                      </span>
                      <input
                        type="hidden"
                        {...form.register(`matching.pairs.${pairIndex}.leftId`)}
                      />
                      <select
                        aria-label={`${label} için eşleşen sağ öğe`}
                        className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm"
                        {...form.register(
                          `matching.pairs.${pairIndex}.rightId`,
                        )}
                      >
                        <option value="">Sağ öğe seçin</option>
                        {branch.right.map((item, rightIndex) => (
                          <option key={item.id} value={item.id}>
                            {item.id}:{" "}
                            {itemLabel(item.text, rightIndex, "Sağ öğe")}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {pairIndex === -1 ? null : (
                    <FieldError
                      id={`matching-pair-${index}-error`}
                      message={errors?.pairs?.[pairIndex]?.rightId?.message}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          <FieldError
            id="matching-left-error"
            message={errors?.left?.root?.message ?? errors?.left?.message}
          />
          <FieldError
            id="matching-pairs-error"
            message={errors?.pairs?.root?.message ?? errors?.pairs?.message}
          />
          <button
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-muted"
            onClick={addLeft}
            type="button"
          >
            <Plus aria-hidden="true" className="size-4" />
            Sol öğe ekle
          </button>
        </section>

        <section aria-labelledby="matching-right-heading" className="space-y-3">
          <h3 className="text-sm font-semibold" id="matching-right-heading">
            Sağ sütun
          </h3>
          <ul className="space-y-3">
            {rightFields.map((field, index) => {
              const label = itemLabel(
                branch.right[index]?.text ?? "",
                index,
                "Sağ öğe",
              );

              return (
                <li className="space-y-2" key={field.fieldKey}>
                  <div className="flex gap-2">
                    <input
                      type="hidden"
                      {...form.register(`matching.right.${index}.id`)}
                    />
                    <div className="flex min-w-0 flex-1 rounded-md border border-border bg-surface focus-within:outline-2 focus-within:outline-primary">
                      <span className="border-r border-border bg-surface-muted px-3 py-2 text-sm font-semibold">
                        {field.id}
                      </span>
                      <input
                        aria-label={`Sağ öğe ${index + 1} metni`}
                        className="min-w-0 flex-1 rounded-r-md px-3 py-2 text-sm outline-none"
                        {...form.register(`matching.right.${index}.text`)}
                      />
                    </div>
                    <button
                      aria-label={`${label} sağ öğesini kaldır`}
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={rightFields.length <= 2}
                      onClick={() => removeRightAt(index)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                  <FieldError
                    id={`matching-right-${index}-error`}
                    message={errors?.right?.[index]?.text?.message}
                  />
                </li>
              );
            })}
          </ul>
          <FieldError
            id="matching-right-error"
            message={errors?.right?.root?.message ?? errors?.right?.message}
          />
          <button
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-muted"
            onClick={addRight}
            type="button"
          >
            <Plus aria-hidden="true" className="size-4" />
            Sağ öğe ekle
          </button>
          <p className="text-xs text-muted">
            Aynı sağ öğe birden fazla sol öğeyle eşleşebilir.
          </p>
        </section>
      </div>

      <div className="rounded-md border border-border bg-surface-muted px-3 py-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" {...form.register("matching.partialCredit")} />
          Kısmi puan ver
        </label>
        <p className="mt-1.5 text-xs text-muted">
          Açık olduğunda öğrencinin doğru eşleştirdiği çiftler kısmi puana katkı
          sağlar. Kapalıyken tüm eşleşmeler doğru olmadıkça cevap yanlış
          sayılır.
        </p>
      </div>
    </>
  );
}

export function MatchingPreview({ values }: { values: EditorFormValues }) {
  const branch = values.matching;
  const rightById = new Map(
    branch.right.map((item, index) => [
      item.id,
      itemLabel(item.text, index, "Sağ öğe"),
    ]),
  );

  const mapped = branch.left.map((item, index) => {
    const pair = branch.pairs.find((entry) => entry.leftId === item.id);
    const rightLabel =
      pair === undefined || pair.rightId.length === 0
        ? null
        : (rightById.get(pair.rightId) ?? null);

    return {
      id: item.id,
      left: itemLabel(item.text, index, "Sol öğe"),
      right: rightLabel,
    };
  });

  const complete = mapped.filter((entry) => entry.right !== null).length;

  return (
    <PreviewShell
      answerLabel={`${complete}/${mapped.length} eşleşme seçildi`}
      difficulty={values.difficulty}
      explanation={values.explanation}
      scopes={values.scopes}
      type="matching"
    >
      <div className="space-y-5">
        {branch.instruction.trim().length === 0 ? null : (
          <p className="whitespace-pre-wrap text-base font-medium">
            {branch.instruction.trim()}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Sol
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {branch.left.map((item, index) => (
                <li
                  className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
                  key={item.id}
                >
                  {itemLabel(item.text, index, "Sol öğe")}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Sağ
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {branch.right.map((item, index) => (
                <li
                  className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
                  key={item.id}
                >
                  {itemLabel(item.text, index, "Sağ öğe")}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Doğru eşleşme
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {mapped.map((entry) => (
              <li
                className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950"
                key={entry.id}
              >
                {entry.left} → {entry.right ?? "Seçilmedi"}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-muted">
          Kısmi puan: {branch.partialCredit ? "Açık" : "Kapalı"}
        </p>
      </div>
    </PreviewShell>
  );
}
