import {
  createExerciseRequestSchema,
  type CreateExerciseRequest,
  type ExerciseDetail,
} from "@/contracts/admin/exercise-editor";
import {
  editorFormSchema,
  formValuesFromDetail,
  serializeCreateExercise,
} from "@/features/content/editor-form";
import type { ApiError } from "@/lib/api/error";

/*
 | Duplicate a question: read it with the detail endpoint, create a new one
 | with the create endpoint. Nothing is ever sent for the source question, so
 | it cannot change.
 |
 | Copied: type, content, answer key, explanation, difficulty, scopes.
 | Chosen for the target: owning unit and topic.
 | Never copied: id, status (the backend creates every question as a draft),
 | version (a new question starts at 1) and stats (they belong to the
 | source's answer attempts).
 |
 | The body goes through the editor's own detail → form → create pipeline, so
 | a clone is exactly what saving the source as a new question in the editor
 | would send — the same normalisation, the same strict create schema.
 */

export type CloneTarget = Readonly<{ unitId: number; topicId: number }>;

export type ClonePayloadResult =
  | Readonly<{ ok: true; payload: CreateExerciseRequest }>
  | Readonly<{ ok: false; reason: string }>;

/** Whether the editor can read this question back at all. */
export function isClonable(detail: ExerciseDetail): boolean {
  return formValuesFromDetail(detail) !== null;
}

export function buildClonePayload(
  detail: ExerciseDetail,
  target: CloneTarget,
): ClonePayloadResult {
  const values = formValuesFromDetail(detail);

  if (values === null) {
    return {
      ok: false,
      reason:
        "Bu soru türü veya içeriği editörde açılamıyor, bu yüzden kopyalanamıyor.",
    };
  }

  const withTarget = { ...values, topicId: target.topicId };

  // The editor would refuse to save this content; the clone must not
  // smuggle it past the same checks.
  if (!editorFormSchema.safeParse(withTarget).success) {
    return {
      ok: false,
      reason:
        "Kaynak sorunun içeriği editör doğrulamasından geçmiyor. Önce kaynak soruyu editörde düzeltip kaydedin.",
    };
  }

  const payload = serializeCreateExercise(withTarget, target.unitId);

  if (!createExerciseRequestSchema.safeParse(payload).success) {
    return {
      ok: false,
      reason:
        "Kopya, oluşturma şemasına uymuyor. Kaynak soruyu editörde açıp kontrol edin.",
    };
  }

  return { ok: true, payload };
}

/** A create failure in words an editor can act on. */
export function cloneErrorMessage(error: ApiError): {
  title: string;
  details: readonly string[];
} {
  if (error.kind === "validation") {
    if (error.code === "TOPIC_MISMATCH") {
      return {
        title: "Konu hedef derse ait değil",
        details: [error.message, "Hedef dersin branşından bir konu seçin."],
      };
    }
    if (error.code === "INVALID_EXERCISE_CONTENT") {
      const schemaErrors =
        typeof error.details === "object" &&
        error.details !== null &&
        "schema_errors" in error.details &&
        Array.isArray(error.details.schema_errors)
          ? error.details.schema_errors.filter(
              (item): item is string => typeof item === "string",
            )
          : [];
      return {
        title: "Soru içeriği backend doğrulamasından geçmedi",
        details: schemaErrors,
      };
    }
    const fields = Object.entries(error.fields ?? {}).flatMap(
      ([, messages]) => messages,
    );
    return {
      title: "Backend kopyayı kabul etmedi",
      details: fields.length > 0 ? fields : [error.message],
    };
  }

  switch (error.kind) {
    case "authorization":
      return { title: "Soru oluşturma yetkiniz yok", details: [] };
    case "not_found":
      return {
        title: "Hedef ünite veya konu bulunamadı",
        details: ["Silinmiş olabilir; seçimi yenileyip tekrar deneyin."],
      };
    case "rate_limit":
      return {
        title: "Çok fazla istek gönderildi",
        details: ["Biraz bekleyip tekrar deneyin."],
      };
    default:
      return { title: "Kopya oluşturulamadı", details: [error.message] };
  }
}
