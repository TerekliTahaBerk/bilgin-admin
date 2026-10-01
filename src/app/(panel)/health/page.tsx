import { HealthCenter } from "@/features/analytics/health-center";
import { can } from "@/lib/authz/abilities";
import { requireCurrentAdmin } from "@/lib/session/current";

export default async function HealthPage() {
  const admin = await requireCurrentAdmin();

  return (
    <section aria-labelledby="page-title">
      <header className="border-b border-border pb-5">
        <h1 className="text-xl font-semibold tracking-tight" id="page-title">
          İçerik Sağlığı Merkezi
        </h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted">
          Tam içerik taramasına göre kataloğun eksiklerini ve inceleme
          gerektiren içeriği listeler; her problem düzeltileceği sayfaya
          bağlanır.
        </p>
      </header>

      <div className="mt-6">
        <HealthCenter canEdit={can(admin, "edit_content")} />
      </div>
    </section>
  );
}
