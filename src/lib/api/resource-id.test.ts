import { describe, expect, it } from "vitest";

import { parseResourceId, requireResourceId } from "@/lib/api/resource-id";

describe("parseResourceId", () => {
  it.each([
    ["1", 1],
    ["42", 42],
    ["999", 999],
  ])("accepts the numeric string %s", (input, expected) => {
    expect(parseResourceId(input)).toBe(expected);
  });

  it.each([1, 42, 9007199254740991])("accepts the number %i", (input) => {
    expect(parseResourceId(input)).toBe(input);
  });

  it.each([
    ["zero", "0"],
    ["a negative id", "-1"],
    ["a fractional id", "1.5"],
    ["a leading zero", "01"],
    ["a word", "abc"],
    ["an empty string", ""],
    ["whitespace", " 1 "],
    ["a traversal attempt", "1/../../me"],
    ["a nested path", "1/units"],
    ["a query string", "1?x=y"],
    ["an encoded slash", "1%2F..%2Fme"],
    ["a fragment", "1#top"],
    ["scientific notation", "1e3"],
    ["a plus sign", "+1"],
    ["an oversized integer", "999999999999999999999"],
    ["hex", "0x1"],
  ])("rejects %s", (_label, input) => {
    expect(parseResourceId(input)).toBeNull();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_VALUE, Infinity])(
    "rejects the unsafe number %s",
    (input) => {
      expect(parseResourceId(input)).toBeNull();
    },
  );

  it.each([null, undefined, {}, [], true])(
    "rejects the non-id value %s",
    (input) => {
      expect(parseResourceId(input)).toBeNull();
    },
  );
});

describe("requireResourceId", () => {
  it.each([1, 42, 9007199254740991])("returns the number %i", (input) => {
    expect(requireResourceId(input)).toBe(input);
  });

  it.each([0, -1, 1.5, Number.NaN, Infinity, Number.MAX_VALUE])(
    "throws for the invalid number %s",
    (input) => {
      expect(() => requireResourceId(input)).toThrow(TypeError);
    },
  );

  it.each(["42", "abc", "1/../../me", null, undefined])(
    "throws for the non-number %s, since every caller is past the string edge",
    (input) => {
      expect(() => requireResourceId(input as unknown as number)).toThrow(
        TypeError,
      );
    },
  );
});
