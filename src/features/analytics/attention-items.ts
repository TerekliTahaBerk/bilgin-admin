import type { Course, Unit, UnitExercisesData } from "@/contracts/admin/content";

/**
 * One row in the "Dikkat Gerektirenler" panel: a single thing worth a human
 * look, with a link straight to where it can be fixed. Kept intentionally
 * flat (no severity levels, no counts) — the panel is a punch list, not
 * another chart.
 */
export type AttentionItem = Readonly<{
  id: string;
  message: string;
  href: string;
}>;

/** A course's units, as seen from wherever the admin last opened that course. */
export type CourseUnitsEntry = Readonly<{
  courseId: number;
  units: readonly Unit[];
}>;

/** One unit's exercise list, as seen from wherever the admin last opened it. */
export type UnitExercisesEntry = Readonly<{
  courseId: number;
  data: UnitExercisesData;
}>;

/**
 * Courses with no units yet. Mirrors `isAwaitingContent` from
 * `courses-summary.ts` (same rule, "İçerik bekliyor"), surfaced here as a
 * linkable row instead of an inline badge.
 */
export function coursesAwaitingContent(
  courses: readonly Course[],
): AttentionItem[] {
  return courses
    .filter((course) => course.unit_count === 0)
    .map((course) => ({
      id: `course-${course.id}`,
      message: `${course.name}: henüz ünite eklenmemiş.`,
      href: `/courses/${course.id}`,
    }));
}

/**
 * Units with no exercises yet, across every course the admin has opened this
 * session. Mirrors `isAwaitingExercises` from `units-summary.ts`.
 */
export function unitsAwaitingExercises(
  entries: readonly CourseUnitsEntry[],
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const { courseId, units } of entries) {
    for (const unit of units) {
      if (unit.exercise_count === 0) {
        items.push({
          id: `unit-${unit.id}`,
          message: `${unit.title}: henüz soru eklenmemiş.`,
          href: `/courses/${courseId}/units/${unit.id}`,
        });
      }
    }
  }

  return items;
}

/**
 * Exercises flagged `needs_review` (20+ attempts at a >95% or <10% correct
 * rate — see the exercise browser), across every unit exercise list the
 * admin has opened this session. This is the same signal the per-unit
 * browser already highlights; this just collects it across units so it does
 * not require opening each one to notice.
 */
export function exercisesNeedingReview(
  entries: readonly UnitExercisesEntry[],
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const { courseId, data } of entries) {
    for (const exercise of data.exercises) {
      if (exercise.stats.needs_review) {
        items.push({
          id: `exercise-${exercise.id}`,
          message: `${data.unit.title} · ${exercise.preview || "(önizleme yok)"}`,
          href: `/courses/${courseId}/units/${data.unit.id}`,
        });
      }
    }
  }

  return items;
}
