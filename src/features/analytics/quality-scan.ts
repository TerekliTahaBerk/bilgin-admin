import type { Unit, UnitExercisesData } from "@/contracts/admin/content";
import {
  runContentScan,
  type ContentScanFailure,
  type ScanUnitRef,
} from "@/features/content/content-scan";
import type { ApiError } from "@/lib/api/error";

/**
 * The Quality Center's targeted scan: one course, one unit, or every course
 * the admin is looking at. It is the shared catalogue scan engine
 * (`runContentScan`) aimed at a scope — not a second implementation — with
 * its progress reduced to the two phases this screen shows.
 */
export type ScanUnit = ScanUnitRef;

/** What to read: whole courses (units listed first), and/or single units. */
export type ScanTarget = Readonly<{
  courseIds: readonly number[];
  units: readonly ScanUnit[];
}>;

/**
 * What "Tara" reads for a course/unit scope: the one unit, the one course,
 * or every course.
 */
export function scanTargetForScope(
  courseIds: readonly number[],
  scope: Readonly<{
    courseId?: number;
    unitId?: number;
    unitTitle?: string;
  }>,
): ScanTarget {
  if (scope.courseId !== undefined && scope.unitId !== undefined) {
    return {
      courseIds: [],
      units: [
        {
          courseId: scope.courseId,
          unitId: scope.unitId,
          title: scope.unitTitle ?? `Ünite #${scope.unitId}`,
        },
      ],
    };
  }

  return scope.courseId !== undefined
    ? { courseIds: [scope.courseId], units: [] }
    : { courseIds, units: [] };
}

/** A targeted scan never reads the course list, so it cannot fail on it. */
export type ScanFailure = Exclude<ContentScanFailure, { kind: "courses" }>;

export type ScanPhase = "units" | "exercises";

export type ScanProgress = Readonly<{
  phase: ScanPhase;
  completed: number;
  total: number;
}>;

export type ScanOutcome = Readonly<{
  status: "completed" | "cancelled" | "halted";
  failures: readonly ScanFailure[];
  haltError: ApiError | null;
}>;

export type ScanDependencies = Readonly<{
  loadUnits: (courseId: number) => Promise<readonly Unit[]>;
  loadExercises: (unitId: number) => Promise<UnitExercisesData>;
  signal?: AbortSignal;
  onProgress: (progress: ScanProgress) => void;
  concurrency?: number;
}>;

function isTargetFailure(failure: ContentScanFailure): failure is ScanFailure {
  return failure.kind !== "courses";
}

/**
 * Reads the scope's unit and exercise lists. Units the backend reports as
 * having no exercises are skipped — this is a scoped refresh of what the
 * Quality Center shows; the full scan (`/scan`) reads every unit.
 */
export async function runQualityScan(
  target: ScanTarget,
  deps: ScanDependencies,
): Promise<ScanOutcome> {
  const result = await runContentScan(
    { courses: target.courseIds, units: target.units },
    {
      loadCourses: () => Promise.resolve([]),
      loadUnits: deps.loadUnits,
      loadExercises: deps.loadExercises,
      signal: deps.signal,
      concurrency: deps.concurrency,
      skipEmptyUnits: true,
      onProgress: (progress) => {
        if (progress.phase === "units") {
          // Nothing to list when only single units were asked for.
          if (target.courseIds.length === 0) return;
          deps.onProgress({
            phase: "units",
            completed: progress.courses.scanned,
            total: target.courseIds.length,
          });
        } else if (progress.phase === "exercises") {
          deps.onProgress({
            phase: "exercises",
            completed: progress.units.scanned,
            total: progress.units.total ?? 0,
          });
        }
      },
    },
  );

  return {
    status: result.status,
    failures: result.failures.filter(isTargetFailure),
    haltError: result.haltError,
  };
}

/** The part of a finished scan that still needs reading. */
export function retryTarget(failures: readonly ScanFailure[]): ScanTarget {
  return {
    courseIds: failures.flatMap((failure) =>
      failure.kind === "course" ? [failure.courseId] : [],
    ),
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
