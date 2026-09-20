import { describe, expect, it } from "vitest";

import {
  appendIdToOrder,
  hasUniqueIds,
  isExactIdPermutation,
  moveIdInOrder,
  nextStructuredItemId,
  removeIdFromOrder,
  resolveOrderedItems,
} from "@/lib/content/structured-items";

describe("nextStructuredItemId", () => {
  it("returns the smallest unused numeric id", () => {
    expect(nextStructuredItemId([])).toBe("1");
    expect(nextStructuredItemId(["1", "2"])).toBe("3");
  });

  it("fills a gap left by a deleted item instead of renumbering", () => {
    // "2" was deleted; "1" and "3" keep their ids and the new row takes "2".
    expect(nextStructuredItemId(["1", "3"])).toBe("2");
  });

  it("returns the smallest unused letter id for the right-hand column", () => {
    expect(nextStructuredItemId([], "letter")).toBe("a");
    expect(nextStructuredItemId(["a", "b"], "letter")).toBe("c");
    expect(nextStructuredItemId(["a", "c"], "letter")).toBe("b");
  });

  it("falls back to a prefixed id once the letter alphabet is exhausted", () => {
    const letters = Array.from({ length: 26 }, (_, index) =>
      String.fromCharCode(97 + index),
    );
    expect(nextStructuredItemId(letters, "letter")).toBe("item-1");
    expect(nextStructuredItemId([...letters, "item-1"], "letter")).toBe(
      "item-2",
    );
  });

  it("never returns an id that is already in use", () => {
    const ids = ["1", "2", "3", "4", "5"];
    expect(ids).not.toContain(nextStructuredItemId(ids));
  });
});

describe("appendIdToOrder / removeIdFromOrder", () => {
  it("appends a new id at the end and never mutates the input", () => {
    const order = ["1", "2"];
    expect(appendIdToOrder(order, "3")).toEqual(["1", "2", "3"]);
    expect(order).toEqual(["1", "2"]);
  });

  it("ignores an id that is already in the order", () => {
    expect(appendIdToOrder(["1", "2"], "2")).toEqual(["1", "2"]);
  });

  it("removes an id without disturbing the rest", () => {
    const order = ["1", "2", "3"];
    expect(removeIdFromOrder(order, "2")).toEqual(["1", "3"]);
    expect(order).toEqual(["1", "2", "3"]);
  });

  it("is a no-op for an id that is not in the order", () => {
    expect(removeIdFromOrder(["1", "2"], "9")).toEqual(["1", "2"]);
  });
});

describe("moveIdInOrder", () => {
  it("moves an item up", () => {
    expect(moveIdInOrder(["1", "2", "3"], "2", -1)).toEqual(["2", "1", "3"]);
  });

  it("moves an item down", () => {
    expect(moveIdInOrder(["1", "2", "3"], "2", 1)).toEqual(["1", "3", "2"]);
  });

  it("moves the first item to the last position", () => {
    expect(moveIdInOrder(["1", "2", "3"], "1", 2)).toEqual(["2", "3", "1"]);
  });

  it("moves the last item to the first position", () => {
    expect(moveIdInOrder(["1", "2", "3"], "3", -2)).toEqual(["3", "1", "2"]);
  });

  it("treats a zero offset as a no-op", () => {
    expect(moveIdInOrder(["1", "2", "3"], "2", 0)).toEqual(["1", "2", "3"]);
  });

  it("clamps an out-of-range move to a no-op rather than dropping the item", () => {
    expect(moveIdInOrder(["1", "2"], "1", -1)).toEqual(["1", "2"]);
    expect(moveIdInOrder(["1", "2"], "2", 1)).toEqual(["1", "2"]);
  });

  it("is a safe no-op for an unknown id", () => {
    expect(moveIdInOrder(["1", "2"], "9", 1)).toEqual(["1", "2"]);
  });

  it("never mutates the input array", () => {
    const order = ["1", "2", "3"];
    moveIdInOrder(order, "1", 2);
    expect(order).toEqual(["1", "2", "3"]);
  });
});

describe("isExactIdPermutation", () => {
  it("accepts any permutation of exactly the item ids", () => {
    expect(isExactIdPermutation(["1", "2"], ["1", "2"])).toBe(true);
    expect(isExactIdPermutation(["2", "1"], ["1", "2"])).toBe(true);
    expect(isExactIdPermutation(["c", "a", "b"], ["a", "b", "c"])).toBe(true);
  });

  it("rejects a missing, duplicated, unknown or extra id", () => {
    expect(isExactIdPermutation(["1"], ["1", "2"])).toBe(false);
    expect(isExactIdPermutation(["1", "1"], ["1", "2"])).toBe(false);
    expect(isExactIdPermutation(["1", "2", "x"], ["1", "2"])).toBe(false);
    expect(isExactIdPermutation(["2", "3"], ["1", "2"])).toBe(false);
  });

  it("accepts two empty lists and rejects an order for an empty list", () => {
    expect(isExactIdPermutation([], [])).toBe(true);
    expect(isExactIdPermutation(["1"], [])).toBe(false);
  });
});

describe("hasUniqueIds", () => {
  it("reports duplicates", () => {
    expect(hasUniqueIds(["1", "2"])).toBe(true);
    expect(hasUniqueIds(["1", "1"])).toBe(false);
    expect(hasUniqueIds([])).toBe(true);
  });
});

describe("resolveOrderedItems", () => {
  const items = [
    { id: "1", text: "Göktürkler" },
    { id: "2", text: "  " },
  ];

  it("resolves ids to their current text, in answer order", () => {
    expect(resolveOrderedItems(items, ["2", "1"], "Öğe")).toEqual([
      { id: "2", label: "Öğe 2", known: true },
      { id: "1", label: "Göktürkler", known: true },
    ]);
  });

  it("uses a positional placeholder for blank text, never undefined", () => {
    const [entry] = resolveOrderedItems(items, ["2"], "Kelime");
    expect(entry.label).toBe("Kelime 2");
    expect(entry.known).toBe(true);
  });

  it("flags an id with no matching item instead of dropping it", () => {
    expect(resolveOrderedItems(items, ["9"], "Öğe")).toEqual([
      { id: "9", label: "Bilinmeyen öğe", known: false },
    ]);
  });
});
