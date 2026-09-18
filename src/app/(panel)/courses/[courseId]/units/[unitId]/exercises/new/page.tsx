import { notFound } from "next/navigation";

import { ExerciseEditor } from "@/features/content/exercise-editor";
import { can } from "@/lib/authz/abilities";
import { parseResourceId } from "@/lib/api/resource-id";
import { requireCurrentAdmin } from "@/lib/session/current";

export default async function NewExercisePage({
  params,
}: {
  params: Promise<{ courseId: string; unitId: string }>;
}) {
  const { courseId: rawCourseId, unitId: rawUnitId } = await params;
  const courseId = parseResourceId(rawCourseId);
  const unitId = parseResourceId(rawUnitId);
  if (courseId === null || unitId === null) notFound();

  const admin = await requireCurrentAdmin();

  return (
    <ExerciseEditor
      canEdit={can(admin, "edit_content")}
      courseId={courseId}
      unitId={unitId}
    />
  );
}
