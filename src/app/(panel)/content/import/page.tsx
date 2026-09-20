import { ContentImport } from "@/features/workflows/content-import";
import { can } from "@/lib/authz/abilities";
import { requireCurrentAdmin } from "@/lib/session/current";

export default async function ContentImportPage() {
  const admin = await requireCurrentAdmin();
  if (!can(admin, "edit_content"))
    return (
      <div role="alert">
        <h1 className="text-xl font-semibold">Bu bölüme erişim yetkiniz yok</h1>
      </div>
    );
  return <ContentImport />;
}
