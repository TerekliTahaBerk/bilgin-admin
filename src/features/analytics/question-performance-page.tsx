"use client";

import { QuestionPerformanceExplorer } from "@/features/analytics/question-performance-explorer";
import {
  parsePerformanceFilters,
  serializePerformanceFilters,
} from "@/features/analytics/question-performance";
import { useUrlViewState } from "@/lib/url/use-url-view-state";

/** Course, status and minimum sample live in the URL (a shareable view). */
export function QuestionPerformancePage({ canEdit }: { canEdit: boolean }) {
  const [filters, change] = useUrlViewState(
    parsePerformanceFilters,
    serializePerformanceFilters,
  );

  return (
    <QuestionPerformanceExplorer
      canEdit={canEdit}
      filters={filters}
      onChange={change}
    />
  );
}
