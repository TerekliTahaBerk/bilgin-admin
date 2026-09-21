/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EditorFormValues } from "@/features/content/editor-form";
import {
  clearDraft,
  exerciseDraftKey,
  loadDraft,
  saveDraft,
} from "@/features/content/exercise-draft-storage";

const SAMPLE_VALUES = { type: "multiple_choice", stem: "2+2?" } as unknown as EditorFormValues;

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("exerciseDraftKey", () => {
  it("scopes the key to course, unit and exercise", () => {
    expect(exerciseDraftKey(1, 2, 3)).toBe(
      "bilgin-admin:exercise-draft:1:2:3",
    );
  });

  it("uses a stable placeholder for a not-yet-created exercise", () => {
    expect(exerciseDraftKey(1, 2, undefined)).toBe(
      "bilgin-admin:exercise-draft:1:2:new",
    );
  });
});

describe("saveDraft / loadDraft / clearDraft", () => {
  it("round-trips a saved draft", () => {
    const key = exerciseDraftKey(1, 2, undefined);

    saveDraft(key, SAMPLE_VALUES);
    const loaded = loadDraft(key);

    expect(loaded).not.toBeNull();
    expect(loaded?.values).toEqual(SAMPLE_VALUES);
  });

  it("returns null when nothing was saved", () => {
    expect(loadDraft(exerciseDraftKey(9, 9, undefined))).toBeNull();
  });

  it("clears a saved draft", () => {
    const key = exerciseDraftKey(1, 2, undefined);
    saveDraft(key, SAMPLE_VALUES);

    clearDraft(key);

    expect(loadDraft(key)).toBeNull();
  });

  it("ignores malformed stored JSON", () => {
    const key = exerciseDraftKey(1, 2, undefined);
    window.localStorage.setItem(key, "{not json");

    expect(loadDraft(key)).toBeNull();
  });

  it("treats a draft older than 7 days as stale", () => {
    const key = exerciseDraftKey(1, 2, undefined);
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(
      key,
      JSON.stringify({ savedAt: eightDaysAgo, values: SAMPLE_VALUES }),
    );

    expect(loadDraft(key)).toBeNull();
  });

  it("does not throw when storage is unavailable", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => saveDraft("k", SAMPLE_VALUES)).not.toThrow();
    expect(loadDraft("k")).toBeNull();
    expect(() => clearDraft("k")).not.toThrow();

    vi.restoreAllMocks();
  });
});
