import { notFound } from "next/navigation";

import { ExerciseClonePage } from "@/features/content/exercise-clone-page";
import { can } from "@/lib/authz/abilities";
import { parseResourceId } from "@/lib/api/resource-id";
import { requireCurrentAdmin } from "@/lib/session/current";

export default async function CloneExercisePage({
  params,
}: {
  params: Promise<{ courseId: string; unitId: string; exerciseId: string }>;
}) {
  const values = await params;
  const courseId = parseResourceId(values.courseId);
  const unitId = parseResourceId(values.unitId);
  const exerciseId = parseResourceId(values.exerciseId);
  if (courseId === null || unitId === null || exerciseId === null) notFound();

  const admin = await requireCurrentAdmin();

  return (
    <ExerciseClonePage
      canEdit={can(admin, "edit_content")}
      courseId={courseId}
      exerciseId={exerciseId}
      unitId={unitId}
    />
  );
}
