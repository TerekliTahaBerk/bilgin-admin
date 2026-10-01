"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import {
  indexSnapshot,
  type ContentSnapshot,
  type SnapshotIndex,
} from "@/features/content/content-snapshot";
import {
  ContentScanController,
  INITIAL_CONTENT_SCAN_STATE,
  type ContentScanState,
} from "@/features/content/content-scan-store";

const ContentScanContext = createContext<ContentScanController | null>(null);

/**
 * Owns the session's scan controller. Mounted once, inside the authenticated
 * app shell and its QueryClient: the controller is created per panel session
 * and dropped with it on sign-out — never a module-level singleton that could
 * outlive the session or be shared across server renders.
 */
export function ContentScanProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const [controller] = useState(() => new ContentScanController(queryClient));

  // Leaving the panel (sign-out) stops any scan still running.
  useEffect(() => () => controller.cancel(), [controller]);

  return (
    <ContentScanContext.Provider value={controller}>
      {children}
    </ContentScanContext.Provider>
  );
}

const noopSubscribe = () => () => {};
const initialState = () => INITIAL_CONTENT_SCAN_STATE;

function useScanSelector<Selected>(
  select: (state: ContentScanState) => Selected,
): Selected {
  const controller = useContext(ContentScanContext);

  return useSyncExternalStore(
    controller?.subscribe ?? noopSubscribe,
    () => select(controller?.getState() ?? INITIAL_CONTENT_SCAN_STATE),
    () => select(initialState()),
  );
}

export type ContentScanApi = Readonly<{
  state: ContentScanState;
  start: (options?: { refresh?: boolean }) => void;
  retryFailures: () => void;
  cancel: () => void;
}>;

/** The full scan state and its actions — for the scan screen itself. */
export function useContentScan(): ContentScanApi {
  const controller = useContext(ContentScanContext);

  if (controller === null) {
    throw new Error("useContentScan must be used inside ContentScanProvider.");
  }

  const state = useScanSelector((current) => current);

  return {
    state,
    start: controller.start,
    retryFailures: controller.retryFailures,
    cancel: controller.cancel,
  };
}

/**
 * The latest snapshot, or `null` before the first one (or outside the panel
 * shell). Re-renders only when the snapshot itself changes, not on every
 * progress tick of a running scan.
 */
export function useContentSnapshot(): ContentSnapshot | null {
  return useScanSelector((state) => state.snapshot);
}

/** The snapshot with its lookups, built once per snapshot. */
export function useContentSnapshotIndex(): Readonly<{
  snapshot: ContentSnapshot;
  index: SnapshotIndex;
}> | null {
  const snapshot = useContentSnapshot();

  return useMemo(
    () =>
      snapshot === null ? null : { snapshot, index: indexSnapshot(snapshot) },
    [snapshot],
  );
}
