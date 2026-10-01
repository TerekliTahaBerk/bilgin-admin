import { AdminManager } from "@/features/workflows/admin-manager";
import { AdminsSubnav } from "@/features/workflows/admins-subnav";
import { can } from "@/lib/authz/abilities";
import { requireCurrentAdmin } from "@/lib/session/current";

export default async function AdminsPage() {
  const admin = await requireCurrentAdmin();
  if (!can(admin, "edit_curriculum"))
    return (
      <div role="alert">
        <h1 className="text-xl font-semibold">Bu bölüme erişim yetkiniz yok</h1>
      </div>
    );
  return (
    <>
      <AdminsSubnav current="accounts" />
      <AdminManager currentAdmin={admin} />
    </>
  );
}
