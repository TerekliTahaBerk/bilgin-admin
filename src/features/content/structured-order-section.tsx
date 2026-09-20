"use client";

import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";

import { FieldError } from "@/features/content/editor-field-error";
import type { EditorFormValues } from "@/features/content/editor-form";
import { PreviewShell } from "@/features/content/editor-preview";
import { nextStructuredOrderItemId } from "@/features/content/structured-order-form";
import {
  appendIdToOrder,
  moveIdInOrder,
  removeIdFromOrder,
  resolveOrderedItems,
} from "@/lib/content/structured-items";

const MUTATE = { shouldDirty: true, shouldValidate: true } as const;

/**
 * Ordering and word order share this surface because they share a lifecycle:
 * an instruction, a collection of rows, and a correct order over their ids.
 * The branch key is a prop rather than a runtime lookup, so every form path
 * stays statically typed.
 */
export type StructuredOrderBranchKey = "ordering" | "wordOrder";

export type StructuredOrderLabels = Readonly<{
  instructionLabel: string;
  instructionPlaceholder: string;
  itemsHeading: string;
  itemLabel: string;
  addLabel: string;
  orderHeading: string;
  orderHint: string;
}>;

export function StructuredOrderFields({
  form,
  branchKey,
  labels,
}: {
  form: UseFormReturn<EditorFormValues>;
  branchKey: StructuredOrderBranchKey;
  labels: StructuredOrderLabels;
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: `${branchKey}.items`,
    keyName: "fieldKey",
  });

  const branch = form.getValues(branchKey);
  const errors = form.formState.errors[branchKey];
  const instructionId = `${branchKey}-instruction`;

  function addItem() {
    const id = nextStructuredOrderItemId(
      form.getValues(`${branchKey}.items`).map((item) => item.id),
    );
    append({ id, text: "" });
    // A new row joins the correct order at the end; the author moves it from
    // there. The order is always structurally complete.
    form.setValue(
      `${branchKey}.order`,
      appendIdToOrder(form.getValues(`${branchKey}.order`), id),
      MUTATE,
    );
  }

  function removeItemAt(index: number) {
    if (fields.length <= 2) return;
    const removedId = form.getValues(`${branchKey}.items.${index}.id`);
    remove(index);
    // Deleting a row never renumbers the survivors: their ids, their text and
    // their relative position in the correct order all stay as they were.
    form.setValue(
      `${branchKey}.order`,
      removeIdFromOrder(form.getValues(`${branchKey}.order`), removedId),
      MUTATE,
    );
  }

  return (
    <>
      <div>
        <label className="text-sm font-medium" htmlFor={instructionId}>
          {labels.instructionLabel}
        </label>
        <input
          aria-describedby={`${instructionId}-error`}
          className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          id={instructionId}
          placeholder={labels.instructionPlaceholder}
          {...form.register(`${branchKey}.instruction`)}
        />
        <FieldError
          id={`${instructionId}-error`}
          message={errors?.instruction?.message}
        />
      </div>

      <section
        aria-labelledby={`${branchKey}-items-heading`}
        className="space-y-3"
      >
        <h3 className="text-sm font-semibold" id={`${branchKey}-items-heading`}>
          {labels.itemsHeading}
        </h3>
        <ul className="space-y-3">
          {fields.map((field, index) => (
            <li key={field.fieldKey}>
              <div className="flex gap-2">
                <input
                  type="hidden"
                  {...form.register(`${branchKey}.items.${index}.id`)}
                />
                <div className="flex min-w-0 flex-1 rounded-md border border-border bg-surface focus-within:outline-2 focus-within:outline-primary">
                  <span className="border-r border-border bg-surface-muted px-3 py-2 text-sm font-semibold">
                    {field.id}
                  </span>
                  <input
                    aria-label={`${labels.itemLabel} ${index + 1} metni`}
                    className="min-w-0 flex-1 rounded-r-md px-3 py-2 text-sm outline-none"
                    {...form.register(`${branchKey}.items.${index}.text`)}
                  />
                </div>
                <button
                  aria-label={`${labels.itemLabel} ${index + 1} satırını kaldır`}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={fields.length <= 2}
                  onClick={() => removeItemAt(index)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              </div>
              <FieldError
                id={`${branchKey}-item-${index}-error`}
                message={errors?.items?.[index]?.text?.message}
              />
            </li>
          ))}
        </ul>
        <FieldError
          id={`${branchKey}-items-error`}
          message={errors?.items?.root?.message ?? errors?.items?.message}
        />
        <button
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-muted"
          onClick={addItem}
          type="button"
        >
          <Plus aria-hidden="true" className="size-4" />
          {labels.addLabel}
        </button>
      </section>

      <CorrectOrderList
        branchKey={branchKey}
        form={form}
        itemLabel={labels.itemLabel}
        items={branch.items}
        order={branch.order}
        orderHeading={labels.orderHeading}
        orderHint={labels.orderHint}
      />
      <FieldError
        id={`${branchKey}-order-error`}
        message={errors?.order?.root?.message ?? errors?.order?.message}
      />
    </>
  );
}

/**
 * The correct-order editor. Pointer users can drag a row; keyboard users use
 * the explicit "Yukarı taşı" / "Aşağı taşı" buttons, which are the primary
 * interaction and not a fallback — drag and drop is never the only way to
 * reorder, and no drag-and-drop dependency is involved. All reordering runs
 * through moveIdInOrder, a pure helper that is testable without a browser.
 */
function CorrectOrderList({
  form,
  branchKey,
  items,
  order,
  itemLabel,
  orderHeading,
  orderHint,
}: {
  form: UseFormReturn<EditorFormValues>;
  branchKey: StructuredOrderBranchKey;
  items: { id: string; text: string }[];
  order: string[];
  itemLabel: string;
  orderHeading: string;
  orderHint: string;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const pendingFocus = useRef<{ id: string; offset: number } | null>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const resolved = resolveOrderedItems(items, order, itemLabel);

  // Keeps the keyboard user where they were: after a move the same row's
  // button keeps focus, and when that button has just become disabled focus
  // lands on the row's other move button instead of disappearing to <body>.
  useEffect(() => {
    const pending = pendingFocus.current;
    if (pending === null) return;
    pendingFocus.current = null;

    const preferred = buttonRefs.current.get(`${pending.id}:${pending.offset}`);
    if (preferred !== null && preferred !== undefined && !preferred.disabled) {
      preferred.focus();
      return;
    }

    buttonRefs.current.get(`${pending.id}:${-pending.offset}`)?.focus();
  });

  function move(id: string, offset: number) {
    const next = moveIdInOrder(
      form.getValues(`${branchKey}.order`),
      id,
      offset,
    );
    pendingFocus.current = { id, offset };
    form.setValue(`${branchKey}.order`, next, MUTATE);
  }

  function dropOn(targetId: string) {
    const current = form.getValues(`${branchKey}.order`);
    if (draggingId === null || draggingId === targetId) return;

    const from = current.indexOf(draggingId);
    const to = current.indexOf(targetId);
    if (from === -1 || to === -1) return;

    form.setValue(
      `${branchKey}.order`,
      moveIdInOrder(current, draggingId, to - from),
      MUTATE,
    );
    setDraggingId(null);
  }

  return (
    <section
      aria-labelledby={`${branchKey}-order-heading`}
      className="space-y-3 rounded-md border border-border bg-surface-muted p-3"
    >
      <div>
        <h3 className="text-sm font-semibold" id={`${branchKey}-order-heading`}>
          {orderHeading}
        </h3>
        <p className="mt-1 text-xs text-muted" id={`${branchKey}-order-hint`}>
          {orderHint}
        </p>
      </div>
      <ol
        aria-describedby={`${branchKey}-order-hint`}
        className="space-y-2"
        // A native list, so the order is announced as a list of positions and
        // the whole control works with zero window listeners.
      >
        {resolved.map((entry, index) => (
          <li
            className={`flex items-center gap-2 rounded-md border bg-surface px-2 py-2 ${
              draggingId === entry.id
                ? "border-primary"
                : entry.known
                  ? "border-border"
                  : "border-red-300"
            }`}
            draggable
            key={entry.id}
            onDragEnd={() => setDraggingId(null)}
            onDragOver={(event) => event.preventDefault()}
            onDragStart={() => setDraggingId(entry.id)}
            onDrop={(event) => {
              event.preventDefault();
              dropOn(entry.id);
            }}
          >
            <GripVertical
              aria-hidden="true"
              className="size-4 shrink-0 text-muted"
            />
            <span className="w-5 shrink-0 text-sm font-semibold text-muted">
              {index + 1}.
            </span>
            <span className="min-w-0 flex-1 break-words text-sm">
              {entry.label}
            </span>
            <button
              aria-label={`${entry.label} öğesini yukarı taşı`}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
              disabled={index === 0}
              onClick={() => move(entry.id, -1)}
              ref={(node) => {
                buttonRefs.current.set(`${entry.id}:-1`, node);
              }}
              type="button"
            >
              <ArrowUp aria-hidden="true" className="size-4" />
            </button>
            <button
              aria-label={`${entry.label} öğesini aşağı taşı`}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
              disabled={index === resolved.length - 1}
              onClick={() => move(entry.id, 1)}
              ref={(node) => {
                buttonRefs.current.set(`${entry.id}:1`, node);
              }}
              type="button"
            >
              <ArrowDown aria-hidden="true" className="size-4" />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function StructuredOrderPreview({
  values,
  branchKey,
  itemLabel,
  itemsHeading,
  answerHeading,
  scoringNote,
  answerBody,
}: {
  values: EditorFormValues;
  branchKey: StructuredOrderBranchKey;
  itemLabel: string;
  itemsHeading: string;
  answerHeading: string;
  scoringNote: string;
  answerBody?: (labels: string[]) => ReactNode;
}) {
  const branch = values[branchKey];
  const resolved = resolveOrderedItems(branch.items, branch.order, itemLabel);
  const type = branchKey === "ordering" ? "ordering" : "word_order";

  return (
    <PreviewShell
      answerLabel={resolved.map((entry) => entry.label).join(" → ")}
      difficulty={values.difficulty}
      explanation={values.explanation}
      scopes={values.scopes}
      type={type}
    >
      <div className="space-y-5">
        <p className="whitespace-pre-wrap text-base font-medium">
          {branch.instruction.trim() || "Yönerge burada görünecek."}
        </p>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {itemsHeading}
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {branch.items.map((item, index) => (
              <li
                className="rounded-md border border-border bg-surface-muted px-3 py-1.5 text-sm"
                key={item.id}
              >
                {item.text.trim() || `${itemLabel} ${index + 1}`}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {answerHeading}
          </p>
          {answerBody === undefined ? (
            <ol className="mt-1.5 space-y-1.5">
              {resolved.map((entry, index) => (
                <li
                  className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950"
                  key={entry.id}
                >
                  {index + 1}. {entry.label}
                </li>
              ))}
            </ol>
          ) : (
            answerBody(resolved.map((entry) => entry.label))
          )}
        </div>
        <p className="text-xs text-muted">{scoringNote}</p>
      </div>
    </PreviewShell>
  );
}
