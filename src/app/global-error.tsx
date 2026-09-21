"use client";

import { useEffect } from "react";

import { reportError } from "@/lib/observability/report-error";

/**
 * Catches a crash in the root layout itself — rare, but the alternative is a
 * blank white screen with nothing reported anywhere. This replaces the whole
 * document, so it renders its own <html>/<body> and uses inline styles: the
 * failure that lands here may have happened before the app's stylesheet
 * loaded.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, "global-error-boundary", { digest: error.digest });
  }, [error]);

  return (
    <html lang="tr">
      <body>
        <div
          role="alert"
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.75rem",
            padding: "1.5rem",
            textAlign: "center",
            fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          }}
        >
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600 }}>
            Bir şeyler ters gitti
          </h1>
          <p
            style={{
              maxWidth: "32rem",
              fontSize: "0.875rem",
              color: "#6b7280",
            }}
          >
            Uygulama beklenmeyen bir hatayla karşılaştı. Sayfayı yenilemeyi
            deneyin.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "0.5rem",
              borderRadius: "0.375rem",
              border: "1px solid #d1d5db",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              background: "white",
              cursor: "pointer",
            }}
            type="button"
          >
            Tekrar dene
          </button>
        </div>
      </body>
    </html>
  );
}
