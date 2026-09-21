import { DashboardOverview } from "@/features/content/dashboard-overview";
import { requireCurrentAdmin } from "@/lib/session/current";

export default async function PanelHomePage() {
  const admin = await requireCurrentAdmin();

  return (
    <section aria-labelledby="page-title">
      <header className="border-b border-border pb-5">
        <h1 className="text-xl font-semibold tracking-tight" id="page-title">
          Ana Sayfa
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          {admin.name}, Bilgin yönetim paneline hoş geldin.
        </p>
      </header>

      <div className="mt-6">
        <DashboardOverview admin={admin} />
      </div>
    </section>
  );
}
