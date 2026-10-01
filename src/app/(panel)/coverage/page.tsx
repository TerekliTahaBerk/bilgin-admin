import { Suspense } from "react";

import { CoveragePage } from "@/features/analytics/coverage-page";
import { requireCurrentAdmin } from "@/lib/session/current";

export default async function CoverageRoutePage() {
  await requireCurrentAdmin();

  return (
    <section aria-labelledby="page-title">
      <header className="border-b border-border pb-5">
        <h1 className="text-xl font-semibold tracking-tight" id="page-title">
          İçerik Kapsama Analizi
        </h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted">
          Hangi ders ve konularda içeriğin az olduğunu veya hiç olmadığını konu
          konu gösterir.
        </p>
      </header>

      <div className="mt-6">
        <Suspense fallback={null}>
          <CoveragePage />
        </Suspense>
      </div>
    </section>
  );
}
