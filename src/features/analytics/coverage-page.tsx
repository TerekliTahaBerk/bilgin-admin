"use client";

import { CoverageCenter } from "@/features/analytics/coverage-center";
import {
  parseCoverageState,
  serializeCoverageState,
} from "@/features/analytics/coverage-model";
import { useUrlViewState } from "@/lib/url/use-url-view-state";

/**
 * Course, view, filters, search, sort and mode live in the URL, so a view
 * such as "AYT Fizik, only empty topics, 11th grade" is a shareable link.
 */
export function CoveragePage() {
  const [state, change] = useUrlViewState(
    parseCoverageState,
    serializeCoverageState,
  );

  return <CoverageCenter onChange={change} state={state} />;
}
