import { CurriculumManager } from "@/features/workflows/curriculum-manager";
import { can } from "@/lib/authz/abilities";
import { requireCurrentAdmin } from "@/lib/session/current";

export default async function CurriculumPage() {
  const admin = await requireCurrentAdmin();
  if (!can(admin, "edit_curriculum"))
    return (
      <div role="alert">
        <h1 className="text-xl font-semibold">Bu bölüme erişim yetkiniz yok</h1>
      </div>
    );
  return <CurriculumManager />;
}
