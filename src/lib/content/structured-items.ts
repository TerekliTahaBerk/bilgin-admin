/**
 * Pure helpers shared by the three structured editors (matching, ordering and
 * word order). All of them speak the same {id, text} vocabulary the backend's
 * Rules::idList() validates, and all of them are deliberately dependency-free
 * so the reorder logic can be tested without simulating a browser drag.
 *
 * The single invariant every helper protects: an item's id is its identity.
 * Editing text, deleting a neighbour or reordering the answer never renumbers
 * an id, because the answer key references ids — not list positions.
 */

export type StructuredItem = Readonly<{ id: string; text: string }>;

/**
 * Smallest unused id in the given style. Numeric ids mirror the backend seed
 * rows ("1", "2", …); letter ids mirror the right-hand column ("a", "b", …).
 * Deleting an item never frees an id that is still in use, so reusing a freed
 * one is safe: the caller passes the *current* ids, never a counter.
 */
export function nextStructuredItemId(
  existingIds: readonly string[],
  style: "numeric" | "letter" = "numeric",
): string {
  const existing = new Set(existingIds);

  if (style === "letter") {
    for (let code = 97; code <= 122; code += 1) {
      const candidate = String.fromCharCode(code);
      if (!existing.has(candidate)) return candidate;
    }
  } else {
    for (let index = 1; index <= existing.size + 1; index += 1) {
      const candidate = String(index);
      if (!existing.has(candidate)) return candidate;
    }
  }

  let suffix = 1;
  while (existing.has(`item-${suffix}`)) suffix += 1;
  return `item-${suffix}`;
}

/** Appends an id to the answer order, ignoring one that is already there. */
export function appendIdToOrder(
  order: readonly string[],
  id: string,
): string[] {
  return order.includes(id) ? [...order] : [...order, id];
}

/** Drops every occurrence of an id from the answer order. */
export function removeIdFromOrder(
  order: readonly string[],
  id: string,
): string[] {
  return order.filter((entry) => entry !== id);
}

/**
 * Moves one id by `offset` positions. Out-of-range moves and unknown ids are
 * no-ops rather than errors, so a stale click can never corrupt the order.
 * The input array is never mutated.
 */
export function moveIdInOrder(
  order: readonly string[],
  id: string,
  offset: number,
): string[] {
  const from = order.indexOf(id);
  if (from === -1) return [...order];

  const to = from + offset;
  if (to < 0 || to >= order.length) return [...order];

  const next = [...order];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Mirrors the backend's Rules::requireExactOrder(): the order must contain
 * every item id exactly once — no missing id, no duplicate, no stranger.
 */
export function isExactIdPermutation(
  order: readonly string[],
  itemIds: readonly string[],
): boolean {
  if (order.length !== itemIds.length) return false;

  const expected = [...itemIds].sort();
  const given = [...order].sort();

  return expected.every((id, index) => id === given[index]);
}

/** True when every id in the list is present exactly once. */
export function hasUniqueIds(ids: readonly string[]): boolean {
  return new Set(ids).size === ids.length;
}

export type ResolvedOrderEntry = Readonly<{
  id: string;
  label: string;
  /** False when the answer order references an item that no longer exists. */
  known: boolean;
}>;

/**
 * Resolves answer-order ids to the item text they currently point at. A blank
 * text falls back to a positional placeholder ("Öğe 2") so the correct-order
 * list never renders `undefined`, and an id with no item at all is reported
 * as unknown rather than silently skipped.
 */
export function resolveOrderedItems(
  items: readonly StructuredItem[],
  order: readonly string[],
  fallbackPrefix: string,
): ResolvedOrderEntry[] {
  return order.map((id) => {
    const index = items.findIndex((item) => item.id === id);

    if (index === -1) {
      return { id, label: "Bilinmeyen öğe", known: false };
    }

    const text = items[index].text.trim();
    return {
      id,
      label: text.length === 0 ? `${fallbackPrefix} ${index + 1}` : text,
      known: true,
    };
  });
}
