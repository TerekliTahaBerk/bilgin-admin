import { describe, expect, it } from "vitest";

import { csvToMultipleChoiceExercises } from "@/lib/import/csv-to-exercises";

describe("csvToMultipleChoiceExercises", () => {
  it("converts valid comma-separated rows into exercises", () => {
    const raw = [
      "topic,stem,option_a,option_b,option_c,option_d,correct,difficulty,explanation",
      "Kesirler,2/4 kesri sadeleştirilirse ne olur?,1/2,1/3,2/3,1/4,a,2,2/4 = 1/2",
    ].join("\n");

    const result = csvToMultipleChoiceExercises(raw);

    expect(result.errors).toEqual([]);
    expect(result.exercises).toHaveLength(1);
    expect(result.exercises[0]).toEqual({
      type: "multiple_choice",
      topic: "Kesirler",
      difficulty: 2,
      content: {
        stem: "2/4 kesri sadeleştirilirse ne olur?",
        options: [
          { id: "a", text: "1/2" },
          { id: "b", text: "1/3" },
          { id: "c", text: "2/3" },
          { id: "d", text: "1/4" },
        ],
      },
      answer_key: { correct_option_id: "a" },
      explanation: "2/4 = 1/2",
    });
  });

  it("auto-detects a tab-separated paste (e.g. from Sheets/Excel)", () => {
    const raw = [
      "topic\tstem\toption_a\toption_b\toption_c\toption_d\tcorrect",
      "Sayılar\tHangisi tek sayıdır?\t2\t4\t7\t8\tc",
    ].join("\n");

    const result = csvToMultipleChoiceExercises(raw);

    expect(result.errors).toEqual([]);
    expect(result.exercises).toHaveLength(1);
    expect(result.exercises[0]?.answer_key.correct_option_id).toBe("c");
  });

  it("defaults difficulty to 3 and explanation to null when omitted", () => {
    const raw = [
      "topic,stem,option_a,option_b,option_c,option_d,correct",
      "Konu,Soru?,A,B,C,D,b",
    ].join("\n");

    const result = csvToMultipleChoiceExercises(raw);

    expect(result.errors).toEqual([]);
    expect(result.exercises[0]?.difficulty).toBe(3);
    expect(result.exercises[0]?.explanation).toBeNull();
  });

  it("reports a single top-level error when required headers are missing", () => {
    const raw = ["topic,stem,option_a", "Konu,Soru?,A"].join("\n");

    const result = csvToMultipleChoiceExercises(raw);

    expect(result.exercises).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Eksik sütun başlığı");
    expect(result.errors[0]).toContain("option_b");
    expect(result.errors[0]).toContain("correct");
  });

  it("reports an error for an empty paste", () => {
    const result = csvToMultipleChoiceExercises("   \n  \n");

    expect(result.exercises).toEqual([]);
    expect(result.errors).toEqual(["Yapıştırılan tablo boş."]);
  });

  it("reports per-row validation errors with 1-indexed row numbers (header = row 1)", () => {
    const raw = [
      "topic,stem,option_a,option_b,option_c,option_d,correct",
      "Konu,Soru?,A,B,C,D,b",
      ",Boş konu satırı,A,B,C,D,z",
      "Konu2,Soru2?,,B,C,D,a",
    ].join("\n");

    const result = csvToMultipleChoiceExercises(raw);

    expect(result.exercises).toHaveLength(1);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toContain("Satır 3");
    expect(result.errors[0]).toContain("konu boş");
    expect(result.errors[0]).toContain("doğru cevap");
    expect(result.errors[1]).toContain("Satır 4");
    expect(result.errors[1]).toContain("a şıkkı boş");
  });

  it("rejects an out-of-range or non-integer difficulty", () => {
    const raw = [
      "topic,stem,option_a,option_b,option_c,option_d,correct,difficulty",
      "Konu,Soru?,A,B,C,D,a,7",
    ].join("\n");

    const result = csvToMultipleChoiceExercises(raw);

    expect(result.exercises).toEqual([]);
    expect(result.errors[0]).toContain("zorluk 1-5");
  });

  it("is case-insensitive for the correct-answer column", () => {
    const raw = [
      "topic,stem,option_a,option_b,option_c,option_d,correct",
      "Konu,Soru?,A,B,C,D,B",
    ].join("\n");

    const result = csvToMultipleChoiceExercises(raw);

    expect(result.errors).toEqual([]);
    expect(result.exercises[0]?.answer_key.correct_option_id).toBe("b");
  });

  it("skips blank lines between rows", () => {
    const raw = [
      "topic,stem,option_a,option_b,option_c,option_d,correct",
      "",
      "Konu,Soru?,A,B,C,D,a",
      "   ",
    ].join("\n");

    const result = csvToMultipleChoiceExercises(raw);

    expect(result.errors).toEqual([]);
    expect(result.exercises).toHaveLength(1);
  });
});
