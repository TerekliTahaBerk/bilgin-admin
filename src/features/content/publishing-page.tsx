"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { PublishingCenter } from "@/features/content/publishing-center";
import {
  parsePublishingState,
  serializePublishingState,
  type PublishingViewState,
} from "@/features/content/publishing-model";

/**
 * Filters and sort live in the URL, so "AYT Fizik, bloklanmış, en çok
 * bloklayan önce" is a link a reviewer can share and that survives a reload.
 */
export function PublishingPage({ canPublish }: { canPublish: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentQuery = searchParams.toString();

  const state = useMemo(
    () => parsePublishingState(new URLSearchParams(currentQuery)),
    [currentQuery],
  );

  /*
   * `router.replace` does not update the search params before it returns, so
   * the query last asked for is held until the URL catches up (same approach
   * as the other URL-driven lists).
   */
  const pendingQuery = useRef<string | null>(null);

  useEffect(() => {
    pendingQuery.current = null;
  }, [currentQuery]);

  const change = useCallback(
    (next: PublishingViewState) => {
      const query = serializePublishingState(next);

      if (query === (pendingQuery.current ?? currentQuery)) return;

      pendingQuery.current = query;
      router.replace(query.length === 0 ? pathname : `${pathname}?${query}`, {
        scroll: false,
      });
    },
    [currentQuery, pathname, router],
  );

  return (
    <PublishingCenter canPublish={canPublish} onChange={change} state={state} />
  );
}
