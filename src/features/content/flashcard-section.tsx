"use client";

import type { UseFormReturn } from "react-hook-form";

import { FieldError } from "@/features/content/editor-field-error";
import type { EditorFormValues } from "@/features/content/editor-form";
import { PreviewShell } from "@/features/content/editor-preview";

export function FlashcardFields({
  form,
}: {
  form: UseFormReturn<EditorFormValues>;
}) {
  const errors = form.formState.errors.flashcard;

  return (
    <>
      <div>
        <label className="text-sm font-medium" htmlFor="flashcard-front">
          Ön yüz
        </label>
        <textarea
          aria-describedby="flashcard-front-error"
          className="mt-1.5 min-h-24 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          id="flashcard-front"
          {...form.register("flashcard.front")}
        />
        <FieldError
          id="flashcard-front-error"
          message={errors?.front?.message}
        />
      </div>

      <div>
        <label className="text-sm font-medium" htmlFor="flashcard-back">
          Arka yüz
        </label>
        <textarea
          aria-describedby="flashcard-back-error"
          className="mt-1.5 min-h-28 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          id="flashcard-back"
          {...form.register("flashcard.back")}
        />
        <FieldError id="flashcard-back-error" message={errors?.back?.message} />
      </div>
    </>
  );
}

export function FlashcardPreview({ values }: { values: EditorFormValues }) {
  const branch = values.flashcard;

  return (
    <PreviewShell
      answerLabel="Öğrenci kendi değerlendirir"
      difficulty={values.difficulty}
      explanation={values.explanation}
      scopes={values.scopes}
      type="flashcard"
    >
      {/* Both faces are stacked rather than flipped: an admin needs to read
          them together, and a flip would add motion for no review value. */}
      <div className="space-y-3">
        <div className="rounded-md border border-border bg-surface-muted px-3 py-2.5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
            Ön yüz
          </h3>
          <p className="mt-1 whitespace-pre-wrap text-base font-medium">
            {branch.front.trim() || "Ön yüz burada görünecek."}
          </p>
        </div>
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-emerald-950">
          <h3 className="text-xs font-medium uppercase tracking-wide">
            Arka yüz
          </h3>
          <p className="mt-1 whitespace-pre-wrap text-sm">
            {branch.back.trim() || "Arka yüz burada görünecek."}
          </p>
        </div>
      </div>
    </PreviewShell>
  );
}
