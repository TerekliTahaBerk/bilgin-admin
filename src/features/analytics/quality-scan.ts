import type { Unit } from "@/contracts/admin/content";
import { runWithConcurrency } from "@/lib/async/run-with-concurrency";
import { toApiError, type ApiError } from "@/lib/api/error";
import { shouldHaltBatch } from "@/lib/api/retry-policy";

/**
 * How many list requests a scan keeps in flight at once. There is no bulk
 * "every exercise" endpoint on the backend, so a catalogue scan is the same
 * per-unit list request the unit browser makes, repeated — bounded here so a
 * large catalogue never turns into hundreds of simultaneous requests.
 */
export const SCAN_CONCURRENCY = 4;

export type ScanUnit = Readonly<{
  courseId: number;
  unitId: number;
  title: string;
}>;

/** What to read: whole courses (units listed first), and/or single units. */
export type ScanTarget = Readonly<{
  courseIds: readonly number[];
  units: readonly ScanUnit[];
}>;

export type ScanFailure =
  | Readonly<{ kind: "course"; courseId: number; error: ApiError }>
  | Readonly<{
      kind: "unit";
      courseId: number;
      unitId: number;
      title: string;
      error: ApiError;
    }>;

export type ScanPhase = "units" | "exercises";

export type ScanProgress = Readonly<{
  phase: ScanPhase;
  completed: number;
  total: number;
}>;

export type ScanOutcome = Readonly<{
  status: "completed" | "cancelled" | "halted";
  failures: readonly ScanFailure[];
  /** Set when the scan stopped early because going on could not help. */
  haltError: ApiError | null;
}>;

export type ScanDependencies = Readonly<{
  loadUnits: (courseId: number) => Promise<readonly Unit[]>;
  loadExercises: (unitId: number) => Promise<unknown>;
  isCancelled: () => boolean;
  onProgress: (progress: ScanProgress) => void;
  concurrency?: number;
}>;

/**
 * Reads course → unit → exercise lists. Units the backend already reports as
 * having no exercises are never requested. One failing course or unit does
 * not stop the rest; each failure is reported with enough context to retry
 * just that piece.
 */
export async function runQualityScan(
  target: ScanTarget,
  deps: ScanDependencies,
): Promise<ScanOutcome> {
  const concurrency = deps.concurrency ?? SCAN_CONCURRENCY;
  const failures: ScanFailure[] = [];
  let haltError: ApiError | null = null;
  const stop = () => haltError !== null || deps.isCancelled();

  const queued = new Map<number, ScanUnit>();
  for (const unit of target.units) queued.set(unit.unitId, unit);

  if (target.courseIds.length > 0) {
    let completed = 0;
    deps.onProgress({
      phase: "units",
      completed,
      total: target.courseIds.length,
    });

    await runWithConcurrency(
      target.courseIds,
      concurrency,
      async (courseId) => {
        try {
          const units = await deps.loadUnits(courseId);

          for (const unit of units) {
            if (unit.exercise_count > 0 && !queued.has(unit.id)) {
              queued.set(unit.id, {
                courseId,
                unitId: unit.id,
                title: unit.title,
              });
            }
          }
        } catch (raw) {
          const error = toApiError(raw);

          if (shouldHaltBatch(error)) haltError ??= error;
          else failures.push({ kind: "course", courseId, error });
        }

        completed += 1;
        deps.onProgress({
          phase: "units",
          completed,
          total: target.courseIds.length,
        });
      },
      stop,
    );
  }

  const units = [...queued.values()];

  if (!stop()) {
    let completed = 0;
    deps.onProgress({ phase: "exercises", completed, total: units.length });

    await runWithConcurrency(
      units,
      concurrency,
      async (unit) => {
        try {
          await deps.loadExercises(unit.unitId);
        } catch (raw) {
          const error = toApiError(raw);

          if (shouldHaltBatch(error)) haltError ??= error;
          else failures.push({ kind: "unit", ...unit, error });
        }

        completed += 1;
        deps.onProgress({ phase: "exercises", completed, total: units.length });
      },
      stop,
    );
  }

  return {
    status:
      haltError !== null
        ? "halted"
        : deps.isCancelled()
          ? "cancelled"
          : "completed",
    failures,
    haltError,
  };
}

/** The part of a finished scan that still needs reading. */
export function retryTarget(failures: readonly ScanFailure[]): ScanTarget {
  return {
    courseIds: failures
      .filter((failure) => failure.kind === "course")
      .map((failure) => failure.courseId),
    units: failures.flatMap((failure) =>
      failure.kind === "unit"
        ? [
            {
              courseId: failure.courseId,
              unitId: failure.unitId,
              title: failure.title,
            },
          ]
        : [],
    ),
  };
}
