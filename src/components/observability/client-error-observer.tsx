"use client";

import { useEffect } from "react";

import { reportError } from "@/lib/observability/report-error";

/**
 * Catches what a React error boundary cannot: an exception thrown from an
 * event handler or a timer, and a promise that rejects with nobody awaiting
 * it. Mounted once in the root layout, for every route (`/login` included) —
 * before this, either kind failed completely silently.
 */
export function ClientErrorObserver() {
  useEffect(() => {
    function handleError(event: ErrorEvent) {
      reportError(event.error ?? event.message, "window-error");
    }

    function handleRejection(event: PromiseRejectionEvent) {
      reportError(event.reason, "unhandled-rejection");
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
