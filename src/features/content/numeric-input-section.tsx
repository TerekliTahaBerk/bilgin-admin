"use client";

import type { UseFormReturn } from "react-hook-form";

import { FieldError } from "@/features/content/editor-field-error";
import type { EditorFormValues } from "@/features/content/editor-form";
import { PreviewShell } from "@/features/content/editor-preview";
import { numericFieldValue } from "@/features/content/numeric-input-form";

/** Renders -0 and long decimals the way the author typed them. */
function formatNumber(value: number | null): string {
  return value === null ? "—" : String(value);
}

export function NumericInputFields({
  form,
}: {
  form: UseFormReturn<EditorFormValues>;
}) {
  const errors = form.formState.errors.numericInput;

  return (
    <>
      <div>
        <label className="text-sm font-medium" htmlFor="numeric-stem">
          Soru kökü
        </label>
        <textarea
          aria-describedby="numeric-stem-error"
          className="mt-1.5 min-h-28 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          id="numeric-stem"
          {...form.register("numericInput.stem")}
        />
        <FieldError id="numeric-stem-error" message={errors?.stem?.message} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium" htmlFor="numeric-value">
            Doğru sayı
          </label>
          {/*
           * setValueAs maps an empty or unparseable field to null rather than
           * NaN, so a cleared input asks for a value instead of serialising
           * something the backend would reject. 0 passes through untouched.
           */}
          <input
            aria-describedby="numeric-value-error"
            className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            id="numeric-value"
            inputMode="decimal"
            step="any"
            type="number"
            {...form.register("numericInput.answerValue", {
              setValueAs: numericFieldValue,
            })}
          />
          <FieldError
            id="numeric-value-error"
            message={errors?.answerValue?.message}
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="numeric-tolerance">
            Tolerans
          </label>
          <input
            aria-describedby="numeric-tolerance-hint numeric-tolerance-error"
            className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            id="numeric-tolerance"
            inputMode="decimal"
            min="0"
            step="any"
            type="number"
            {...form.register("numericInput.tolerance", {
              setValueAs: numericFieldValue,
            })}
          />
          <p className="mt-1.5 text-xs text-muted" id="numeric-tolerance-hint">
            0 tam eşleşme ister. Örneğin 0.333 ile 0.33&apos;ü aynı kabul etmek
            için 0.01 tolerans kullanabilirsiniz.
          </p>
          <FieldError
            id="numeric-tolerance-error"
            message={errors?.tolerance?.message}
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium" htmlFor="numeric-suffix">
          Birim / son ek (opsiyonel)
        </label>
        <input
          aria-describedby="numeric-suffix-error"
          className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          id="numeric-suffix"
          {...form.register("numericInput.suffix")}
        />
        <FieldError
          id="numeric-suffix-error"
          message={errors?.suffix?.message}
        />
      </div>
    </>
  );
}

export function NumericInputPreview({ values }: { values: EditorFormValues }) {
  const branch = values.numericInput;
  const suffix = branch.suffix.trim();

  return (
    <PreviewShell
      answerLabel={
        branch.answerValue === null
          ? "Girilmedi"
          : `${formatNumber(branch.answerValue)}${suffix === "" ? "" : ` ${suffix}`}`
      }
      difficulty={values.difficulty}
      explanation={values.explanation}
      scopes={values.scopes}
      type="numeric_input"
    >
      <div className="space-y-5">
        <p className="whitespace-pre-wrap text-base font-medium">
          {branch.stem.trim() || "Soru kökü burada görünecek."}
        </p>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex min-w-24 justify-center rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 font-semibold text-emerald-950">
            {branch.answerValue === null
              ? "?"
              : formatNumber(branch.answerValue)}
          </span>
          {suffix === "" ? null : <span>{suffix}</span>}
        </p>
        <p className="text-xs text-muted">
          Tolerans: ±{formatNumber(branch.tolerance)}
        </p>
      </div>
    </PreviewShell>
  );
}
