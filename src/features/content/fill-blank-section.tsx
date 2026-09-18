"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useFieldArray, useWatch, type UseFormReturn } from "react-hook-form";

import { FieldError } from "@/features/content/editor-field-error";
import type { EditorFormValues } from "@/features/content/editor-form";
import { PreviewShell } from "@/features/content/editor-preview";
import { duplicateChoiceValues } from "@/features/content/fill-blank-form";
import {
  blanksAfterChoiceRemoval,
  blanksAfterChoiceRename,
  insertPlaceholderAt,
  parseFillBlankPlaceholders,
  syncBlanksToPlaceholderCount,
} from "@/lib/content/fill-blank-placeholders";

const MUTATE = { shouldDirty: true, shouldValidate: true } as const;

export function FillBlankFields({
  form,
}: {
  form: UseFormReturn<EditorFormValues>;
}) {
  const templateField = form.register("fillBlank.template");
  const templateRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingCaret = useRef<number | null>(null);
  const errors = form.formState.errors.fillBlank;

  const branch = useWatch({ control: form.control, name: "fillBlank" });
  const placeholders = parseFillBlankPlaceholders(branch.template);

  const {
    fields: choiceFields,
    append: appendChoice,
    remove: removeChoice,
  } = useFieldArray({
    control: form.control,
    name: "fillBlank.choices",
    keyName: "fieldKey",
  });

  // While react-hook-form resizes an array field an entry can momentarily
  // exist without its value, so every read of these arrays is defensive.
  const choices = branch.choices.map((choice) => choice?.value?.trim() ?? "");
  const usableChoices = choices.filter((choice) => choice.length > 0);
  const duplicates = duplicateChoiceValues(
    branch.choices.map((choice) => ({ value: choice?.value ?? "" })),
  );

  // The number of answer controls is derived from the template, never from a
  // separate counter: typing, pasting or deleting a token is the only way the
  // blank count ever changes.
  useEffect(() => {
    const current = form.getValues("fillBlank.blanks");
    if (current.length === placeholders.length) return;

    const synced = syncBlanksToPlaceholderCount(
      current.map((blank) => blank?.value ?? ""),
      placeholders.length,
    );
    form.setValue(
      "fillBlank.blanks",
      synced.map((value) => ({ value })),
      MUTATE,
    );
  }, [form, placeholders.length]);

  // Restores the caret after an inserted token, so the keyboard workflow
  // survives "Boşluk ekle".
  useEffect(() => {
    const caret = pendingCaret.current;
    const textarea = templateRef.current;
    if (caret === null || textarea === null) return;

    pendingCaret.current = null;
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
  }, [branch.template]);

  function handleInsertPlaceholder() {
    const textarea = templateRef.current;
    const template = form.getValues("fillBlank.template");
    const start = textarea?.selectionStart ?? template.length;
    const end = textarea?.selectionEnd ?? start;

    const inserted = insertPlaceholderAt(template, start, end);
    pendingCaret.current = inserted.caret;
    form.setValue("fillBlank.template", inserted.template, MUTATE);
  }

  function handleChoiceChange(index: number, next: string) {
    const previous = form.getValues(`fillBlank.choices.${index}.value`);
    form.setValue(`fillBlank.choices.${index}.value`, next, MUTATE);

    // Editing a choice migrates the answers that pointed at its exact old
    // value, instead of orphaning a question the editor did not break.
    const blanks = form.getValues("fillBlank.blanks");
    const migrated = blanksAfterChoiceRename(
      blanks.map((blank) => blank?.value ?? ""),
      previous,
      next,
    );
    form.setValue(
      "fillBlank.blanks",
      migrated.map((value) => ({ value })),
      MUTATE,
    );
  }

  function handleBlankChange(index: number, next: string) {
    form.setValue(`fillBlank.blanks.${index}.value`, next, MUTATE);
  }

  function handleChoiceRemove(index: number) {
    const removed = form.getValues(`fillBlank.choices.${index}.value`);
    removeChoice(index);

    // Any answer that used it is cleared and the form goes invalid — never
    // silently substituted with a different choice.
    const blanks = form.getValues("fillBlank.blanks");
    const cleared = blanksAfterChoiceRemoval(
      blanks.map((blank) => blank?.value ?? ""),
      removed,
    );
    form.setValue(
      "fillBlank.blanks",
      cleared.map((value) => ({ value })),
      MUTATE,
    );
  }

  return (
    <>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-sm font-medium" htmlFor="template">
            Cümle şablonu
          </label>
          <button
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-muted"
            onClick={handleInsertPlaceholder}
            type="button"
          >
            <Plus aria-hidden="true" className="size-4" />
            Boşluk ekle
          </button>
        </div>
        <textarea
          aria-describedby="template-hint template-error"
          className="mt-1.5 min-h-28 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          id="template"
          {...templateField}
          ref={(element) => {
            templateRef.current = element;
            templateField.ref(element);
          }}
        />
        <p className="mt-1.5 text-xs text-muted" id="template-hint">
          {placeholders.length === 0
            ? "Boşluk bulunamadı. İmlecin olduğu yere boşluk eklemek için “Boşluk ekle”yi kullanın."
            : `${placeholders.length} boşluk bulundu.`}
        </p>
        <FieldError id="template-error" message={errors?.template?.message} />
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Seçenekler</legend>
        <p className="mt-1 text-xs text-muted">
          Seçenek eklerseniz cevaplar bu listeden seçilir. Liste boşsa cevaplar
          serbest metin olarak yazılır.
        </p>
        <div className="mt-2 space-y-2">
          {choiceFields.map((field, index) => (
            <div className="flex items-start gap-2" key={field.fieldKey}>
              <input
                aria-label={`${index + 1}. seçenek metni`}
                className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm"
                onChange={(event) =>
                  handleChoiceChange(index, event.target.value)
                }
                value={branch.choices[index]?.value ?? ""}
              />
              <button
                aria-label={`${index + 1}. seçeneği kaldır`}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted hover:text-red-700"
                onClick={() => handleChoiceRemove(index)}
                type="button"
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          className="mt-2 inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-muted"
          onClick={() => appendChoice({ value: "" })}
          type="button"
        >
          <Plus aria-hidden="true" className="size-4" />
          Seçenek ekle
        </button>
        {duplicates.length === 0 ? null : (
          <p className="mt-1.5 text-xs text-amber-800" role="status">
            Aynı seçenek birden fazla kez yazılmış: {duplicates.join(", ")}.
          </p>
        )}
        <FieldError
          id="choices-error"
          message={
            errors?.choices?.root?.message ??
            errors?.choices?.find?.((choice) => choice?.value?.message)?.value
              ?.message
          }
        />
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">Doğru cevaplar</legend>
        {placeholders.length === 0 ? (
          <p className="mt-1.5 text-xs text-muted">
            Şablona en az bir boşluk ekleyin.
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            {placeholders.map((placeholder, index) => {
              const label = `Boşluk ${index + 1} · ${placeholder.token}`;
              const id = `blank-${index}`;
              return (
                <div key={`${placeholder.token}-${placeholder.start}`}>
                  <label className="text-xs font-medium" htmlFor={id}>
                    {label}
                  </label>
                  {/*
                   * Controlled rather than registered: the option list and the
                   * selected value are derived from the same render, so editing
                   * a choice can never leave the select pointing at an option
                   * that does not exist yet and silently resetting itself.
                   */}
                  {usableChoices.length === 0 ? (
                    <input
                      className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                      id={id}
                      onChange={(event) =>
                        handleBlankChange(index, event.target.value)
                      }
                      value={branch.blanks[index]?.value ?? ""}
                    />
                  ) : (
                    <select
                      className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                      id={id}
                      onChange={(event) =>
                        handleBlankChange(index, event.target.value)
                      }
                      value={branch.blanks[index]?.value ?? ""}
                    >
                      <option value="">Seçenek seçin</option>
                      {usableChoices.map((choice, choiceIndex) => (
                        <option key={`${choice}-${choiceIndex}`} value={choice}>
                          {choice}
                        </option>
                      ))}
                    </select>
                  )}
                  <FieldError
                    id={`${id}-error`}
                    message={errors?.blanks?.[index]?.value?.message}
                  />
                </div>
              );
            })}
          </div>
        )}
        <FieldError
          id="blanks-error"
          message={errors?.blanks?.root?.message ?? errors?.blanks?.message}
        />
      </fieldset>
    </>
  );
}

export function FillBlankPreview({ values }: { values: EditorFormValues }) {
  const branch = values.fillBlank;
  const placeholders = parseFillBlankPlaceholders(branch.template);
  const blanks = branch.blanks.map((blank) => blank?.value ?? "");

  // Template text is user input rendered as React text nodes only: no HTML
  // parsing and no dangerouslySetInnerHTML anywhere on this path.
  const segments: { text: string; blank: number | null }[] = [];
  let cursor = 0;
  placeholders.forEach((placeholder, index) => {
    segments.push({
      text: branch.template.slice(cursor, placeholder.start),
      blank: null,
    });
    segments.push({ text: "", blank: index });
    cursor = placeholder.end;
  });
  segments.push({ text: branch.template.slice(cursor), blank: null });

  return (
    <PreviewShell
      answerLabel={
        placeholders.length === 0 ||
        blanks.every((blank) => blank.trim() === "")
          ? "Seçilmedi"
          : blanks
              .map(
                (blank, index) => `Boşluk ${index + 1}: ${blank.trim() || "—"}`,
              )
              .join(" · ")
      }
      difficulty={values.difficulty}
      explanation={values.explanation}
      scopes={values.scopes}
      type="fill_blank"
    >
      <div className="space-y-5">
        <p className="whitespace-pre-wrap text-base font-medium">
          {branch.template.trim() === ""
            ? "Cümle şablonu burada görünecek."
            : segments.map((segment, index) =>
                segment.blank === null ? (
                  <span key={index}>{segment.text}</span>
                ) : (
                  <span
                    className="mx-0.5 inline-flex min-w-16 justify-center rounded border border-dashed border-emerald-400 bg-emerald-50 px-2 text-sm text-emerald-950"
                    key={index}
                  >
                    {blanks[segment.blank]?.trim() ||
                      `Boşluk ${segment.blank + 1}`}
                  </span>
                ),
              )}
        </p>

        {placeholders.length === 0 ? null : (
          <ol className="space-y-2">
            {placeholders.map((placeholder, index) => (
              <li
                className="flex gap-3 rounded-md border border-border bg-surface-muted px-3 py-2.5 text-sm"
                key={`${placeholder.token}-${placeholder.start}`}
              >
                <span className="font-semibold">Boşluk {index + 1}</span>
                <span className="min-w-0 whitespace-pre-wrap">
                  {blanks[index]?.trim() || "Cevap seçilmedi"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </PreviewShell>
  );
}
