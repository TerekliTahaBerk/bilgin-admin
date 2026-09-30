import type {
  Course,
  ExerciseListItem,
  Unit,
  UnitExercisesData,
} from "@/contracts/admin/content";
import type { QualityRow } from "@/features/analytics/quality-dataset";

type ExerciseOverrides = Partial<Omit<ExerciseListItem, "stats">> & {
  stats?: Partial<ExerciseListItem["stats"]>;
};

/** One exercise list item in the backend's exact shape. */
export function qualityExercise(
  id: number,
  overrides: ExerciseOverrides = {},
): ExerciseListItem {
  const { stats, ...rest } = overrides;

  return {
    id,
    type: "multiple_choice",
    topic: { id: 1, name: "İlk Türk Devletleri" },
    difficulty: 3,
    status: "published",
    version: 1,
    scopes: ["tyt"],
    preview: `Soru ${id}`,
    ...rest,
    stats: {
      attempts: 0,
      correct_rate: null,
      avg_seconds: null,
      needs_review: false,
      ...stats,
    },
  };
}

export function qualityRow(
  id: number,
  overrides: ExerciseOverrides & {
    course?: QualityRow["course"];
    unit?: QualityRow["unit"];
  } = {},
): QualityRow {
  const { course, unit, ...exercise } = overrides;

  return {
    ...qualityExercise(id, exercise),
    course: course ?? { id: 1, name: "TYT Tarih" },
    unit: unit ?? { id: 10, title: "İlk Türk Devletleri" },
  };
}

export function qualityCourse(
  id: number,
  overrides: Partial<Course> = {},
): Course {
  return {
    id,
    code: `course_${id}`,
    name: `Ders ${id}`,
    scope: "tyt",
    status: "published",
    unit_count: 1,
    ...overrides,
  };
}

export function qualityUnit(id: number, overrides: Partial<Unit> = {}): Unit {
  return {
    id,
    title: `Ünite ${id}`,
    sort_order: 1,
    grade_level: null,
    status: "published",
    access: "free",
    node_count: 1,
    exercise_count: 1,
    ...overrides,
  };
}

export function qualityUnitExercises(
  unitId: number,
  exercises: ExerciseListItem[],
  title = `Ünite ${unitId}`,
): UnitExercisesData {
  return { unit: { id: unitId, title }, exercises };
}
