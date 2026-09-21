"use client";

import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";

import { FieldError } from "@/features/content/editor-field-error";
import type { EditorFormValues } from "@/features/content/editor-form";
import { PreviewShell } from "@/features/content/editor-preview";
import { nextImageHotspotId } from "@/features/content/image-hotspot-form";

const MUTATE = { shouldDirty: true, shouldValidate: true } as const;

export function ImageHotspotFields({
  form,
}: {
  form: UseFormReturn<EditorFormValues>;
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "imageHotspot.hotspots",
    keyName: "fieldKey",
  });
  const errors = form.formState.errors.imageHotspot;
  const correctHotspotId = form.watch("imageHotspot.hotspotId");

  function addHotspot() {
    const id = nextImageHotspotId(
      form.getValues("imageHotspot.hotspots").map((item) => item.id),
    );
    append({ id, text: "" });
  }

  function removeHotspotAt(index: number) {
    if (fields.length <= 2) return;
    const removedId = form.getValues(`imageHotspot.hotspots.${index}.id`);
    remove(index);
    if (form.getValues("imageHotspot.hotspotId") === removedId) {
      form.setValue("imageHotspot.hotspotId", "", MUTATE);
    }
  }

  return (
    <>
      <div>
        <label className="text-sm font-medium" htmlFor="hotspot-instruction">
          Yönerge
        </label>
        <input
          aria-describedby="hotspot-instruction-error"
          className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          id="hotspot-instruction"
          placeholder="Örn. Başkenti gösteren bölgeyi seçin."
          {...form.register("imageHotspot.instruction")}
        />
        <FieldError
          id="hotspot-instruction-error"
          message={errors?.instruction?.message}
        />
      </div>

      <div>
        <label className="text-sm font-medium" htmlFor="hotspot-image">
          Görsel adresi (URL)
        </label>
        <input
          aria-describedby="hotspot-image-hint hotspot-image-error"
          className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          id="hotspot-image"
          placeholder="https://…"
          type="url"
          {...form.register("imageHotspot.image")}
        />
        <p className="mt-1.5 text-xs text-muted" id="hotspot-image-hint">
          Bu panel dosya yüklemez; başka bir yerde barındırılan bir görselin
          adresini yapıştırın.
        </p>
        <FieldError id="hotspot-image-error" message={errors?.image?.message} />
      </div>

      <section aria-labelledby="hotspot-items-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold" id="hotspot-items-heading">
            Bölgeler
          </h3>
          <button
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface-muted"
            onClick={addHotspot}
            type="button"
          >
            <Plus aria-hidden="true" className="size-3.5" />
            Bölge ekle
          </button>
        </div>

        <ul className="space-y-3">
          {fields.map((field, index) => (
            <li className="flex items-start gap-2" key={field.fieldKey}>
              <input
                aria-label={`${index + 1}. bölge açıklaması`}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                placeholder={`Bölge ${index + 1} açıklaması`}
                {...form.register(`imageHotspot.hotspots.${index}.text`)}
              />
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                <input
                  aria-label={`${index + 1}. bölgeyi doğru bölge seç`}
                  checked={correctHotspotId === field.id}
                  name="hotspot-correct"
                  onChange={() =>
                    form.setValue("imageHotspot.hotspotId", field.id, MUTATE)
                  }
                  type="radio"
                />
                Doğru
              </label>
              <button
                aria-label={`${index + 1}. bölgeyi sil`}
                className="shrink-0 rounded-md p-2 text-muted hover:bg-surface-muted hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={fields.length <= 2}
                onClick={() => removeHotspotAt(index)}
                type="button"
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        <FieldError
          id="hotspot-items-error"
          message={errors?.hotspots?.message ?? errors?.hotspotId?.message}
        />
      </section>
    </>
  );
}

export function ImageHotspotPreview({ values }: { values: EditorFormValues }) {
  const branch = values.imageHotspot;
  const correct = branch.hotspots.find((item) => item.id === branch.hotspotId);

  return (
    <PreviewShell
      answerLabel={correct?.text.trim() || "Seçilmedi"}
      difficulty={values.difficulty}
      explanation={values.explanation}
      scopes={values.scopes}
      type="image_hotspot"
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
          {branch.hotspots.map((item) => (
            <li
              className={
                item.id === branch.hotspotId
                  ? "rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 font-medium text-emerald-950"
                  : "px-2 py-1"
              }
              key={item.id}
            >
              {item.text.trim() || "(boş)"}
            </li>
          ))}
        </ul>
      </div>
    </PreviewShell>
  );
}
