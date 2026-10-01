"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";

/**
 * A screen's view state kept in the URL, so a view is a shareable link that
 * survives a reload. `parse` must accept any query (unknown values fall back
 * to defaults); `serialize` returns "" for the default view, which then uses
 * the bare path. Both must be stable (module-level functions).
 */
export function useUrlViewState<T>(
  parse: (params: URLSearchParams) => T,
  serialize: (state: T) => string,
): readonly [T, (next: T) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentQuery = searchParams.toString();

  const state = useMemo(
    () => parse(new URLSearchParams(currentQuery)),
    [currentQuery, parse],
  );

  /*
   * `router.replace` does not update the search params before it returns, so
   * two quick changes would both start from the old URL. The query last asked
   * for is held until the URL catches up (same approach as the unit browser).
   */
  const pendingQuery = useRef<string | null>(null);

  useEffect(() => {
    pendingQuery.current = null;
  }, [currentQuery]);

  const change = useCallback(
    (next: T) => {
      const query = serialize(next);

      if (query === (pendingQuery.current ?? currentQuery)) return;

      pendingQuery.current = query;
      router.replace(query.length === 0 ? pathname : `${pathname}?${query}`, {
        scroll: false,
      });
    },
    [currentQuery, pathname, router, serialize],
  );

  return [state, change] as const;
}
