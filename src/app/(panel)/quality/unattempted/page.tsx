import Link from "next/link";
import { Suspense } from "react";

import { UnattemptedPage } from "@/features/analytics/unattempted-page";
import { can } from "@/lib/authz/abilities";
import { requireCurrentAdmin } from "@/lib/session/current";

export default async function UnattemptedRoutePage() {
  const admin = await requireCurrentAdmin();

  return (
    <section aria-labelledby="page-title">
      <header className="border-b border-border pb-5">
        <Link
          className="text-sm font-medium text-muted transition-colors hover:text-foreground"
          href="/quality"
        >
          ‹ Soru Kalite Merkezi
        </Link>
        <h1
          className="mt-2 text-xl font-semibold tracking-tight"
          id="page-title"
        >
          Hiç Çözülmemiş Sorular
        </h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted">
          Deneme sayısı 0 olan sorular. Bu bir hata değil, kullanım verisi
          olmadığı anlamına gelir; özellikle yayında olup hiç çözülmemiş
          sorulara bakmak için kullanın.
        </p>
      </header>

      <div className="mt-6">
        <Suspense fallback={null}>
          <UnattemptedPage canEdit={can(admin, "edit_content")} />
        </Suspense>
      </div>
    </section>
  );
}
