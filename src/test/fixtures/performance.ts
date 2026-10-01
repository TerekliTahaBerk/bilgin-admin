import type { ContentSnapshot } from "@/features/content/content-snapshot";
import { snapshotExercise, snapshotUnit } from "@/test/fixtures/health";
import { qualityCourse } from "@/test/fixtures/quality";

/**
 * A scanned catalogue with known stats, so every aggregate has a hand-checked
 * answer:
 *
 * | id  | course | type | diff | status    | scopes   | attempts | rate | sec  |
 * | 100 | 1      | MC   | 1    | published | tyt      | 100      | 90   | 20   |
 * | 101 | 1      | MC   | 1    | published | tyt, ayt | 10       | 50   | 40   |
 * | 102 | 1      | TF   | 3    | draft     | tyt      | 30       | 20   | null |
 * | 103 | 1      | MC   | 3    | published | —        | 0        | null | null |
 * | 104 | 2      | FB   | 5    | review    | ayt      | 3        | 0    | 90   |
 */
export function performanceSnapshot(): ContentSnapshot {
  return {
    generatedAt: "2026-10-01T09:00:00.000Z",
    status: "complete",
    courses: [
      qualityCourse(1, { name: "TYT Tarih" }),
      qualityCourse(2, { name: "AYT Tarih" }),
    ],
    units: [
      snapshotUnit(10, 1, { title: "İlk Çağ" }),
      snapshotUnit(20, 2, { title: "Osmanlı" }),
    ],
    exercises: [
      snapshotExercise(100, 1, 10, {
        difficulty: 1,
        topic: { id: 1, name: "İlk Çağ" },
        preview: "Kolay soru",
        stats: { attempts: 100, correct_rate: 90, avg_seconds: 20 },
      }),
      snapshotExercise(101, 1, 10, {
        difficulty: 1,
        scopes: ["tyt", "ayt"],
        topic: { id: 1, name: "İlk Çağ" },
        preview: "Orta soru",
        stats: { attempts: 10, correct_rate: 50, avg_seconds: 40 },
      }),
      snapshotExercise(102, 1, 10, {
        type: "true_false",
        status: "draft",
        topic: { id: 2, name: "Hunlar" },
        preview: "Zor soru",
        stats: { attempts: 30, correct_rate: 20, avg_seconds: null },
      }),
      snapshotExercise(103, 1, 10, {
        scopes: [],
        topic: { id: 2, name: "Hunlar" },
        preview: "Çözülmemiş soru",
      }),
      snapshotExercise(104, 2, 20, {
        type: "fill_blank",
        difficulty: 5,
        status: "review",
        scopes: ["ayt"],
        topic: { id: 3, name: "Kuruluş" },
        preview: "Yavaş soru",
        stats: { attempts: 3, correct_rate: 0, avg_seconds: 90 },
      }),
    ],
    errors: [],
  };
}
