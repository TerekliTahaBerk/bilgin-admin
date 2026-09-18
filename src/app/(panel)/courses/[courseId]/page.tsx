import { notFound } from "next/navigation";

import { UnitsBrowser } from "@/features/content/units-browser";
import { parseResourceId } from "@/lib/api/resource-id";

export default async function CourseUnitsPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const courseId = parseResourceId((await params).courseId);

  // Fail closed: a non-numeric route param never reaches a client query.
  if (courseId === null) {
    notFound();
  }

  return (
    <section>
      <UnitsBrowser courseId={courseId} />
    </section>
  );
}
