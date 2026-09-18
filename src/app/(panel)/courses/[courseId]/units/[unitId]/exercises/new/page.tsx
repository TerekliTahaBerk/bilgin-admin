import { notFound } from "next/navigation";

import { isSupportedEditorType } from "@/contracts/admin/exercise-editor";
import {
  EditorAccessDenied,
  EditorUnsupportedType,
  ExerciseEditor,
} from "@/features/content/exercise-editor";
import { can } from "@/lib/authz/abilities";
import { parseResourceId } from "@/lib/api/resource-id";
import { requireCurrentAdmin } from "@/lib/session/current";

/**
 * The create route carries the editor type as a safe enum and nothing else —
 * never question content. An absent type keeps the original multiple choice
 * behaviour; an unknown or repeated one renders the unsupported state instead
 * of an editable form, so no mutation surface is exposed.
 */
export default async function NewExercisePage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string; unitId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { courseId: rawCourseId, unitId: rawUnitId } = await params;
  const courseId = parseResourceId(rawCourseId);
  const unitId = parseResourceId(rawUnitId);
  if (courseId === null || unitId === null) notFound();

  const admin = await requireCurrentAdmin();
  const canEdit = can(admin, "edit_content");
  const requestedType = (await searchParams).type;

  if (requestedType !== undefined) {
    if (
      typeof requestedType !== "string" ||
      !isSupportedEditorType(requestedType)
    ) {
      return canEdit ? <EditorUnsupportedType /> : <EditorAccessDenied />;
    }

    return (
      <ExerciseEditor
        canEdit={canEdit}
        courseId={courseId}
        createType={requestedType}
        unitId={unitId}
      />
    );
  }

  return (
    <ExerciseEditor canEdit={canEdit} courseId={courseId} unitId={unitId} />
  );
}
