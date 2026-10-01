"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { CoverageCenter } from "@/features/analytics/coverage-center";
import {
  parseCoverageState,
  serializeCoverageState,
  type CoverageState,
} from "@/features/analytics/coverage-model";

/**
 * Course, view, filters, search, sort and mode live in the URL, so a view
 * such as "AYT Fizik, only empty topics, 11th grade" is a shareable link.
 */
export function CoveragePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentQuery = searchParams.toString();

  const state = useMemo(
    () => parseCoverageState(new URLSearchParams(currentQuery)),
    [currentQuery],
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
    (next: CoverageState) => {
      const query = serializeCoverageState(next);

      if (query === (pendingQuery.current ?? currentQuery)) return;

      pendingQuery.current = query;
      router.replace(query.length === 0 ? pathname : `${pathname}?${query}`, {
        scroll: false,
      });
    },
    [currentQuery, pathname, router],
  );

  return <CoverageCenter onChange={change} state={state} />;
}
