import { z } from "zod";

import {
  flashcardContentSchema,
  type ExerciseDetail,
} from "@/contracts/admin/exercise-editor";

/**
 * Shape-only schema for the flashcard branch — see the note on
 * multipleChoiceBranchSchema for why the rules live in the strict schema.
 *
 * There is no answer field: FlashcardValidator checks only the front and back
 * text, and self_assessed is editor metadata the author never sets.
 */
export const flashcardBranchSchema = z.object({
  front: z.string(),
  back: z.string(),
});

export type FlashcardBranchValues = z.input<typeof flashcardBranchSchema>;

export const strictFlashcardBranchSchema = z.object({
  front: z.string().trim().min(1, "Ön yüz boş olamaz."),
  back: z.string().trim().min(1, "Arka yüz boş olamaz."),
});

export function createFlashcardBranch(): FlashcardBranchValues {
  return { front: "", back: "" };
}

export function flashcardBranchFromDetail(
  detail: ExerciseDetail,
): FlashcardBranchValues | null {
  const content = flashcardContentSchema.safeParse(detail.content);
  if (!content.success) return null;

  // The stored answer key is deliberately not read: it carries nothing the
  // author edits, and a row without self_assessed must stay openable.
  return { front: content.data.front, back: content.data.back };
}

export function serializeFlashcardBranch(branch: FlashcardBranchValues) {
  return {
    type: "flashcard" as const,
    content: { front: branch.front.trim(), back: branch.back.trim() },
    // Canonical and constant. The backend does not enforce this value; the
    // editor writes it so every card it authors grades the same way.
    answer_key: { self_assessed: true as const },
  };
}
