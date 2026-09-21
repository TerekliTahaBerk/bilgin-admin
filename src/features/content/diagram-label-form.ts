import { z } from "zod";

import {
  diagramLabelAnswerKeySchema,
  diagramLabelContentSchema,
  type ExerciseDetail,
} from "@/contracts/admin/exercise-editor";
import {
  hasUniqueIds,
  nextStructuredItemId,
} from "@/lib/content/structured-items";

const slotShapeSchema = z.object({ id: z.string(), text: z.string(), label: z.string() });

export const diagramLabelBranchSchema = z.object({
  instruction: z.string(),
  image: z.string(),
  slots: z.array(slotShapeSchema),
});

export type DiagramLabelBranchValues = z.input<typeof diagramLabelBranchSchema>;

export const strictDiagramLabelBranchSchema = z
  .object({
    instruction: z.string().trim().min(1, "Yönerge boş olamaz."),
    image: z.string().trim().min(1, "Görsel adresi (URL) gerekli."),
    slots: z
      .array(
        z.object({
          id: z.string().trim().min(1, "Etiket yeri kimliği boş olamaz."),
          text: z.string().trim().min(1, "Etiket yeri açıklaması boş olamaz."),
          label: z.string().trim().min(1, "Doğru etiket boş olamaz."),
        }),
      )
      .min(2, "En az iki etiket yeri tanımlanmalıdır."),
  })
  .superRefine((value, context) => {
    const ids = value.slots.map((slot) => slot.id);

    if (!hasUniqueIds(ids)) {
      context.addIssue({
        code: "custom",
        path: ["slots"],
        message: "Etiket yeri kimlikleri benzersiz olmalıdır.",
      });
    }
  });

const INITIAL_IDS = ["1", "2"] as const;

export function createDiagramLabelBranch(): DiagramLabelBranchValues {
  return {
    instruction: "",
    image: "",
    slots: INITIAL_IDS.map((id) => ({ id, text: "", label: "" })),
  };
}

export function nextDiagramLabelSlotId(existingIds: readonly string[]): string {
  return nextStructuredItemId(existingIds, "numeric");
}

export function diagramLabelBranchFromDetail(
  detail: ExerciseDetail,
): DiagramLabelBranchValues | null {
  const content = diagramLabelContentSchema.safeParse(detail.content);
  const answerKey = diagramLabelAnswerKeySchema.safeParse(detail.answer_key);
  if (!content.success || !answerKey.success) return null;

  return {
    instruction: content.data.instruction,
    image: content.data.image,
    slots: content.data.slots.map((item) => ({
      id: item.id,
      text: item.text,
      label: answerKey.data.labels[item.id] ?? "",
    })),
  };
}

export function serializeDiagramLabelBranch(branch: DiagramLabelBranchValues) {
  const labels: Record<string, string> = {};
  for (const slot of branch.slots) {
    labels[slot.id] = slot.label.trim();
  }

  return {
    type: "diagram_label" as const,
    content: {
      instruction: branch.instruction.trim(),
      image: branch.image.trim(),
      slots: branch.slots.map((slot) => ({
        id: slot.id,
        text: slot.text.trim(),
      })),
    },
    answer_key: { labels },
  };
}
