"use client";

import { UnattemptedCenter } from "@/features/analytics/unattempted-center";
import {
  parseUnattemptedState,
  serializeUnattemptedState,
} from "@/features/analytics/unattempted-queue";
import { useUrlViewState } from "@/lib/url/use-url-view-state";

/** Segment and filters live in the URL (a shareable view). */
export function UnattemptedPage({ canEdit }: { canEdit: boolean }) {
  const [state, change] = useUrlViewState(
    parseUnattemptedState,
    serializeUnattemptedState,
  );

  return (
    <UnattemptedCenter canEdit={canEdit} onChange={change} state={state} />
  );
}
