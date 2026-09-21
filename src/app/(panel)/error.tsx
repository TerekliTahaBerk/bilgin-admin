"use client";

import { useEffect } from "react";

import { reportError } from "@/lib/observability/report-error";

/**
 * Wraps every route under the panel layout, so a crash in one screen leaves
 * the sidebar, topbar and command palette usable — only the broken page area
 * is replaced. `global-error.tsx` is the fallback for a crash above this
 * boundary (the root layout itself).
 */
export default function PanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, "panel-error-boundary", { digest: error.digest });
  }, [error]);

  return (
    <div
      className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center"
      role="alert"
    >
      <h1 className="text-lg font-semibold">Bir şeyler ters gitti</h1>
      <p className="max-w-prose text-sm text-muted">
        Beklenmeyen bir hata oluştu. Sorun devam ederse ekran görüntüsüyle
        birlikte bildirin.
      </p>
      <button
        className="mt-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-muted"
        onClick={reset}
        type="button"
      >
        Tekrar dene
      </button>
    </div>
  );
}
