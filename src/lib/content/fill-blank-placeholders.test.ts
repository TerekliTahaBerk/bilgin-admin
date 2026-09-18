import { describe, expect, it } from "vitest";

import {
  blanksAfterChoiceRemoval,
  blanksAfterChoiceRename,
  countFillBlankPlaceholders,
  insertPlaceholderAt,
  nextPlaceholderToken,
  parseFillBlankPlaceholders,
  syncBlanksToPlaceholderCount,
} from "@/lib/content/fill-blank-placeholders";

describe("fill blank placeholder parser", () => {
  it("returns nothing for a template without tokens", () => {
    expect(parseFillBlankPlaceholders("")).toEqual([]);
    expect(parseFillBlankPlaceholders("Düz metin.")).toEqual([]);
    expect(countFillBlankPlaceholders("Düz metin.")).toBe(0);
  });

  it("finds a single token with its position", () => {
    expect(parseFillBlankPlaceholders("Türklerde {{0}} denir.")).toEqual([
      { token: "{{0}}", number: 0, start: 10, end: 15 },
    ]);
  });

  it("finds several tokens in occurrence order", () => {
    const parsed = parseFillBlankPlaceholders("{{0}} ve {{1}} olur.");
    expect(parsed.map((placeholder) => placeholder.token)).toEqual([
      "{{0}}",
      "{{1}}",
    ]);
    expect(parsed[0]!.start).toBe(0);
    expect(parsed[1]!.start).toBe(9);
  });

  it("accepts any number, not just 0 and 1", () => {
    expect(parseFillBlankPlaceholders("{{27}}")).toEqual([
      { token: "{{27}}", number: 27, start: 0, end: 6 },
    ]);
  });

  it("counts occurrences, so a repeated token is two blanks", () => {
    // The backend counts preg_match_all occurrences; uniqueness is not checked.
    expect(countFillBlankPlaceholders("{{0}} {{0}}")).toBe(2);
  });

  it("orders by occurrence, not by token number", () => {
    const parsed = parseFillBlankPlaceholders("{{4}} sonra {{1}}");
    expect(parsed.map((placeholder) => placeholder.number)).toEqual([4, 1]);
  });

  it.each([
    ["single braces", "{0}"],
    ["non-numeric", "{{x}}"],
    ["empty braces", "{{}}"],
    ["unclosed", "{{0}"],
    ["spaced", "{{ 0 }}"],
  ])("ignores the malformed token %s", (_label, template) => {
    expect(parseFillBlankPlaceholders(template)).toEqual([]);
  });

  it("does not carry regex state between calls", () => {
    const template = "{{0}} {{1}}";
    expect(countFillBlankPlaceholders(template)).toBe(2);
    expect(countFillBlankPlaceholders(template)).toBe(2);
    expect(countFillBlankPlaceholders(template)).toBe(2);
  });
});

describe("next placeholder token", () => {
  it.each([
    ["an empty template", "", "{{0}}"],
    ["one token", "{{0}}", "{{1}}"],
    ["a gap", "{{0}}, {{2}}", "{{3}}"],
    ["a high number", "{{27}}", "{{28}}"],
    ["out-of-order tokens", "{{4}} sonra {{1}}", "{{5}}"],
  ])("continues past the highest number with %s", (_label, template, next) => {
    expect(nextPlaceholderToken(template)).toBe(next);
  });
});

describe("placeholder insertion at the caret", () => {
  it("inserts into an empty template", () => {
    expect(insertPlaceholderAt("", 0, 0)).toEqual({
      template: "{{0}}",
      caret: 5,
    });
  });

  it("inserts in the middle of the text rather than appending", () => {
    const result = insertPlaceholderAt("Türklerde  denir.", 10, 10);
    expect(result.template).toBe("Türklerde {{0}} denir.");
    expect(result.caret).toBe(15);
  });

  it("replaces the selected text", () => {
    const result = insertPlaceholderAt("Türklerde töre denir.", 10, 14);
    expect(result.template).toBe("Türklerde {{0}} denir.");
    expect(result.caret).toBe(15);
  });

  it("leaves existing tokens untouched and continues their numbering", () => {
    const result = insertPlaceholderAt("{{0}} ve {{2}} son", 18, 18);
    expect(result.template).toBe("{{0}} ve {{2}} son{{3}}");
    expect(result.template).toContain("{{0}}");
    expect(result.template).toContain("{{2}}");
    expect(result.caret).toBe(23);
  });

  it("clamps a caret outside the template", () => {
    expect(insertPlaceholderAt("abc", 99, 99).template).toBe("abc{{0}}");
    expect(insertPlaceholderAt("abc", -5, -5).template).toBe("{{0}}abc");
  });

  it("falls back to the end when the caret is unknown", () => {
    expect(insertPlaceholderAt("abc", Number.NaN, Number.NaN).template).toBe(
      "abc{{0}}",
    );
  });
});

describe("answer synchronisation", () => {
  it("appends an empty answer when the first blank appears", () => {
    expect(syncBlanksToPlaceholderCount([], 1)).toEqual([""]);
  });

  it("preserves existing answers and adds empty slots when growing", () => {
    expect(syncBlanksToPlaceholderCount(["Töre"], 2)).toEqual(["Töre", ""]);
    expect(syncBlanksToPlaceholderCount(["Töre"], 3)).toEqual(["Töre", "", ""]);
  });

  it("truncates from the end when shrinking", () => {
    expect(syncBlanksToPlaceholderCount(["Töre", "Kut"], 1)).toEqual(["Töre"]);
    expect(syncBlanksToPlaceholderCount(["Töre", "Kut"], 0)).toEqual([]);
  });

  it("leaves an already matching list alone", () => {
    const blanks = ["Töre", "Kut"];
    expect(syncBlanksToPlaceholderCount(blanks, 2)).toEqual(blanks);
  });
});

describe("choice edits and their answers", () => {
  it("leaves answers alone when an unused choice is removed", () => {
    expect(blanksAfterChoiceRemoval(["Töre", "Kut"], "Toy")).toEqual([
      "Töre",
      "Kut",
    ]);
  });

  it("clears every answer that used a removed choice", () => {
    expect(blanksAfterChoiceRemoval(["Töre", "Kut", "Töre"], "Töre")).toEqual([
      "",
      "Kut",
      "",
    ]);
  });

  it("never substitutes another choice for a removed one", () => {
    expect(blanksAfterChoiceRemoval(["Töre"], "Töre")).toEqual([""]);
  });

  it("ignores the removal of a blank choice row", () => {
    expect(blanksAfterChoiceRemoval(["Töre", ""], "   ")).toEqual(["Töre", ""]);
  });

  it("migrates answers that pointed at a renamed choice", () => {
    expect(
      blanksAfterChoiceRename(["Töre", "Kut"], "Töre", "Töre (yasa)"),
    ).toEqual(["Töre (yasa)", "Kut"]);
  });

  it("leaves unrelated answers alone on a rename", () => {
    expect(blanksAfterChoiceRename(["Kut"], "Töre", "Töre (yasa)")).toEqual([
      "Kut",
    ]);
  });

  it("does nothing when the rename is a no-op or the old value was blank", () => {
    expect(blanksAfterChoiceRename(["Töre"], "Töre", "Töre")).toEqual(["Töre"]);
    expect(blanksAfterChoiceRename(["Töre"], "", "Yeni")).toEqual(["Töre"]);
  });
});
