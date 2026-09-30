import { Suspense } from "react";

import { QualityPage } from "@/features/analytics/quality-page";
import { can } from "@/lib/authz/abilities";
import { requireCurrentAdmin } from "@/lib/session/current";

export default async function QualityRoutePage() {
  const admin = await requireCurrentAdmin();

  return (
    <section aria-labelledby="page-title">
      <header className="border-b border-border pb-5">
        <h1 className="text-xl font-semibold tracking-tight" id="page-title">
          Soru Kalite Merkezi
        </h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted">
          Deneme sayısı, doğru oranı, çözüm süresi ve sunucunun inceleme
          işaretine göre sorunlu soruları bulun ve doğrudan düzenleyin.
        </p>
      </header>

      <div className="mt-6">
        <Suspense fallback={null}>
          <QualityPage canEdit={can(admin, "edit_content")} />
        </Suspense>
      </div>
    </section>
  );
}
