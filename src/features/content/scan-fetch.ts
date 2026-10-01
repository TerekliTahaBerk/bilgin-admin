import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * `fetchQuery` that an `AbortSignal` can cancel. The query cache owns the
 * request (so the result lands under the shared key and an identical
 * in-flight request is reused); aborting cancels that query, which aborts its
 * `fetch` through the signal every content query function forwards.
 *
 * `staleTime` decides whether a cached answer is good enough: the browsers'
 * stale time reuses fresh entries, `0` always asks the backend again.
 */
export function fetchWithAbort<Data>(
  queryClient: QueryClient,
  options: {
    queryKey: QueryKey;
    queryFn: (context: { signal: AbortSignal }) => Promise<Data>;
  },
  staleTime: number,
  signal: AbortSignal,
): Promise<Data> {
  const cancel = () => {
    void queryClient.cancelQueries({ queryKey: options.queryKey, exact: true });
  };

  signal.addEventListener("abort", cancel, { once: true });

  return queryClient
    .fetchQuery({ ...options, staleTime })
    .finally(() => signal.removeEventListener("abort", cancel));
}
