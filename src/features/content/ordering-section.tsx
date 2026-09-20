"use client";

import type { UseFormReturn } from "react-hook-form";

import type { EditorFormValues } from "@/features/content/editor-form";
import {
  StructuredOrderFields,
  StructuredOrderPreview,
} from "@/features/content/structured-order-section";

const LABELS = {
  instructionLabel: "Yönerge",
  instructionPlaceholder: "Örn. Eskiden yeniye sırala.",
  itemsHeading: "Sıralanacak öğeler",
  itemLabel: "Öğe",
  addLabel: "Öğe ekle",
  orderHeading: "Doğru sıra",
  orderHint:
    "Satırları sürükleyerek ya da yukarı / aşağı taşı düğmeleriyle sıralayın. Sıra değişikliği öğe metinlerini ve kimliklerini etkilemez.",
} as const;

export function OrderingFields({
  form,
}: {
  form: UseFormReturn<EditorFormValues>;
}) {
  return (
    <StructuredOrderFields branchKey="ordering" form={form} labels={LABELS} />
  );
}

export function OrderingPreview({ values }: { values: EditorFormValues }) {
  return (
    <StructuredOrderPreview
      answerHeading="Doğru sıra"
      branchKey="ordering"
      itemLabel="Öğe"
      itemsHeading="Öğeler"
      scoringNote="Sıralamada kısmi puan backend tarafından ikili sıralama doğruluğuna göre otomatik hesaplanır."
      values={values}
    />
  );
}
