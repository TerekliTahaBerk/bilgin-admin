/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  clearRecentExercises,
  listRecentExercises,
  recordExerciseEdit,
  type RecentExerciseEntry,
} from "@/features/content/exercise-history";

function entry(overrides: Partial<RecentExerciseEntry> = {}): RecentExerciseEntry {
  return {
    exerciseId: 1,
    courseId: 10,
    unitId: 20,
    label: "Örnek soru",
    editedAt: Date.now(),
    ...overrides,
  };
}

afterEach(() => {
  window.sessionStorage.clear();
});

describe("recordExerciseEdit / listRecentExercises", () => {
  it("starts empty", () => {
    expect(listRecentExercises()).toEqual([]);
  });

  it("records an edit as the newest entry", () => {
    recordExerciseEdit(entry({ exerciseId: 1 }));
    recordExerciseEdit(entry({ exerciseId: 2 }));

    const list = listRecentExercises();
    expect(list.map((e) => e.exerciseId)).toEqual([2, 1]);
  });

  it("moves a re-edited exercise back to the front without duplicating it", () => {
    recordExerciseEdit(entry({ exerciseId: 1, label: "İlk" }));
    recordExerciseEdit(entry({ exerciseId: 2 }));
    recordExerciseEdit(entry({ exerciseId: 1, label: "Güncellendi" }));

    const list = listRecentExercises();
    expect(list).toHaveLength(2);
    expect(list[0]?.label).toBe("Güncellendi");
  });

  it("keeps only the 10 most recent entries", () => {
    for (let i = 0; i < 15; i += 1) {
      recordExerciseEdit(entry({ exerciseId: i }));
    }

    expect(listRecentExercises()).toHaveLength(10);
    expect(listRecentExercises()[0]?.exerciseId).toBe(14);
  });

  it("ignores malformed stored JSON", () => {
    window.sessionStorage.setItem("bilgin-admin:recent-exercises", "{not json");

    expect(listRecentExercises()).toEqual([]);
  });

  it("clears the history", () => {
    recordExerciseEdit(entry());
    clearRecentExercises();

    expect(listRecentExercises()).toEqual([]);
  });
});
