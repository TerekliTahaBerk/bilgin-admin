"use client";

import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";

import { FieldError } from "@/features/content/editor-field-error";
import type { EditorFormValues } from "@/features/content/editor-form";
import { PreviewShell } from "@/features/content/editor-preview";
import {
  correctAnswerAfterOptionRemoval,
  nextOptionId,
} from "@/features/content/multiple-choice-form";

export function MultipleChoiceFields({
  form,
}: {
  form: UseFormReturn<EditorFormValues>;
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "multipleChoice.options",
    keyName: "fieldKey",
  });
  const errors = form.formState.errors.multipleChoice;

  function removeOptionAt(index: number) {
    if (fields.length <= 2) return;
    const removedId = form.getValues(`multipleChoice.options.${index}.id`);
    const nextCorrect = correctAnswerAfterOptionRemoval(
      form.getValues("multipleChoice.correctOptionId"),
      removedId,
    );
    remove(index);
    form.setValue("multipleChoice.correctOptionId", nextCorrect, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  return (
    <>
      <div>
        <label className="text-sm font-medium" htmlFor="stem">
          Soru kökü
        </label>
        <textarea
          aria-describedby="stem-error"
          className="mt-1.5 min-h-28 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          id="stem"
          {...form.register("multipleChoice.stem")}
        />
        <FieldError id="stem-error" message={errors?.stem?.message} />
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
                  {...form.register("multipleChoice.correctOptionId")}
                />
              </label>
              <div>
                <div className="flex rounded-md border border-border bg-surface focus-within:outline-2 focus-within:outline-primary">
                  <input
                    type="hidden"
                    {...form.register(`multipleChoice.options.${index}.id`)}
                  />
                  <span className="border-r border-border bg-surface-muted px-3 py-2 text-sm font-semibold">
                    {optionId}
                  </span>
                  <input
                    aria-label={`${optionId} şıkkı metni`}
                    className="min-w-0 flex-1 rounded-r-md px-3 py-2 text-sm outline-none"
                    {...form.register(`multipleChoice.options.${index}.text`)}
                  />
                </div>
                <FieldError
                  id={`option-${index}-error`}
                  message={errors?.options?.[index]?.text?.message}
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
          message={errors?.options?.root?.message ?? errors?.options?.message}
        />
        <FieldError
          id="correct-error"
          message={errors?.correctOptionId?.message}
        />
        <button
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-muted"
          onClick={() => {
            const id = nextOptionId(
              form
                .getValues("multipleChoice.options")
                .map((option) => option.id),
            );
            append({ id, text: "" });
          }}
          type="button"
        >
          <Plus aria-hidden="true" className="size-4" />
          Şık ekle
        </button>
      </div>
    </>
  );
}

export function MultipleChoicePreview({
  values,
}: {
  values: EditorFormValues;
}) {
  const branch = values.multipleChoice;
  const correct = branch.options.find(
    (option) => option.id === branch.correctOptionId,
  );

  return (
    <PreviewShell
      answerLabel={
        correct === undefined
          ? "Seçilmedi"
          : `${correct.id}: ${correct.text || "Şık metni"}`
      }
      difficulty={values.difficulty}
      explanation={values.explanation}
      scopes={values.scopes}
      type="multiple_choice"
    >
      <div className="space-y-5">
        <p className="whitespace-pre-wrap text-base font-medium">
          {branch.stem.trim() || "Soru kökü burada görünecek."}
        </p>
        <ol className="space-y-2">
          {branch.options.map((option) => {
            const isCorrect = option.id === branch.correctOptionId;
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
      </div>
    </PreviewShell>
  );
}
