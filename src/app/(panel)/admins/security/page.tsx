import { AdminSecurityCenter } from "@/features/workflows/admin-security-center";
import { AdminsSubnav } from "@/features/workflows/admins-subnav";
import { can } from "@/lib/authz/abilities";
import { requireCurrentAdmin } from "@/lib/session/current";

export default async function AdminSecurityPage() {
  const admin = await requireCurrentAdmin();
  // The admin list endpoint is behind the backend's `curriculum` ability
  // (the super admin's); the screen follows the same gate as /admins.
  if (!can(admin, "edit_curriculum"))
    return (
      <div role="alert">
        <h1 className="text-xl font-semibold">Bu bölüme erişim yetkiniz yok</h1>
      </div>
    );

  return (
    <section aria-labelledby="page-title">
      <AdminsSubnav current="security" />
      <header className="border-b border-border pb-5">
        <h1 className="text-xl font-semibold tracking-tight" id="page-title">
          Yönetici güvenliği
        </h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted">
          Hesap durumları, son girişler ve yetki dağılımı. Değişiklikler
          Hesaplar sekmesinden yapılır; backend&apos;in kilitlenme kuralları
          orada önceden uygulanır.
        </p>
      </header>
      <div className="mt-6">
        <AdminSecurityCenter />
      </div>
    </section>
  );
}
