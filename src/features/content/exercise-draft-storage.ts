import type { EditorFormValues } from "@/features/content/editor-form";

const STORAGE_PREFIX = "bilgin-admin:exercise-draft:";
/** A draft older than this is treated as stale and never offered for recovery. */
const MAX_DRAFT_AGE_MS = 1000 * 60 * 60 * 24 * 7;

export type ExerciseDraft = Readonly<{
  savedAt: number;
  values: EditorFormValues;
}>;

/**
 * One key per editing context (a specific existing exercise, or "a new
 * question in this unit"), so a draft never leaks across unrelated forms and
 * never collides with a different exercise being edited in another tab.
 */
export function exerciseDraftKey(
  courseId: number,
  unitId: number,
  exerciseId: number | undefined,
): string {
  return `${STORAGE_PREFIX}${courseId}:${unitId}:${exerciseId ?? "new"}`;
}

function readStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    // Private browsing / disabled storage: recovery is best-effort only.
    return null;
  }
}

export function saveDraft(key: string, values: EditorFormValues): void {
  const storage = readStorage();
  if (storage === null) return;

  const draft: ExerciseDraft = { savedAt: Date.now(), values };

  try {
    storage.setItem(key, JSON.stringify(draft));
  } catch {
    // Storage full or blocked: silently skip, never blocks editing.
  }
}

export function loadDraft(key: string): ExerciseDraft | null {
  const storage = readStorage();
  if (storage === null) return null;

  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;

    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("savedAt" in parsed) ||
      !("values" in parsed) ||
      typeof (parsed as { savedAt: unknown }).savedAt !== "number"
    ) {
      return null;
    }

    const draft = parsed as ExerciseDraft;
    if (Date.now() - draft.savedAt > MAX_DRAFT_AGE_MS) {
      storage.removeItem(key);
      return null;
    }

    return draft;
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  const storage = readStorage();
  if (storage === null) return;

  try {
    storage.removeItem(key);
  } catch {
    // Nothing to do if removal itself fails.
  }
}
