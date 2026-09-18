import { describe, expect, it } from "vitest";

import { exerciseTypes, publishStatuses } from "@/contracts/admin/content";
import {
  buildExerciseQuery,
  parseDifficulty,
  parseExerciseStatus,
  parseExerciseType,
  parseTopicId,
} from "@/features/content/exercise-filters";

describe("parseExerciseType", () => {
  it.each(exerciseTypes)("accepts the %s type", (type) => {
    expect(parseExerciseType(type)).toBe(type);
  });

  it.each([
    "banana",
    "MULTIPLE_CHOICE",
    "",
    null,
    undefined,
    42,
    ["multiple_choice", "true_false"],
  ])("treats %s as no filter", (value) => {
    expect(parseExerciseType(value)).toBeUndefined();
  });
});

describe("parseExerciseStatus", () => {
  it.each(publishStatuses)("accepts the %s status", (status) => {
    expect(parseExerciseStatus(status)).toBe(status);
  });

  it.each(["banana", "PUBLISHED", "", null, ["draft", "published"]])(
    "treats %s as no filter",
    (value) => {
      expect(parseExerciseStatus(value)).toBeUndefined();
    },
  );
});

describe("parseDifficulty", () => {
  it.each(["1", "2", "3", "4", "5"])("accepts %s", (value) => {
    expect(parseDifficulty(value)).toBe(Number(value));
  });

  it.each(["0", "6", "999", "abc", "", "1.5", "-1", null, 3])(
    "rejects %s",
    (value) => {
      expect(parseDifficulty(value)).toBeUndefined();
    },
  );
});

describe("parseTopicId", () => {
  it.each(["1", "42"])("accepts %s", (value) => {
    expect(parseTopicId(value)).toBe(Number(value));
  });

  it.each([
    "0",
    "-1",
    "abc",
    "",
    "1.5",
    "01",
    "1/../../me",
    "999999999999999999999",
    null,
  ])("rejects %s", (value) => {
    expect(parseTopicId(value)).toBeUndefined();
  });
});

describe("buildExerciseQuery", () => {
  it("returns an empty string when no filter is set", () => {
    expect(buildExerciseQuery({})).toBe("");
  });

  it("encodes a type filter", () => {
    expect(buildExerciseQuery({ type: "multiple_choice" })).toBe(
      "?type=multiple_choice",
    );
  });

  it("encodes a status filter", () => {
    expect(buildExerciseQuery({ status: "draft" })).toBe("?status=draft");
  });

  it("encodes both deterministically", () => {
    expect(
      buildExerciseQuery({ type: "multiple_choice", status: "draft" }),
    ).toBe("?type=multiple_choice&status=draft");
    expect(
      buildExerciseQuery({ status: "draft", type: "multiple_choice" }),
    ).toBe("?type=multiple_choice&status=draft");
  });

  it("refuses to encode a value outside the enum", () => {
    expect(() => buildExerciseQuery({ type: "banana" as never })).toThrow();
    expect(() => buildExerciseQuery({ status: "banana" as never })).toThrow();
  });

  it("cannot be used to smuggle another parameter", () => {
    // Even a value that looks like a query fragment is rejected by the enum.
    expect(() =>
      buildExerciseQuery({ type: "multiple_choice&topic=1" as never }),
    ).toThrow();
  });
});
