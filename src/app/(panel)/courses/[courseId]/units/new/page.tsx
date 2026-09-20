import { notFound } from "next/navigation";
import { UnitCreateForm } from "@/features/workflows/unit-create-form";
import { can } from "@/lib/authz/abilities";
import { parseResourceId } from "@/lib/api/resource-id";
import { requireCurrentAdmin } from "@/lib/session/current";

export default async function NewUnitPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const courseId = parseResourceId((await params).courseId);
  if (courseId === null) notFound();
  const admin = await requireCurrentAdmin();
  if (!can(admin, "edit_content"))
    return (
      <div role="alert">
        <h1 className="text-xl font-semibold">Bu bölüme erişim yetkiniz yok</h1>
      </div>
    );
  return <UnitCreateForm courseId={courseId} />;
}
