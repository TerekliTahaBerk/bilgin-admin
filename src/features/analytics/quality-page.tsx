"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { QualityCenter } from "@/features/analytics/quality-center";
import {
  parseQualityState,
  serializeQualityState,
  type QualityViewState,
} from "@/features/analytics/quality-filters";

/**
 * The whole view — scope, filters and sort — lives in the URL, so a view such
 * as "AYT Fizik, inceleme gerekli, en çok denenen" is a link an editor can
 * share, and it survives a reload or a round trip to the editor.
 */
export function QualityPage({ canEdit }: { canEdit: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentQuery = searchParams.toString();

  const state = useMemo(
    () => parseQualityState(new URLSearchParams(currentQuery)),
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
    (next: QualityViewState) => {
      const query = serializeQualityState(next);

      if (query === (pendingQuery.current ?? currentQuery)) return;

      pendingQuery.current = query;
      router.replace(query.length === 0 ? pathname : `${pathname}?${query}`, {
        scroll: false,
      });
    },
    [currentQuery, pathname, router],
  );

  return <QualityCenter canEdit={canEdit} onChange={change} state={state} />;
}
