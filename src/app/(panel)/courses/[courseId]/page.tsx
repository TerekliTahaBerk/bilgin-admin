import { notFound } from "next/navigation";

import { UnitsBrowser } from "@/features/content/units-browser";
import { can } from "@/lib/authz/abilities";
import { parseResourceId } from "@/lib/api/resource-id";
import { requireCurrentAdmin } from "@/lib/session/current";

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

  const admin = await requireCurrentAdmin();
  return (
    <section>
      <UnitsBrowser canEdit={can(admin, "edit_content")} courseId={courseId} />
    </section>
  );
}
