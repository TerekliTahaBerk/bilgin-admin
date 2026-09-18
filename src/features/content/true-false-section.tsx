"use client";

import { Controller, type UseFormReturn } from "react-hook-form";

import { FieldError } from "@/features/content/editor-field-error";
import type { EditorFormValues } from "@/features/content/editor-form";
import { PreviewShell } from "@/features/content/editor-preview";

const ANSWER_CHOICES = [
  { value: true, label: "Doğru", id: "answer-true" },
  { value: false, label: "Yanlış", id: "answer-false" },
] as const;

export function trueFalseAnswerLabel(answerValue: boolean | null): string {
  if (answerValue === null) return "Seçilmedi";
  return answerValue ? "Doğru" : "Yanlış";
}

export function TrueFalseFields({
  form,
}: {
  form: UseFormReturn<EditorFormValues>;
}) {
  const errors = form.formState.errors.trueFalse;

  return (
    <>
      <div>
        <label className="text-sm font-medium" htmlFor="statement">
          İfade
        </label>
        <textarea
          aria-describedby="statement-error"
          className="mt-1.5 min-h-28 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          id="statement"
          {...form.register("trueFalse.statement")}
        />
        <FieldError id="statement-error" message={errors?.statement?.message} />
      </div>

      {/*
       * A native radio group always reports its value as a string, and the
       * backend's grader compares the answer key with ===, so "true" would be
       * graded wrong for every student. Controller keeps real booleans in form
       * state: onChange is handed the boolean itself, never event.target.value.
       */}
      <Controller
        control={form.control}
        name="trueFalse.answerValue"
        render={({ field }) => (
          <fieldset aria-describedby="answer-error">
            <legend className="text-sm font-medium">Cevap</legend>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
              {ANSWER_CHOICES.map((choice) => (
                <label
                  className="inline-flex items-center gap-2 text-sm"
                  htmlFor={choice.id}
                  key={choice.id}
                >
                  <input
                    checked={field.value === choice.value}
                    id={choice.id}
                    name={field.name}
                    onBlur={field.onBlur}
                    onChange={() => field.onChange(choice.value)}
                    ref={field.ref}
                    type="radio"
                  />
                  {choice.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}
      />
      <FieldError id="answer-error" message={errors?.answerValue?.message} />
    </>
  );
}

export function TrueFalsePreview({ values }: { values: EditorFormValues }) {
  const branch = values.trueFalse;

  return (
    <PreviewShell
      answerLabel={trueFalseAnswerLabel(branch.answerValue)}
      difficulty={values.difficulty}
      explanation={values.explanation}
      scopes={values.scopes}
      type="true_false"
    >
      <div className="space-y-5">
        <p className="whitespace-pre-wrap text-base font-medium">
          {branch.statement.trim() || "İfade burada görünecek."}
        </p>
        <ul className="space-y-2">
          {ANSWER_CHOICES.map((choice) => {
            const isCorrect = branch.answerValue === choice.value;
            return (
              <li
                className={`flex gap-3 rounded-md border px-3 py-2.5 text-sm ${
                  isCorrect
                    ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                    : "border-border bg-surface-muted"
                }`}
                key={choice.id}
              >
                <span className="min-w-0">{choice.label}</span>
                {isCorrect ? (
                  <span className="ml-auto shrink-0 text-xs font-medium">
                    Doğru cevap
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </PreviewShell>
  );
}
