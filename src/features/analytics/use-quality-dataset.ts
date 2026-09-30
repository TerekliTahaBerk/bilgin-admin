"use client";

import { useQueries, type QueryObserverResult } from "@tanstack/react-query";
import { useMemo } from "react";

import type {
  Course,
  Unit,
  UnitExercisesData,
} from "@/contracts/admin/content";
import {
  buildQualityRows,
  type KnownUnit,
  type LoadedUnitExercises,
  type QualityRow,
} from "@/features/analytics/quality-dataset";
import { toApiError } from "@/features/analytics/quality-scan";
import {
  courseUnitsQueryOptions,
  unitExercisesQueryOptions,
} from "@/features/content/content-queries";
import type { ApiError } from "@/lib/api/error";

/** Only the unfiltered list is a complete picture of a unit. */
const UNFILTERED = {} as const;

export type QualityDataset = Readonly<{
  unitsByCourse: ReadonlyMap<number, readonly Unit[]>;
  knownUnits: readonly KnownUnit[];
  loadedUnitIds: ReadonlySet<number>;
  rows: readonly QualityRow[];
  /** The unit list of `activeCourseId`, fetched for the unit filter. */
  activeCourseUnits: Readonly<{
    isPending: boolean;
    error: ApiError | null;
  }>;
}>;

/*
 * The combiners reduce each observer result to the fields this page reads.
 * TanStack structurally shares the combined value, so a cache event that
 * changes nothing here keeps the same identity and the memos below hold.
 */
function combineUnits(results: QueryObserverResult<Unit[]>[]) {
  return results.map((result) => ({
    data: result.data,
    isPending: result.isPending,
    error: result.error === null ? null : toApiError(result.error),
  }));
}

function combineExercises(results: QueryObserverResult<UnitExercisesData>[]) {
  return results.map((result) => result.data);
}

/**
 * The Quality Center's data source. It observes — never fetches — the same
 * cache entries the courses and unit browsers fill, so anything the admin has
 * browsed, and anything a scan has read, shows up here without a second
 * request. Observing also keeps those entries alive for as long as the page
 * is open, so a finished scan is not garbage-collected from under it.
 *
 * The one exception is `activeCourseId`: the unit filter needs that course's
 * unit list, which is fetched under its usual shared key.
 */
export function useQualityDataset(
  courses: readonly Course[],
  activeCourseId: number | undefined,
): QualityDataset {
  const unitResults = useQueries({
    queries: courses.map((course) => ({
      ...courseUnitsQueryOptions(course.id),
      enabled: course.id === activeCourseId,
    })),
    combine: combineUnits,
  });

  const unitsByCourse = useMemo(() => {
    const map = new Map<number, readonly Unit[]>();

    courses.forEach((course, index) => {
      const data = unitResults[index]?.data;
      if (data !== undefined) map.set(course.id, data);
    });

    return map;
  }, [courses, unitResults]);

  const knownUnits = useMemo(
    () =>
      [...unitsByCourse].flatMap(([courseId, units]) =>
        units.map((unit): KnownUnit => ({ courseId, unit })),
      ),
    [unitsByCourse],
  );

  const exerciseResults = useQueries({
    queries: knownUnits.map(({ unit }) => ({
      ...unitExercisesQueryOptions(unit.id, UNFILTERED),
      enabled: false,
    })),
    combine: combineExercises,
  });

  const lists = useMemo(() => {
    const loaded: LoadedUnitExercises[] = [];

    knownUnits.forEach(({ unit }, index) => {
      const data = exerciseResults[index];
      if (data !== undefined) loaded.push({ unitId: unit.id, data });
    });

    return loaded;
  }, [knownUnits, exerciseResults]);

  const loadedUnitIds = useMemo(
    () => new Set(lists.map((list) => list.unitId)),
    [lists],
  );

  const rows = useMemo(
    () => buildQualityRows(courses, knownUnits, lists),
    [courses, knownUnits, lists],
  );

  const activeIndex =
    activeCourseId === undefined
      ? -1
      : courses.findIndex((course) => course.id === activeCourseId);
  const active = activeIndex === -1 ? undefined : unitResults[activeIndex];

  return {
    unitsByCourse,
    knownUnits,
    loadedUnitIds,
    rows,
    activeCourseUnits: {
      isPending: active !== undefined && active.isPending,
      error: active?.error ?? null,
    },
  };
}
