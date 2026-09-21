import { AnalyticsDashboard } from "@/features/analytics/analytics-dashboard";
import { requireCurrentAdmin } from "@/lib/session/current";

export default async function AnalyticsPage() {
  const admin = await requireCurrentAdmin();

  return (
    <section aria-labelledby="page-title">
      <header className="border-b border-border pb-5">
        <h1 className="text-xl font-semibold tracking-tight" id="page-title">
          Veri Paneli
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Ders kataloğunun ve yönetici kadrosunun anlık dağılımı.
        </p>
      </header>

      <div className="mt-6">
        <AnalyticsDashboard admin={admin} />
      </div>
    </section>
  );
}
