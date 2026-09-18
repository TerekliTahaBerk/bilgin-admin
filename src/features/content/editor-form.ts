import { z } from "zod";

import { courseScopeSchema, type CourseScope } from "@/contracts/admin/content";
import {
  isSupportedEditorType,
  type CreateExerciseRequest,
  type ExerciseDetail,
  type SupportedEditorType,
  type UpdateExerciseRequest,
} from "@/contracts/admin/exercise-editor";
import {
  createMultipleChoiceBranch,
  multipleChoiceBranchFromDetail,
  multipleChoiceBranchSchema,
  serializeMultipleChoiceBranch,
  strictMultipleChoiceBranchSchema,
} from "@/features/content/multiple-choice-form";
import {
  createFillBlankBranch,
  fillBlankBranchFromDetail,
  fillBlankBranchSchema,
  serializeFillBlankBranch,
  strictFillBlankBranchSchema,
} from "@/features/content/fill-blank-form";
import {
  createFlashcardBranch,
  flashcardBranchFromDetail,
  flashcardBranchSchema,
  serializeFlashcardBranch,
  strictFlashcardBranchSchema,
} from "@/features/content/flashcard-form";
import {
  createNumericInputBranch,
  numericInputBranchFromDetail,
  numericInputBranchSchema,
  serializeNumericInputBranch,
  strictNumericInputBranchSchema,
} from "@/features/content/numeric-input-form";
import {
  createTrueFalseBranch,
  serializeTrueFalseBranch,
  strictTrueFalseBranchSchema,
  trueFalseBranchFromDetail,
  trueFalseBranchSchema,
} from "@/features/content/true-false-form";

export const editorTypeLabels: Record<SupportedEditorType, string> = {
  multiple_choice: "Çoktan seçmeli",
  true_false: "Doğru / Yanlış",
  fill_blank: "Boşluk doldurma",
  numeric_input: "Sayısal cevap",
  flashcard: "Bilgi kartı",
};

export const editorTypeHeadings: Record<
  SupportedEditorType,
  { create: string; edit: string }
> = {
  multiple_choice: {
    create: "Yeni çoktan seçmeli soru",
    edit: "Çoktan seçmeli soruyu düzenle",
  },
  true_false: {
    create: "Yeni doğru / yanlış sorusu",
    edit: "Doğru / yanlış sorusunu düzenle",
  },
  fill_blank: {
    create: "Yeni boşluk doldurma sorusu",
    edit: "Boşluk doldurma sorusunu düzenle",
  },
  numeric_input: {
    create: "Yeni sayısal cevap sorusu",
    edit: "Sayısal cevap sorusunu düzenle",
  },
  flashcard: {
    create: "Yeni bilgi kartı",
    edit: "Bilgi kartını düzenle",
  },
};

/**
 * Common fields are defined once and shared by every editor type. Type-specific
 * answers live in their own branch, so adding a type never forks topic,
 * difficulty, scope or explanation handling.
 */
export const commonEditorFieldsSchema = z.object({
  topicId: z
    .number({ error: "Konu seçin." })
    .int()
    .positive()
    .nullable()
    .refine((value): value is number => value !== null, "Konu seçin."),
  difficulty: z.number().int().min(1).max(5),
  scopes: z.array(courseScopeSchema).min(1, "En az bir kapsam seçin."),
  explanation: z
    .string()
    .max(2000, "Açıklama en fazla 2000 karakter olabilir."),
});

const branchKeyByType = {
  multiple_choice: "multipleChoice",
  true_false: "trueFalse",
  fill_blank: "fillBlank",
  numeric_input: "numericInput",
  flashcard: "flashcard",
} as const;

const strictBranchByType = {
  multiple_choice: strictMultipleChoiceBranchSchema,
  true_false: strictTrueFalseBranchSchema,
  fill_blank: strictFillBlankBranchSchema,
  numeric_input: strictNumericInputBranchSchema,
  flashcard: strictFlashcardBranchSchema,
} as const;

/**
 * Both branches are always present in form state — which keeps every
 * react-hook-form path statically known and every type honest, with no casts —
 * but only the branch named by `type` is validated or serialized.
 */
export const editorFormSchema = commonEditorFieldsSchema
  .extend({
    type: z.enum([
      "multiple_choice",
      "true_false",
      "fill_blank",
      "numeric_input",
      "flashcard",
    ]),
    multipleChoice: multipleChoiceBranchSchema,
    trueFalse: trueFalseBranchSchema,
    fillBlank: fillBlankBranchSchema,
    numericInput: numericInputBranchSchema,
    flashcard: flashcardBranchSchema,
  })
  .superRefine((values, context) => {
    const key = branchKeyByType[values.type];
    const result = strictBranchByType[values.type].safeParse(values[key]);
    if (result.success) return;

    for (const issue of result.error.issues) {
      context.addIssue({
        code: "custom",
        path: [key, ...issue.path],
        message: issue.message,
      });
    }
  });

export type EditorFormValues = z.input<typeof editorFormSchema>;

export type PreservedEditorDefaults = Readonly<{
  type: SupportedEditorType;
  topicId: number | null;
  difficulty: number;
  scopes: CourseScope[];
}>;

let pendingDefaults: PreservedEditorDefaults | null = null;

export function createEditorDefaults(
  type: SupportedEditorType,
  preserved?: PreservedEditorDefaults,
): EditorFormValues {
  return {
    type,
    topicId: preserved?.topicId ?? null,
    difficulty: preserved?.difficulty ?? 3,
    scopes: preserved?.scopes ?? [],
    explanation: "",
    // Both branches start empty on every reset, so Save & New can never carry
    // a previous question's statement or answer into the next one.
    multipleChoice: createMultipleChoiceBranch(),
    trueFalse: createTrueFalseBranch(),
    fillBlank: createFillBlankBranch(),
    numericInput: createNumericInputBranch(),
    flashcard: createFlashcardBranch(),
  };
}

export function preserveEditorDefaults(values: EditorFormValues): void {
  pendingDefaults = {
    type: values.type,
    topicId: values.topicId,
    difficulty: values.difficulty,
    scopes: [...values.scopes],
  };
}

export function consumeEditorDefaults(): PreservedEditorDefaults | undefined {
  const value = pendingDefaults ?? undefined;
  pendingDefaults = null;
  return value;
}

export function formValuesFromDetail(
  detail: ExerciseDetail,
): EditorFormValues | null {
  if (!isSupportedEditorType(detail.type)) return null;

  const defaults = createEditorDefaults(detail.type);
  const common = {
    ...defaults,
    type: detail.type,
    topicId: detail.topic_id,
    difficulty: detail.difficulty,
    scopes: [...detail.applicable_scopes],
    explanation: detail.explanation ?? "",
  };

  if (detail.type === "multiple_choice") {
    const branch = multipleChoiceBranchFromDetail(detail);
    return branch === null ? null : { ...common, multipleChoice: branch };
  }

  if (detail.type === "true_false") {
    const branch = trueFalseBranchFromDetail(detail);
    return branch === null ? null : { ...common, trueFalse: branch };
  }

  if (detail.type === "fill_blank") {
    const branch = fillBlankBranchFromDetail(detail);
    return branch === null ? null : { ...common, fillBlank: branch };
  }

  if (detail.type === "numeric_input") {
    const branch = numericInputBranchFromDetail(detail);
    return branch === null ? null : { ...common, numericInput: branch };
  }

  const branch = flashcardBranchFromDetail(detail);
  return branch === null ? null : { ...common, flashcard: branch };
}

function editablePayload(values: EditorFormValues) {
  if (values.topicId === null) {
    throw new TypeError("A topic is required before serialization.");
  }

  const common = {
    topic_id: values.topicId,
    difficulty: values.difficulty,
    explanation:
      values.explanation.trim().length === 0 ? null : values.explanation.trim(),
    applicable_scopes: values.scopes,
  };

  if (values.type === "multiple_choice") {
    return {
      ...serializeMultipleChoiceBranch(values.multipleChoice),
      ...common,
    };
  }

  if (values.type === "true_false") {
    return { ...serializeTrueFalseBranch(values.trueFalse), ...common };
  }

  if (values.type === "fill_blank") {
    return { ...serializeFillBlankBranch(values.fillBlank), ...common };
  }

  if (values.type === "numeric_input") {
    return { ...serializeNumericInputBranch(values.numericInput), ...common };
  }

  return { ...serializeFlashcardBranch(values.flashcard), ...common };
}

export function serializeCreateExercise(
  values: EditorFormValues,
  unitId: number,
): CreateExerciseRequest {
  return { ...editablePayload(values), owner_unit_id: unitId };
}

export function serializeUpdateExercise(
  values: EditorFormValues,
): UpdateExerciseRequest {
  return editablePayload(values);
}
