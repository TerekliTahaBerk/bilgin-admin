"use client";

import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";

import { FieldError } from "@/features/content/editor-field-error";
import { nextDiagramLabelSlotId } from "@/features/content/diagram-label-form";
import type { EditorFormValues } from "@/features/content/editor-form";
import { PreviewShell } from "@/features/content/editor-preview";

export function DiagramLabelFields({
  form,
}: {
  form: UseFormReturn<EditorFormValues>;
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "diagramLabel.slots",
    keyName: "fieldKey",
  });
  const errors = form.formState.errors.diagramLabel;

  function addSlot() {
    const id = nextDiagramLabelSlotId(
      form.getValues("diagramLabel.slots").map((slot) => slot.id),
    );
    append({ id, text: "", label: "" });
  }

  function removeSlotAt(index: number) {
    if (fields.length <= 2) return;
    remove(index);
  }

  return (
    <>
      <div>
        <label className="text-sm font-medium" htmlFor="diagram-instruction">
          Yönerge
        </label>
        <input
          aria-describedby="diagram-instruction-error"
          className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          id="diagram-instruction"
          placeholder="Örn. Diyagramdaki her yeri doğru terimle etiketleyin."
          {...form.register("diagramLabel.instruction")}
        />
        <FieldError
          id="diagram-instruction-error"
          message={errors?.instruction?.message}
        />
      </div>

      <div>
        <label className="text-sm font-medium" htmlFor="diagram-image">
          Görsel adresi (URL)
        </label>
        <input
          aria-describedby="diagram-image-hint diagram-image-error"
          className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          id="diagram-image"
          placeholder="https://…"
          type="url"
          {...form.register("diagramLabel.image")}
        />
        <p className="mt-1.5 text-xs text-muted" id="diagram-image-hint">
          Bu panel dosya yüklemez; başka bir yerde barındırılan bir görselin
          adresini yapıştırın.
        </p>
        <FieldError id="diagram-image-error" message={errors?.image?.message} />
      </div>

      <section aria-labelledby="diagram-slots-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold" id="diagram-slots-heading">
            Etiket yerleri
          </h3>
          <button
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface-muted"
            onClick={addSlot}
            type="button"
          >
            <Plus aria-hidden="true" className="size-3.5" />
            Yer ekle
          </button>
        </div>

        <ul className="space-y-3">
          {fields.map((field, index) => (
            <li className="grid gap-2 sm:grid-cols-2" key={field.fieldKey}>
              <input
                aria-label={`${index + 1}. yer açıklaması`}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                placeholder={`Yer ${index + 1} açıklaması`}
                {...form.register(`diagramLabel.slots.${index}.text`)}
              />
              <div className="flex items-center gap-2">
                <input
                  aria-label={`${index + 1}. yer için doğru etiket`}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  placeholder="Doğru etiket"
                  {...form.register(`diagramLabel.slots.${index}.label`)}
                />
                <button
                  aria-label={`${index + 1}. yeri sil`}
                  className="shrink-0 rounded-md p-2 text-muted hover:bg-surface-muted hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={fields.length <= 2}
                  onClick={() => removeSlotAt(index)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
        <FieldError id="diagram-slots-error" message={errors?.slots?.message} />
      </section>
    </>
  );
}

export function DiagramLabelPreview({ values }: { values: EditorFormValues }) {
  const branch = values.diagramLabel;
  const answerLabel = branch.slots
    .map((slot) => `${slot.text.trim() || "?"}: ${slot.label.trim() || "?"}`)
    .join(" · ");

  return (
    <PreviewShell
      answerLabel={answerLabel === "" ? "Seçilmedi" : answerLabel}
      difficulty={values.difficulty}
      explanation={values.explanation}
      scopes={values.scopes}
      type="diagram_label"
    >
      <div className="space-y-3">
        <p className="whitespace-pre-wrap text-base font-medium">
          {branch.instruction.trim() || "Yönerge burada görünecek."}
        </p>
        {branch.image.trim() === "" ? (
          <p className="text-xs text-muted">Görsel adresi girilmedi.</p>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            alt=""
            className="max-h-48 rounded-md border border-border object-contain"
            src={branch.image}
          />
        )}
        <ul className="space-y-1.5 text-sm">
          {branch.slots.map((slot) => (
            <li className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1" key={slot.id}>
              <span>{slot.text.trim() || "(boş)"}</span>
              <span className="font-medium text-emerald-800">
                {slot.label.trim() || "?"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </PreviewShell>
  );
}
