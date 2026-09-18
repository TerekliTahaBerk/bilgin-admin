import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { unitsResponseSchema, type Unit } from "@/contracts/admin/content";
import {
  isAwaitingExercises,
  summarizeUnits,
} from "@/features/content/units-summary";
import { validUnitsResponse } from "@/test/fixtures/courses-api";

const units: Unit[] = unitsResponseSchema.parse(validUnitsResponse).data;

describe("summarizeUnits", () => {
  it("derives every figure from the units payload", () => {
    const summary = summarizeUnits(units);

    expect(summary.totalUnits).toBe(units.length);
    expect(summary.publishedUnits).toBe(
      units.filter((unit) => unit.status === "published").length,
    );
    expect(summary.totalExercises).toBe(
      units.reduce((total, unit) => total + unit.exercise_count, 0),
    );
    expect(summary.totalNodes).toBe(
      units.reduce((total, unit) => total + unit.node_count, 0),
    );
  });

  it("counts only the published status", () => {
    expect(summarizeUnits(units).publishedUnits).toBe(1);
  });

  it("returns zeroes for a course with no units", () => {
    expect(summarizeUnits([])).toEqual({
      totalUnits: 0,
      publishedUnits: 0,
      totalExercises: 0,
      totalNodes: 0,
    });
  });

  it("does not mutate or reorder its input", () => {
    const snapshot = structuredClone(units);

    summarizeUnits(units);

    expect(units).toEqual(snapshot);
  });

  it("exposes no publishability verdict", () => {
    expect(Object.keys(summarizeUnits(units)).sort()).toEqual([
      "publishedUnits",
      "totalExercises",
      "totalNodes",
      "totalUnits",
    ]);
  });
});

describe("isAwaitingExercises", () => {
  it("flags a unit with no exercises", () => {
    expect(
      isAwaitingExercises(units.find((u) => u.exercise_count === 0)!),
    ).toBe(true);
  });

  it("does not flag a unit that has exercises", () => {
    expect(isAwaitingExercises(units.find((u) => u.exercise_count > 0)!)).toBe(
      false,
    );
  });

  it("says nothing about whether the unit can be published", () => {
    const awaiting = units.find((u) => u.exercise_count === 0)!;

    // A count cannot establish publishability; only the backend's
    // preview-selection and publish endpoints can.
    expect(isAwaitingExercises(awaiting)).toBe(true);
    expect(awaiting.node_count).toBe(0);
  });
});

describe("content source", () => {
  const sourceRoot = path.resolve(import.meta.dirname, "../..");

  function listSourceFiles(directory: string): string[] {
    return readdirSync(directory).flatMap((entry) => {
      const entryPath = path.join(directory, entry);

      if (statSync(entryPath).isDirectory()) {
        return listSourceFiles(entryPath);
      }

      return /\.tsx?$/.test(entry) && !entry.includes(".test.")
        ? [entryPath]
        : [];
    });
  }

  /**
   * The old panel document suggested warning "not publishable" when
   * exercise_count < node_count * 6. Counts cannot establish that, so no such
   * arithmetic or claim may appear in the product source.
   */
  it("derives no publishability verdict from counts anywhere", () => {
    const patterns = [
      /node_count\s*[*\/]/,
      /[*\/]\s*node_count/,
      /exercise_count\s*<|<\s*exercise_count/,
      /exercise_count\s*>=|>=\s*exercise_count/,
      /Yayınlanamaz|Hazır değil|Eksik \d+ soru/i,
    ];
    const offenders = listSourceFiles(sourceRoot).filter((file) => {
      const contents = readFileSync(file, "utf8");

      return patterns.some((pattern) => pattern.test(contents));
    });

    expect(offenders.map((file) => path.relative(sourceRoot, file))).toEqual(
      [],
    );
  });
});
