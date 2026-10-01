import { Suspense } from "react";

import { AnalyticsSubnav } from "@/features/analytics/analytics-subnav";
import { QuestionPerformancePage } from "@/features/analytics/question-performance-page";
import { can } from "@/lib/authz/abilities";
import { requireCurrentAdmin } from "@/lib/session/current";

export default async function QuestionPerformanceRoutePage() {
  const admin = await requireCurrentAdmin();

  return (
    <section aria-labelledby="page-title">
      <header className="border-b border-border pb-5">
        <h1 className="text-xl font-semibold tracking-tight" id="page-title">
          Veri Paneli
        </h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted">
          Soru performansı: tam taramadaki deneme, doğru oranı ve süre
          istatistiklerinin zorluk, tür, konu ve kapsama göre dağılımı.
        </p>
        <AnalyticsSubnav current="questions" />
      </header>

      <div className="mt-6">
        <Suspense fallback={null}>
          <QuestionPerformancePage canEdit={can(admin, "edit_content")} />
        </Suspense>
      </div>
    </section>
  );
}
