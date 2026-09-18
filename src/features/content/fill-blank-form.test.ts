import { describe, expect, it } from "vitest";

import type {
  CreateExerciseRequest,
  ExerciseDetail,
  UpdateExerciseRequest,
} from "@/contracts/admin/exercise-editor";
import {
  createEditorDefaults,
  editorFormSchema,
  formValuesFromDetail,
  serializeCreateExercise,
  serializeUpdateExercise,
  type EditorFormValues,
} from "@/features/content/editor-form";
import { duplicateChoiceValues } from "@/features/content/fill-blank-form";
import { validFillBlankDetailResponse } from "@/test/fixtures/exercise-editor-api";

const TEMPLATE = "Türklerde yazısız hukuk kurallarına {{0}} denir.";

const valid: EditorFormValues = {
  ...createEditorDefaults("fill_blank"),
  topicId: 1,
  difficulty: 3,
  scopes: ["tyt"],
  explanation: "Açıklama",
  fillBlank: {
    template: TEMPLATE,
    choices: [{ value: "Töre" }, { value: "Kurultay" }],
    blanks: [{ value: "Töre" }],
  },
};

function withBranch(change: Partial<EditorFormValues["fillBlank"]>) {
  return { ...valid, fillBlank: { ...valid.fillBlank, ...change } };
}

function fillBlankContent(
  body: CreateExerciseRequest | UpdateExerciseRequest,
): { template: string; choices: string[] } {
  expect(body.type).toBe("fill_blank");
  if (body.type !== "fill_blank") throw new Error("not a fill blank body");
  return body.content;
}

function fillBlankAnswer(body: CreateExerciseRequest | UpdateExerciseRequest): {
  blanks: string[];
} {
  expect(body.type).toBe("fill_blank");
  if (body.type !== "fill_blank") throw new Error("not a fill blank body");
  return body.answer_key;
}

function detailWith(content: unknown, answerKey: unknown): ExerciseDetail {
  return {
    ...validFillBlankDetailResponse.data,
    content,
    answer_key: answerKey,
  } as ExerciseDetail;
}

describe("fill blank defaults", () => {
  it("starts empty, with no invented placeholder and no choice rows", () => {
    const defaults = createEditorDefaults("fill_blank");
    expect(defaults.type).toBe("fill_blank");
    expect(defaults.fillBlank).toEqual({
      template: "",
      choices: [],
      blanks: [],
    });
    expect(defaults.topicId).toBeNull();
    expect(defaults.difficulty).toBe(3);
    expect(defaults.explanation).toBe("");
  });
});

describe("fill blank client validation", () => {
  it("accepts a single-blank question backed by choices", () => {
    expect(editorFormSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a free-answer question with no choices at all", () => {
    expect(
      editorFormSchema.safeParse(
        withBranch({ choices: [], blanks: [{ value: "Töre" }] }),
      ).success,
    ).toBe(true);
  });

  it("accepts several blanks with answers in occurrence order", () => {
    expect(
      editorFormSchema.safeParse(
        withBranch({
          template: "{{0}} ve {{1}} birlikte kullanılır.",
          choices: [{ value: "Töre" }, { value: "Kut" }],
          blanks: [{ value: "Töre" }, { value: "Kut" }],
        }),
      ).success,
    ).toBe(true);
  });

  it.each([
    ["a blank template", { template: "   " }],
    ["zero placeholders", { template: "Düz metin." }],
    ["only a malformed token", { template: "Düz {0} metin." }],
    ["an empty answer list", { blanks: [] }],
    [
      "too few answers",
      { template: "{{0}} ve {{1}}", blanks: [{ value: "Töre" }] },
    ],
    [
      "too many answers",
      { blanks: [{ value: "Töre" }, { value: "Kurultay" }] },
    ],
    ["an empty answer", { blanks: [{ value: "  " }] }],
    ["an empty choice row", { choices: [{ value: "Töre" }, { value: " " }] }],
    ["an answer outside the choices", { blanks: [{ value: "Kut" }] }],
  ])("rejects %s", (_label, change) => {
    expect(editorFormSchema.safeParse(withBranch(change)).success).toBe(false);
  });

  it("rejects an answer that only differs from a choice by case", () => {
    expect(
      editorFormSchema.safeParse(withBranch({ blanks: [{ value: "töre" }] }))
        .success,
    ).toBe(false);
  });

  it("matches answers against trimmed choices, exactly as the payload will", () => {
    expect(
      editorFormSchema.safeParse(
        withBranch({
          choices: [{ value: "  Töre  " }],
          blanks: [{ value: " Töre " }],
        }),
      ).success,
    ).toBe(true);
  });

  it.each([
    ["long explanation", { explanation: "x".repeat(2001) }],
    ["no scopes", { scopes: [] }],
    ["difficulty 6", { difficulty: 6 }],
    ["no topic", { topicId: null }],
  ])("rejects %s through the shared common fields", (_label, change) => {
    expect(editorFormSchema.safeParse({ ...valid, ...change }).success).toBe(
      false,
    );
  });

  it("ignores the untouched multiple choice and true/false branches", () => {
    expect(
      editorFormSchema.safeParse({
        ...valid,
        multipleChoice: { stem: "", options: [], correctOptionId: "" },
        trueFalse: { statement: "", answerValue: null },
      }).success,
    ).toBe(true);
  });
});

describe("fill blank hydration", () => {
  it("keeps the template, the choice order and the answer order", () => {
    const hydrated = formValuesFromDetail(
      validFillBlankDetailResponse.data as ExerciseDetail,
    );
    expect(hydrated?.type).toBe("fill_blank");
    expect(hydrated?.fillBlank.template).toBe(TEMPLATE);
    expect(hydrated?.fillBlank.choices.map((choice) => choice.value)).toEqual([
      "Töre",
      "Kurultay",
      "Toy",
      "Yuğ",
    ]);
    expect(hydrated?.fillBlank.blanks.map((blank) => blank.value)).toEqual([
      "Töre",
    ]);
  });

  it("never renumbers custom or non-sequential tokens on load", () => {
    const template = "{{4}} sonra {{1}} gelir.";
    const hydrated = formValuesFromDetail(
      detailWith({ template, choices: [] }, { blanks: ["A", "B"] }),
    );
    expect(hydrated?.fillBlank.template).toBe(template);
  });

  it("opens a stored question that has no choices", () => {
    const hydrated = formValuesFromDetail(
      detailWith(
        { template: "Başkent {{0}} şehridir." },
        { blanks: ["Karabalgasun"] },
      ),
    );
    expect(hydrated?.fillBlank.choices).toEqual([]);
    expect(hydrated?.fillBlank.blanks).toEqual([{ value: "Karabalgasun" }]);
  });

  it("opens a stored question with duplicate choices rather than refusing it", () => {
    const hydrated = formValuesFromDetail(
      detailWith(
        { template: "{{0}}", choices: ["Töre", "Töre"] },
        { blanks: ["Töre"] },
      ),
    );
    expect(hydrated?.fillBlank.choices).toEqual([
      { value: "Töre" },
      { value: "Töre" },
    ]);
  });

  it("refuses to hydrate a shape it cannot render back", () => {
    expect(formValuesFromDetail(detailWith({}, { blanks: ["A"] }))).toBeNull();
    expect(
      formValuesFromDetail(detailWith({ template: "{{0}}" }, { blanks: [7] })),
    ).toBeNull();
  });
});

describe("fill blank serialization", () => {
  it("sends the exact backend shape with flat string arrays", () => {
    const body = serializeCreateExercise(valid, 12);
    expect(body).toEqual({
      type: "fill_blank",
      topic_id: 1,
      owner_unit_id: 12,
      difficulty: 3,
      content: { template: TEMPLATE, choices: ["Töre", "Kurultay"] },
      answer_key: { blanks: ["Töre"] },
      explanation: "Açıklama",
      applicable_scopes: ["tyt"],
    });
  });

  it("keeps several answers in template occurrence order", () => {
    const body = serializeCreateExercise(
      withBranch({
        template: "{{0}} ve {{1}} birlikte kullanılır.",
        choices: [{ value: "Töre" }, { value: "Kut" }],
        blanks: [{ value: "Kut" }, { value: "Töre" }],
      }),
      12,
    );
    expect(fillBlankAnswer(body).blanks).toEqual(["Kut", "Töre"]);
  });

  it("sends an empty choice list for a free-answer question", () => {
    const body = serializeCreateExercise(
      withBranch({ choices: [], blanks: [{ value: "Töre" }] }),
      12,
    );
    expect(fillBlankContent(body).choices).toEqual([]);
  });

  it("trims choices and answers together so membership survives", () => {
    const body = serializeCreateExercise(
      withBranch({
        template: `  ${TEMPLATE}  `,
        choices: [{ value: "  Töre  " }],
        blanks: [{ value: " Töre " }],
      }),
      12,
    );
    expect(fillBlankContent(body)).toEqual({
      template: TEMPLATE,
      choices: ["Töre"],
    });
    expect(fillBlankAnswer(body).blanks).toEqual(["Töre"]);
    expect(fillBlankContent(body).choices).toContain(
      fillBlankAnswer(body).blanks[0],
    );
  });

  it("nulls a blank explanation and keeps ownership per mode", () => {
    const create = serializeCreateExercise({ ...valid, explanation: "  " }, 12);
    const update = serializeUpdateExercise(valid);

    expect(create.explanation).toBeNull();
    expect(create).toMatchObject({ owner_unit_id: 12 });
    expect(update).not.toHaveProperty("owner_unit_id");
    expect(update).not.toHaveProperty("status");
    expect(update).not.toHaveProperty("version");
  });
});

describe("duplicate choice detection", () => {
  it("reports repeated values and ignores blank rows", () => {
    expect(
      duplicateChoiceValues([
        { value: "Töre" },
        { value: " Töre " },
        { value: "Kut" },
        { value: "" },
        { value: "  " },
      ]),
    ).toEqual(["Töre"]);
  });

  it("reports nothing for a clean list", () => {
    expect(
      duplicateChoiceValues([{ value: "Töre" }, { value: "Kut" }]),
    ).toEqual([]);
  });
});
