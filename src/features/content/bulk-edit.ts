import type { CourseScope, ExerciseListItem } from "@/contracts/admin/content";
import { courseScopes } from "@/contracts/admin/content";
import type { ExerciseMetadataUpdate } from "@/contracts/admin/exercise-editor";
import { courseScopeLabels } from "@/features/content/content-labels";
import { toApiError, type ApiError } from "@/lib/api/error";
import { shouldHaltBatch } from "@/lib/api/retry-policy";
import { runWithConcurrency } from "@/lib/async/run-with-concurrency";

/*
 | Bulk edit for a unit's question list.
 |
 | The backend has no bulk endpoint: every change is the existing per-question
 | request repeated — `PATCH /admin/v1/exercises/{id}` with a metadata-only,
 | partial body (topic, difficulty, scopes, owning unit), or
 | `DELETE /admin/v1/exercises/{id}` for archiving. Type, content and answer
 | key are never part of a bulk edit, and status is not offered because the
 | update endpoint does not accept it.
 |
 | Safety the backend does NOT provide on update, so the screen must:
 | - `update` does not check that a topic belongs to the course's subject
 |   (TOPIC_MISMATCH is only enforced on create), so topics are offered only
 |   from the course's own topic list;
 | - `update` does not move `owner_course_id` with `owner_unit_id`, so the
 |   unit picker only offers units of the same course.
 | A 422 can still come back (a topic or unit removed meanwhile, content the
 | backend no longer validates) and is explained per question.
 */

/** Requests in flight at once. Small: these are writes, each bumping a version. */
export const BULK_EDIT_CONCURRENCY = 3;

export const bulkEditKinds = [
  "topic",
  "difficulty",
  "scopes",
  "unit",
  "archive",
] as const;
export type BulkEditKind = (typeof bulkEditKinds)[number];

export const bulkEditKindLabels: Readonly<Record<BulkEditKind, string>> = {
  topic: "Konu değiştir",
  difficulty: "Zorluk değiştir",
  scopes: "Kapsam değiştir",
  unit: "Ünite değiştir",
  archive: "Arşivle",
};

export const scopeEditModes = ["replace", "add", "remove"] as const;
export type ScopeEditMode = (typeof scopeEditModes)[number];

export const scopeEditModeLabels: Readonly<Record<ScopeEditMode, string>> = {
  replace: "Seçilenlerle değiştir",
  add: "Ekle",
  remove: "Çıkar",
};

export type BulkEditChange =
  | Readonly<{ kind: "topic"; topicId: number; topicName: string }>
  | Readonly<{ kind: "difficulty"; difficulty: number }>
  | Readonly<{
      kind: "scopes";
      mode: ScopeEditMode;
      scopes: readonly CourseScope[];
    }>
  | Readonly<{ kind: "unit"; unitId: number; unitTitle: string }>
  | Readonly<{ kind: "archive" }>;

/* ----------------------------------------------------- current values -- */

export type ValueCount = Readonly<{ label: string; count: number }>;

export type CurrentValues = Readonly<{
  /** Distinct current values, most common first. */
  values: readonly ValueCount[];
  mixed: boolean;
}>;

function scopesLabel(scopes: readonly CourseScope[]): string {
  return scopes.length === 0
    ? "Kapsamsız"
    : sortScopes(scopes)
        .map((scope) => courseScopeLabels[scope])
        .join(", ");
}

function sortScopes(scopes: readonly CourseScope[]): CourseScope[] {
  return [...new Set(scopes)].sort(
    (a, b) => courseScopes.indexOf(a) - courseScopes.indexOf(b),
  );
}

function currentLabel(
  exercise: ExerciseListItem,
  kind: BulkEditKind,
  unitTitle: string,
): string {
  switch (kind) {
    case "topic":
      return exercise.topic.name;
    case "difficulty":
      return `Zorluk ${exercise.difficulty}`;
    case "scopes":
      return scopesLabel(exercise.scopes);
    case "unit":
      return unitTitle;
    case "archive":
      return exercise.status;
  }
}

/**
 * What the selected questions hold today for the field being edited, and
 * whether they disagree ("karışık"). Archive reports statuses.
 */
export function currentValues(
  exercises: readonly ExerciseListItem[],
  kind: BulkEditKind,
  unitTitle: string,
  statusLabel: (status: ExerciseListItem["status"]) => string = (status) =>
    status,
): CurrentValues {
  const counts = new Map<string, number>();

  for (const exercise of exercises) {
    const label =
      kind === "archive"
        ? statusLabel(exercise.status)
        : currentLabel(exercise, kind, unitTitle);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const values = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "tr"));

  return { values, mixed: values.length > 1 };
}

/** The new value, as the confirmation shows it. */
export function changeLabel(change: BulkEditChange): string {
  switch (change.kind) {
    case "topic":
      return change.topicName;
    case "difficulty":
      return `Zorluk ${change.difficulty}`;
    case "scopes":
      return `${scopeEditModeLabels[change.mode]}: ${scopesLabel(change.scopes)}`;
    case "unit":
      return change.unitTitle;
    case "archive":
      return "Arşiv";
  }
}

/* --------------------------------------------------------------- plan -- */

export type BulkItem = Readonly<{
  id: number;
  /** null for archive (a DELETE, no body). */
  body: ExerciseMetadataUpdate | null;
}>;

export type BulkPlan = Readonly<{
  /** Requests that will be sent. */
  items: readonly BulkItem[];
  /** Already at the new value: nothing is sent (it would only bump versions). */
  unchanged: readonly number[];
  /** Cannot take the change; never sent. */
  blocked: readonly Readonly<{ id: number; reason: string }>[];
}>;

function sameScopes(
  a: readonly CourseScope[],
  b: readonly CourseScope[],
): boolean {
  const left = sortScopes(a);
  const right = sortScopes(b);
  return (
    left.length === right.length &&
    left.every((scope, index) => scope === right[index])
  );
}

export function nextScopes(
  current: readonly CourseScope[],
  mode: ScopeEditMode,
  scopes: readonly CourseScope[],
): CourseScope[] {
  switch (mode) {
    case "replace":
      return sortScopes(scopes);
    case "add":
      return sortScopes([...current, ...scopes]);
    case "remove":
      return sortScopes(current.filter((scope) => !scopes.includes(scope)));
  }
}

/**
 * One request per question that the change actually alters, each with its
 * own body (a scope "ekle" keeps every question's other scopes).
 * `currentUnitId` is the unit the list belongs to.
 */
export function planBulkEdit(
  exercises: readonly ExerciseListItem[],
  change: BulkEditChange,
  currentUnitId: number,
): BulkPlan {
  const items: BulkItem[] = [];
  const unchanged: number[] = [];
  const blocked: { id: number; reason: string }[] = [];

  for (const exercise of exercises) {
    switch (change.kind) {
      case "topic":
        if (exercise.topic.id === change.topicId) unchanged.push(exercise.id);
        else
          items.push({ id: exercise.id, body: { topic_id: change.topicId } });
        break;
      case "difficulty":
        if (exercise.difficulty === change.difficulty) {
          unchanged.push(exercise.id);
        } else {
          items.push({
            id: exercise.id,
            body: { difficulty: change.difficulty },
          });
        }
        break;
      case "scopes": {
        const next = nextScopes(exercise.scopes, change.mode, change.scopes);
        if (next.length === 0) {
          // The backend requires at least one scope (`min:1`).
          blocked.push({
            id: exercise.id,
            reason: "Hiç kapsamı kalmazdı; en az bir kapsam gerekli.",
          });
        } else if (sameScopes(next, exercise.scopes)) {
          unchanged.push(exercise.id);
        } else {
          items.push({ id: exercise.id, body: { applicable_scopes: next } });
        }
        break;
      }
      case "unit":
        if (change.unitId === currentUnitId) unchanged.push(exercise.id);
        else {
          items.push({
            id: exercise.id,
            body: { owner_unit_id: change.unitId },
          });
        }
        break;
      case "archive":
        if (exercise.status === "archived") unchanged.push(exercise.id);
        else items.push({ id: exercise.id, body: null });
        break;
    }
  }

  return { items, unchanged, blocked };
}

/* ---------------------------------------------------------------- run -- */

export type BulkFailure = Readonly<{ id: number; error: ApiError }>;

export type BulkRunResult = Readonly<{
  succeeded: readonly number[];
  failed: readonly BulkFailure[];
  /** Never sent: the run was cancelled or halted first. */
  notAttempted: readonly number[];
  /** Why the run stopped early, when it did. */
  halt: ApiError | null;
  cancelled: boolean;
}>;

export type BulkProgress = Readonly<{
  done: number;
  total: number;
  succeeded: number;
  failed: number;
}>;

/**
 * Sends every item with at most `concurrency` in flight. One failure never
 * stops the rest; an expired session or a rate limit does (every later item
 * would fail the same way), and so does `signal` — items already in flight
 * finish, the rest are reported as not attempted. Nothing is ever retried
 * here: the caller decides, and resends only what did not succeed.
 */
export async function runBulkEdit(
  items: readonly BulkItem[],
  send: (item: BulkItem) => Promise<unknown>,
  options: Readonly<{
    concurrency?: number;
    signal?: AbortSignal;
    onProgress?: (progress: BulkProgress) => void;
  }> = {},
): Promise<BulkRunResult> {
  const succeeded: number[] = [];
  const failed: BulkFailure[] = [];
  const started = new Set<number>();
  let halt: ApiError | null = null;

  const report = () =>
    options.onProgress?.({
      done: succeeded.length + failed.length,
      total: items.length,
      succeeded: succeeded.length,
      failed: failed.length,
    });

  await runWithConcurrency(
    items,
    options.concurrency ?? BULK_EDIT_CONCURRENCY,
    async (item) => {
      started.add(item.id);
      try {
        await send(item);
        succeeded.push(item.id);
      } catch (error) {
        const apiError = toApiError(error);
        failed.push({ id: item.id, error: apiError });
        if (halt === null && shouldHaltBatch(apiError)) halt = apiError;
      }
      report();
    },
    () => halt !== null || options.signal?.aborted === true,
  );

  // Keep the input order, so the lists read like the selection.
  const order = new Map(items.map((item, index) => [item.id, index]));
  const byOrder = (a: number, b: number) =>
    (order.get(a) ?? 0) - (order.get(b) ?? 0);

  return {
    succeeded: [...succeeded].sort(byOrder),
    failed: [...failed].sort((a, b) => byOrder(a.id, b.id)),
    notAttempted: items.map((item) => item.id).filter((id) => !started.has(id)),
    halt,
    cancelled: halt === null && options.signal?.aborted === true,
  };
}

/**
 * The items still worth sending after a run: the failed and the never-sent
 * ones, with the bodies they had. Successful ones are never resent.
 */
export function retryItems(
  items: readonly BulkItem[],
  result: BulkRunResult,
): BulkItem[] {
  const pending = new Set([
    ...result.failed.map((failure) => failure.id),
    ...result.notAttempted,
  ]);

  return items.filter((item) => pending.has(item.id));
}

/* ------------------------------------------------------------- errors -- */

const fieldMessages: Readonly<Record<string, string>> = {
  topic_id: "Seçilen konu backend'de bulunamadı (silinmiş olabilir).",
  owner_unit_id: "Seçilen ünite backend'de bulunamadı (silinmiş olabilir).",
  applicable_scopes:
    "Kapsam listesi geçersiz; en az bir geçerli kapsam gerekli.",
  difficulty: "Zorluk 1 ile 5 arasında olmalı.",
};

/** A per-question failure in words an editor can act on. */
export function bulkErrorMessage(error: ApiError): string {
  if (error.kind === "validation") {
    if (error.code === "TOPIC_MISMATCH") {
      return `Konu ile ders uyuşmuyor: ${error.message}`;
    }
    if (error.code === "INVALID_EXERCISE_CONTENT") {
      return "Sorunun mevcut içeriği backend doğrulamasından geçmiyor; önce soru editöründen düzeltin.";
    }
    const field = Object.keys(error.fields ?? {}).find(
      (key) => fieldMessages[key] !== undefined,
    );
    if (field !== undefined) return fieldMessages[field]!;
    return `Backend değişikliği kabul etmedi: ${error.message}`;
  }

  switch (error.kind) {
    case "authorization":
      return "Bu soruyu düzenleme yetkiniz yok.";
    case "not_found":
      return "Soru bulunamadı; silinmiş veya taşınmış olabilir.";
    case "rate_limit":
      return "Çok fazla istek gönderildi; biraz bekleyip kalanları tekrar deneyin.";
    case "network":
      return "Sunucuya ulaşılamadı; bağlantınızı kontrol edip tekrar deneyin.";
    default:
      return error.message;
  }
}
