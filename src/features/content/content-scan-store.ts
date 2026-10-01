import type { QueryClient } from "@tanstack/react-query";

import type {
  Course,
  Unit,
  UnitExercisesData,
} from "@/contracts/admin/content";
import {
  CONTENT_STALE_TIME_MS,
  coursesQueryOptions,
  courseUnitsQueryOptions,
  unitExercisesQueryOptions,
} from "@/features/content/content-queries";
import {
  retryTargetFor,
  runContentScan,
  type ContentScanFailure,
  type ContentScanProgress,
  type ContentScanTarget,
} from "@/features/content/content-scan";
import {
  buildSnapshot,
  mergeSnapshot,
  type ContentSnapshot,
} from "@/features/content/content-snapshot";
import { fetchWithAbort } from "@/features/content/scan-fetch";
import type { ApiError } from "@/lib/api/error";

export type ContentScanRunKind = "full" | "retry";

export type ContentScanRun = Readonly<{
  kind: ContentScanRunKind;
  /** A full scan that ignores fresh cache entries ("Yeniden tara"). */
  refresh: boolean;
  startedAt: string;
  progress: ContentScanProgress | null;
  isCancelling: boolean;
}>;

export type ContentScanOutcome = Readonly<{
  kind: ContentScanRunKind;
  /**
   * - `complete` / `partial`: a snapshot was produced (partial: with errors);
   * - `failed`: the course list itself could not be read — no snapshot;
   * - `cancelled` / `halted`: stopped part-way — the previous snapshot stays.
   */
  status: "complete" | "partial" | "failed" | "cancelled" | "halted";
  finishedAt: string;
  failures: readonly ContentScanFailure[];
  haltError: ApiError | null;
}>;

export type ContentScanState = Readonly<{
  run: ContentScanRun | null;
  lastOutcome: ContentScanOutcome | null;
  snapshot: ContentSnapshot | null;
  /** When a snapshot with no errors was last produced. */
  lastFullScanAt: string | null;
}>;

export const INITIAL_CONTENT_SCAN_STATE: ContentScanState = {
  run: null,
  lastOutcome: null,
  snapshot: null,
  lastFullScanAt: null,
};

/**
 * The app's one catalogue scan, and the snapshot it produces.
 *
 * One instance lives for one signed-in panel session (it is created by the
 * provider inside the authenticated app shell), so:
 * - a scan keeps running while the admin moves between panel pages;
 * - the snapshot is shared by every screen that wants it;
 * - signing out unmounts the shell and drops it, with nothing left behind.
 *
 * It deliberately never touches web storage — see `snapshotByteSize`.
 *
 * Every read goes through the shared query cache with the same keys and
 * options as the browsers, so a scan also warms the unit pages, and a fresh
 * cache entry is reused unless the admin asked for a re-scan.
 */
export class ContentScanController {
  #state: ContentScanState = INITIAL_CONTENT_SCAN_STATE;
  readonly #listeners = new Set<() => void>();
  #abort: AbortController | null = null;
  readonly #queryClient: QueryClient;
  readonly #now: () => Date;

  constructor(queryClient: QueryClient, now: () => Date = () => new Date()) {
    this.#queryClient = queryClient;
    this.#now = now;
  }

  getState = (): ContentScanState => this.#state;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  #set(update: (state: ContentScanState) => ContentScanState): void {
    this.#state = update(this.#state);
    for (const listener of this.#listeners) listener();
  }

  /** Starts a full scan. Ignored while any run is in progress. */
  start = ({ refresh = false }: { refresh?: boolean } = {}): void => {
    this.#run("full", { courses: "all", units: [] }, refresh);
  };

  /**
   * Reads only what the last run could not: failed courses (their units and
   * exercises) and failed units. A failed course list means nothing was
   * read, so that retries the full scan.
   */
  retryFailures = (): void => {
    const failures =
      this.#state.snapshot?.errors ?? this.#state.lastOutcome?.failures ?? [];
    const target = retryTargetFor(failures);

    if (target.courses === "all" || this.#state.snapshot === null) {
      this.#run("full", { courses: "all", units: [] }, false);
      return;
    }
    if (target.courses.length === 0 && target.units.length === 0) return;

    // A retry is aimed at what failed, so it always asks the backend again.
    this.#run("retry", target, true);
  };

  /** Aborts the run: nothing new starts and in-flight requests are cancelled. */
  cancel = (): void => {
    if (this.#abort === null || this.#abort.signal.aborted) return;

    this.#abort.abort();
    this.#set((state) =>
      state.run === null
        ? state
        : { ...state, run: { ...state.run, isCancelling: true } },
    );
  };

  #run(
    kind: ContentScanRunKind,
    target: ContentScanTarget,
    refresh: boolean,
  ): void {
    if (this.#abort !== null) return;

    const abort = new AbortController();
    const staleTime = refresh ? 0 : CONTENT_STALE_TIME_MS;
    this.#abort = abort;

    this.#set((state) => ({
      ...state,
      run: {
        kind,
        refresh,
        startedAt: this.#now().toISOString(),
        progress: null,
        isCancelling: false,
      },
    }));

    void runContentScan(target, {
      signal: abort.signal,
      loadCourses: () =>
        fetchWithAbort<Course[]>(
          this.#queryClient,
          coursesQueryOptions(),
          staleTime,
          abort.signal,
        ),
      loadUnits: (courseId) =>
        fetchWithAbort<Unit[]>(
          this.#queryClient,
          courseUnitsQueryOptions(courseId),
          staleTime,
          abort.signal,
        ),
      loadExercises: (unitId) =>
        fetchWithAbort<UnitExercisesData>(
          this.#queryClient,
          unitExercisesQueryOptions(unitId, {}),
          staleTime,
          abort.signal,
        ),
      onProgress: (progress) => {
        if (this.#abort !== abort) return;
        this.#set((state) =>
          state.run === null
            ? state
            : { ...state, run: { ...state.run, progress } },
        );
      },
    }).then((result) => {
      if (this.#abort !== abort) return;
      this.#abort = null;

      const finishedAt = this.#now().toISOString();

      this.#set((state) => {
        let snapshot = state.snapshot;
        let status: ContentScanOutcome["status"];

        if (result.status !== "completed") {
          status = result.status;
        } else if (kind === "retry" && state.snapshot !== null) {
          snapshot = mergeSnapshot(state.snapshot, result, finishedAt);
          status = snapshot.status;
        } else {
          const built = buildSnapshot(result, finishedAt);
          snapshot = built ?? state.snapshot;
          status = built === null ? "failed" : built.status;
        }

        return {
          run: null,
          snapshot,
          lastFullScanAt:
            status === "complete" && snapshot !== null
              ? snapshot.generatedAt
              : state.lastFullScanAt,
          lastOutcome: {
            kind,
            status,
            finishedAt,
            failures:
              status === "complete" || status === "partial"
                ? (snapshot?.errors ?? [])
                : result.failures,
            haltError: result.haltError,
          },
        };
      });
    });
  }
}
