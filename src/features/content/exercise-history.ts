const STORAGE_KEY = "bilgin-admin:recent-exercises";
const MAX_ENTRIES = 10;

export type RecentExerciseEntry = Readonly<{
  exerciseId: number;
  courseId: number;
  unitId: number;
  label: string;
  editedAt: number;
}>;

function readStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readAll(storage: Storage): RecentExerciseEntry[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (entry): entry is RecentExerciseEntry =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as RecentExerciseEntry).exerciseId === "number" &&
        typeof (entry as RecentExerciseEntry).courseId === "number" &&
        typeof (entry as RecentExerciseEntry).unitId === "number" &&
        typeof (entry as RecentExerciseEntry).label === "string" &&
        typeof (entry as RecentExerciseEntry).editedAt === "number",
    );
  } catch {
    return [];
  }
}

/**
 * Session-scoped (per tab), so it never claims to remember work from a
 * different device or a previous day the way a durable history would.
 */
export function recordExerciseEdit(entry: RecentExerciseEntry): void {
  const storage = readStorage();
  if (storage === null) return;

  const withoutDuplicate = readAll(storage).filter(
    (existing) => existing.exerciseId !== entry.exerciseId,
  );
  const next = [entry, ...withoutDuplicate].slice(0, MAX_ENTRIES);

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the list is a convenience, not a system of record.
  }
}

export function listRecentExercises(): RecentExerciseEntry[] {
  const storage = readStorage();
  if (storage === null) return [];

  return readAll(storage);
}

export function clearRecentExercises(): void {
  const storage = readStorage();
  if (storage === null) return;

  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do if removal itself fails.
  }
}
