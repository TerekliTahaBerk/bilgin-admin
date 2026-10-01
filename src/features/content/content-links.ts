import type { ExerciseType } from "@/contracts/admin/content";
import { isSupportedEditorType } from "@/contracts/admin/exercise-editor";

export function courseHref(courseId: number): string {
  return `/courses/${courseId}`;
}

export function unitHref(courseId: number, unitId: number): string {
  return `${courseHref(courseId)}/units/${unitId}`;
}

/**
 * Where a question opens: the editor for an admin who can edit a type the
 * editor supports, otherwise the unit's question list — the read-only view
 * (the editor itself only shows "no access" to a read-only admin).
 */
export function exerciseHref(
  target: Readonly<{
    courseId: number;
    unitId: number;
    exerciseId: number;
    type: ExerciseType;
  }>,
  canEdit: boolean,
): string {
  return canEdit && isSupportedEditorType(target.type)
    ? `${unitHref(target.courseId, target.unitId)}/exercises/${target.exerciseId}`
    : unitHref(target.courseId, target.unitId);
}
