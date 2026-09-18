/**
 * Single source of truth for fill-blank placeholder parsing.
 *
 * The pattern mirrors the backend FillBlankValidator exactly:
 *
 *   preg_match_all('/\{\{\d+\}\}/', $template, $matches);
 *
 * The backend counts occurrences and nothing else — it never checks that the
 * numbers are sequential or unique — so neither do we. "{{4}} sonra {{1}}" is
 * two blanks, and "{{0}} {{0}}" is also two. Nothing here rewrites a template.
 */
const PLACEHOLDER_SOURCE = "\\{\\{\\d+\\}\\}";

export type FillBlankPlaceholder = Readonly<{
  /** The matched token, e.g. "{{0}}". */
  token: string;
  /** The numeric part of the token — NOT the answer index. */
  number: number;
  start: number;
  end: number;
}>;

export function parseFillBlankPlaceholders(
  template: string,
): FillBlankPlaceholder[] {
  // A fresh regex per call: a shared /g instance would carry lastIndex across
  // calls and silently skip matches.
  const pattern = new RegExp(PLACEHOLDER_SOURCE, "g");

  return [...template.matchAll(pattern)].map((match) => ({
    token: match[0],
    number: Number(match[0].slice(2, -2)),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

/** Occurrence count, which is what the backend compares against blanks. */
export function countFillBlankPlaceholders(template: string): number {
  return parseFillBlankPlaceholders(template).length;
}

/**
 * The next token to insert: one past the highest number already present, so
 * existing tokens are never renumbered. An empty template starts at {{0}}.
 */
export function nextPlaceholderToken(template: string): string {
  const numbers = parseFillBlankPlaceholders(template).map(
    (placeholder) => placeholder.number,
  );
  return numbers.length === 0 ? "{{0}}" : `{{${Math.max(...numbers) + 1}}}`;
}

export type PlaceholderInsertion = Readonly<{
  template: string;
  /** Where the caret belongs afterwards: just past the inserted token. */
  caret: number;
}>;

/**
 * Inserts the next token at the caret, replacing any selected text. Never
 * appends blindly to the end, and never touches the tokens already there.
 */
export function insertPlaceholderAt(
  template: string,
  selectionStart: number,
  selectionEnd: number,
): PlaceholderInsertion {
  const length = template.length;
  const rawStart = Number.isFinite(selectionStart) ? selectionStart : length;
  const rawEnd = Number.isFinite(selectionEnd) ? selectionEnd : rawStart;
  const start = Math.min(Math.max(rawStart, 0), length);
  const end = Math.min(Math.max(Math.max(rawEnd, start), 0), length);

  const token = nextPlaceholderToken(template);

  return {
    template: `${template.slice(0, start)}${token}${template.slice(end)}`,
    caret: start + token.length,
  };
}

/**
 * Keeps the answer list the same length as the template's placeholders.
 * Growing appends empty answers; shrinking truncates from the end. Answers
 * that stay in range are preserved untouched.
 */
export function syncBlanksToPlaceholderCount(
  blanks: readonly string[],
  count: number,
): string[] {
  if (count <= blanks.length) return blanks.slice(0, Math.max(count, 0));
  return [
    ...blanks,
    ...Array.from({ length: count - blanks.length }, () => ""),
  ];
}

/**
 * Removing a choice orphans any answer that used it. The answer is cleared so
 * validation surfaces it — never silently swapped for another choice.
 */
export function blanksAfterChoiceRemoval(
  blanks: readonly string[],
  removedChoice: string,
): string[] {
  const removed = removedChoice.trim();
  if (removed.length === 0) return [...blanks];
  return blanks.map((blank) => (blank.trim() === removed ? "" : blank));
}

/**
 * Renaming a choice migrates the answers that pointed at its exact old value,
 * so editing "Töre" into "Töre (yasa)" keeps the question answerable instead
 * of quietly orphaning it.
 */
export function blanksAfterChoiceRename(
  blanks: readonly string[],
  previousChoice: string,
  nextChoice: string,
): string[] {
  const previous = previousChoice.trim();
  if (previous.length === 0 || previous === nextChoice.trim()) {
    return [...blanks];
  }
  return blanks.map((blank) =>
    blank.trim() === previous ? nextChoice : blank,
  );
}
