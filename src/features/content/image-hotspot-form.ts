import { z } from "zod";

import {
  imageHotspotAnswerKeySchema,
  imageHotspotContentSchema,
  type ExerciseDetail,
} from "@/contracts/admin/exercise-editor";
import {
  hasUniqueIds,
  nextStructuredItemId,
} from "@/lib/content/structured-items";

const itemShapeSchema = z.object({ id: z.string(), text: z.string() });

export const imageHotspotBranchSchema = z.object({
  instruction: z.string(),
  image: z.string(),
  hotspots: z.array(itemShapeSchema),
  hotspotId: z.string(),
});

export type ImageHotspotBranchValues = z.input<typeof imageHotspotBranchSchema>;

export const strictImageHotspotBranchSchema = z
  .object({
    instruction: z.string().trim().min(1, "Yönerge boş olamaz."),
    image: z.string().trim().min(1, "Görsel adresi (URL) gerekli."),
    hotspots: z
      .array(
        z.object({
          id: z.string().trim().min(1, "Bölge kimliği boş olamaz."),
          text: z.string().trim().min(1, "Bölge açıklaması boş olamaz."),
        }),
      )
      .min(2, "En az iki bölge tanımlanmalıdır."),
    hotspotId: z.string().trim().min(1, "Doğru bölge seçilmelidir."),
  })
  .superRefine((value, context) => {
    const ids = value.hotspots.map((item) => item.id);

    if (!hasUniqueIds(ids)) {
      context.addIssue({
        code: "custom",
        path: ["hotspots"],
        message: "Bölge kimlikleri benzersiz olmalıdır.",
      });
    }

    if (!ids.includes(value.hotspotId)) {
      context.addIssue({
        code: "custom",
        path: ["hotspotId"],
        message: "Doğru bölge, tanımlı bölgeler arasından seçilmelidir.",
      });
    }
  });

const INITIAL_IDS = ["1", "2"] as const;

export function createImageHotspotBranch(): ImageHotspotBranchValues {
  return {
    instruction: "",
    image: "",
    hotspots: INITIAL_IDS.map((id) => ({ id, text: "" })),
    hotspotId: "",
  };
}

export function nextImageHotspotId(existingIds: readonly string[]): string {
  return nextStructuredItemId(existingIds, "numeric");
}

export function imageHotspotBranchFromDetail(
  detail: ExerciseDetail,
): ImageHotspotBranchValues | null {
  const content = imageHotspotContentSchema.safeParse(detail.content);
  const answerKey = imageHotspotAnswerKeySchema.safeParse(detail.answer_key);
  if (!content.success || !answerKey.success) return null;

  return {
    instruction: content.data.instruction,
    image: content.data.image,
    hotspots: content.data.hotspots.map((item) => ({ ...item })),
    hotspotId: answerKey.data.hotspot_id,
  };
}

export function serializeImageHotspotBranch(branch: ImageHotspotBranchValues) {
  return {
    type: "image_hotspot" as const,
    content: {
      instruction: branch.instruction.trim(),
      image: branch.image.trim(),
      hotspots: branch.hotspots.map((item) => ({
        id: item.id,
        text: item.text.trim(),
      })),
    },
    answer_key: { hotspot_id: branch.hotspotId },
  };
}
