"use client";

import type { UseFormReturn } from "react-hook-form";

import type { EditorFormValues } from "@/features/content/editor-form";
import {
  StructuredOrderFields,
  StructuredOrderPreview,
} from "@/features/content/structured-order-section";

const LABELS = {
  instructionLabel: "Yönerge",
  instructionPlaceholder: "Örn. Doğru cümleyi oluştur.",
  itemsHeading: "Kelimeler",
  itemLabel: "Kelime",
  addLabel: "Kelime ekle",
  orderHeading: "Doğru cümle sırası",
  orderHint:
    "Kelimeleri sürükleyerek ya da yukarı / aşağı taşı düğmeleriyle sıralayın. Sıra değişikliği kelime metinlerini ve kimliklerini etkilemez.",
} as const;

export function WordOrderFields({
  form,
}: {
  form: UseFormReturn<EditorFormValues>;
}) {
  return (
    <StructuredOrderFields branchKey="wordOrder" form={form} labels={LABELS} />
  );
}

export function WordOrderPreview({ values }: { values: EditorFormValues }) {
  return (
    <StructuredOrderPreview
      answerHeading="Doğru cümle"
      answerBody={(labels) => (
        <p className="mt-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          {labels.join(" ")}
        </p>
      )}
      branchKey="wordOrder"
      itemLabel="Kelime"
      itemsHeading="Kelimeler"
      scoringNote="Kelime sıralamada kısmi puan yoktur; sıra tamamen doğru olmalıdır."
      values={values}
    />
  );
}
