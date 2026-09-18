import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ExercisesPage } from "@/features/content/exercises-page";
import { parseResourceId } from "@/lib/api/resource-id";

export default async function UnitExercisesPage({
  params,
}: {
  params: Promise<{ courseId: string; unitId: string }>;
}) {
  const { courseId: rawCourseId, unitId: rawUnitId } = await params;
  const courseId = parseResourceId(rawCourseId);
  const unitId = parseResourceId(rawUnitId);

  // Fail closed: a non-numeric route param never reaches a client query.
  if (courseId === null || unitId === null) {
    notFound();
  }

  return (
    <section>
      <Suspense fallback={null}>
        <ExercisesPage courseId={courseId} unitId={unitId} />
      </Suspense>
    </section>
  );
}
