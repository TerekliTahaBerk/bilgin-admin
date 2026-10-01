import type { CourseTopicsData } from "@/contracts/admin/exercise-editor";
import type { ContentScanFailure } from "@/features/content/content-scan";
import type {
  ContentSnapshot,
  SnapshotExercise,
  SnapshotUnit,
} from "@/features/content/content-snapshot";
import {
  qualityCourse,
  qualityExercise,
  qualityUnit,
} from "@/test/fixtures/quality";

type ExerciseOverrides = Parameters<typeof qualityExercise>[1];

export function snapshotUnit(
  id: number,
  courseId: number,
  overrides: Parameters<typeof qualityUnit>[1] = {},
): SnapshotUnit {
  return { ...qualityUnit(id, overrides), courseId };
}

export function snapshotExercise(
  id: number,
  courseId: number,
  unitId: number,
  overrides: ExerciseOverrides = {},
): SnapshotExercise {
  return { ...qualityExercise(id, overrides), courseId, unitId };
}

/** A small catalogue with one of every problem the health screen looks for. */
export function healthSnapshot(
  errors: ContentScanFailure[] = [],
): ContentSnapshot {
  return {
    generatedAt: "2026-10-01T09:00:00.000Z",
    status: errors.length === 0 ? "complete" : "partial",
    courses: [
      qualityCourse(1, {
        name: "TYT Tarih",
        status: "published",
        unit_count: 3,
      }),
      qualityCourse(2, { name: "AYT Fizik", status: "draft", unit_count: 0 }),
    ],
    units: [
      snapshotUnit(10, 1, {
        title: "İlk Çağ",
        status: "published",
        exercise_count: 12,
        node_count: 4,
      }),
      snapshotUnit(11, 1, {
        title: "Zaman",
        status: "draft",
        exercise_count: 0,
        node_count: 2,
      }),
      snapshotUnit(12, 1, {
        title: "Takvim",
        status: "review",
        exercise_count: 3,
        node_count: 0,
      }),
    ],
    exercises: [
      snapshotExercise(100, 1, 10, {
        preview: "Orhun Yazıtları",
        type: "multiple_choice",
        difficulty: 1,
        status: "published",
        scopes: ["tyt", "ayt"],
      }),
      snapshotExercise(101, 1, 10, {
        preview: "Uygurlar",
        type: "true_false",
        difficulty: 3,
        status: "published",
        version: 2,
        scopes: ["tyt"],
        stats: { attempts: 30, correct_rate: 97, needs_review: true },
      }),
      snapshotExercise(120, 1, 12, {
        preview: "  ",
        type: "image_hotspot",
        difficulty: 5,
        status: "draft",
        scopes: [],
        stats: { attempts: 4, correct_rate: 50 },
      }),
    ],
    errors,
  };
}

export function topicList(
  courseId: number,
  subjectId: number,
  counts: Record<number, number>,
  courseName = `Ders ${courseId}`,
): CourseTopicsData {
  return {
    course: { id: courseId, name: courseName },
    subject_id: subjectId,
    topics: Object.entries(counts).map(([id, exercise_count]) => ({
      id: Number(id),
      code: `topic_${id}`,
      name: `Konu ${id}`,
      exercise_count,
    })),
  };
}
