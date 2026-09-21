/**
 * Provider-agnostic error sink.
 *
 * Every unhandled failure — a render crash an error boundary catches, a
 * browser-level `error` or `unhandledrejection` event — funnels through
 * here instead of disappearing silently. Today this only logs a structured
 * line the deployment's own log collector (a platform's function logs, a
 * container's stdout driver, …) can already pick up with no extra setup.
 *
 * Wiring a real APM (Sentry or similar) later means changing this one
 * function, not every call site: set `NEXT_PUBLIC_ERROR_REPORTING_URL` to a
 * collector endpoint and every report is also POSTed there, best-effort.
 */

export type ErrorReport = Readonly<{
  message: string;
  stack?: string;
  digest?: string;
  context: string;
  url: string;
  userAgent: string;
  timestamp: string;
}>;

function normalize(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: "Bilinmeyen hata" };
  }
}

export function reportError(
  error: unknown,
  context: string,
  extra?: Readonly<{ digest?: string }>,
): void {
  const { message, stack } = normalize(error);
  const hasWindow = typeof window !== "undefined";

  const report: ErrorReport = {
    message,
    stack,
    digest: extra?.digest,
    context,
    url: hasWindow ? window.location.href : "",
    userAgent: hasWindow ? window.navigator.userAgent : "",
    timestamp: new Date().toISOString(),
  };

  // Always-on sink: visible in the browser console during development and
  // captured by the deployment's own log collector in production.
  console.error("[bilgin-admin] unhandled error", report);

  const endpoint = process.env.NEXT_PUBLIC_ERROR_REPORTING_URL;

  if (endpoint === undefined || endpoint === "" || !hasWindow) {
    return;
  }

  // Best-effort, fire-and-forget: a broken reporting endpoint must never be
  // the reason a user sees a second error. `keepalive` lets the request
  // outlive a navigation the error itself may be about to trigger.
  void fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
    keepalive: true,
  }).catch(() => {
    // Nothing to do: this sink must never throw into the caller.
  });
}
