import { Suspense } from "react";

import { PublishingPage } from "@/features/content/publishing-page";
import { can } from "@/lib/authz/abilities";
import { requireCurrentAdmin } from "@/lib/session/current";

export default async function PublishingRoutePage() {
  const admin = await requireCurrentAdmin();

  return (
    <section aria-labelledby="page-title">
      <header className="border-b border-border pb-5">
        <h1 className="text-xl font-semibold tracking-tight" id="page-title">
          Yayın Merkezi
        </h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted">
          Tüm ünitelerin yayın hazırlığını tek yerden izleyin. Hazırlık,
          sunucunun her adım için yaptığı kural kontrolünden gelir; yayın
          sırasında sunucu aynı kontrolü yeniden yapar.
        </p>
      </header>

      <div className="mt-6">
        <Suspense fallback={null}>
          <PublishingPage canPublish={can(admin, "publish_content")} />
        </Suspense>
      </div>
    </section>
  );
}
