import type { ApiError } from "@/lib/api/error";

export const QUERY_MAX_RETRIES = 1;

const NON_RETRYABLE_KINDS = new Set<ApiError["kind"]>([
  "authentication",
  "authorization",
  "validation",
  "not_found",
  // A rate limit is the one thing an automatic retry makes strictly worse.
  "rate_limit",
  "contract",
  "protocol",
]);

function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { kind?: unknown }).kind === "string"
  );
}

/**
 * Retry only failures a second attempt can plausibly fix. Every 4xx is the
 * server's considered answer, so retrying it just doubles the load, and an
 * error shape we do not recognise is not retried either.
 */
export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
): boolean {
  if (!isApiError(error) || NON_RETRYABLE_KINDS.has(error.kind)) {
    return false;
  }

  return failureCount < QUERY_MAX_RETRIES;
}
