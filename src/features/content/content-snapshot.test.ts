import { describe, expect, it } from "vitest";

import type { ContentScanResult } from "@/features/content/content-scan";
import {
  buildSnapshot,
  indexSnapshot,
  mergeSnapshot,
  snapshotByteSize,
  type ContentSnapshot,
} from "@/features/content/content-snapshot";
import type { ApiError } from "@/lib/api/error";
import {
  qualityCourse,
  qualityExercise,
  qualityUnit,
  qualityUnitExercises,
} from "@/test/fixtures/quality";

const AT = "2026-10-01T09:00:00.000Z";
const LATER = "2026-10-01T09:05:00.000Z";

const serverError: ApiError = { kind: "server", status: 500, message: "x" };

const courses = [qualityCourse(1), qualityCourse(2)];

function result(overrides: Partial<ContentScanResult> = {}): ContentScanResult {
  return {
    status: "completed",
    courses,
    unitLists: [
      { courseId: 1, units: [qualityUnit(10), qualityUnit(11)] },
      { courseId: 2, units: [qualityUnit(20)] },
    ],
    exerciseLists: [
      {
        courseId: 1,
        unitId: 10,
        data: qualityUnitExercises(10, [
          qualityExercise(100),
          qualityExercise(101),
        ]),
      },
      { courseId: 1, unitId: 11, data: qualityUnitExercises(11, []) },
      {
        courseId: 2,
        unitId: 20,
        data: qualityUnitExercises(20, [qualityExercise(200)]),
      },
    ],
    failures: [],
    haltError: null,
    ...overrides,
  };
}

describe("buildSnapshot", () => {
  it("normalises a complete scan into flat lists with foreign keys", () => {
    const snapshot = buildSnapshot(result(), AT)!;

    expect(snapshot.generatedAt).toBe(AT);
    expect(snapshot.status).toBe("complete");
    expect(snapshot.errors).toEqual([]);
    expect(snapshot.courses).toEqual(courses);
    expect(snapshot.units.map((unit) => [unit.id, unit.courseId])).toEqual([
      [10, 1],
      [11, 1],
      [20, 2],
    ]);
    expect(
      snapshot.exercises.map((exercise) => [
        exercise.id,
        exercise.unitId,
        exercise.courseId,
      ]),
    ).toEqual([
      [100, 10, 1],
      [101, 10, 1],
      [200, 20, 2],
    ]);
    // Backend fields are kept verbatim.
    expect(snapshot.exercises[0]).toMatchObject(qualityExercise(100));
  });

  it("keeps the backend's order even when answers arrive out of order", () => {
    const shuffled = result();
    const snapshot = buildSnapshot(
      {
        ...shuffled,
        unitLists: [...shuffled.unitLists].reverse(),
        exerciseLists: [...shuffled.exerciseLists].reverse(),
      },
      AT,
    )!;

    expect(snapshot.units.map((unit) => unit.id)).toEqual([10, 11, 20]);
    expect(snapshot.exercises.map((exercise) => exercise.id)).toEqual([
      100, 101, 200,
    ]);
  });

  it("marks a snapshot with failures as partial and keeps the errors", () => {
    const failures = [
      { kind: "course" as const, courseId: 2, error: serverError },
    ];
    const snapshot = buildSnapshot(
      result({
        failures,
        unitLists: result().unitLists.slice(0, 1),
        exerciseLists: result().exerciseLists.slice(0, 2),
      }),
      AT,
    )!;

    expect(snapshot.status).toBe("partial");
    expect(snapshot.errors).toEqual(failures);
    expect(snapshot.units.map((unit) => unit.id)).toEqual([10, 11]);
  });

  it.each([
    ["cancelled", result({ status: "cancelled" })],
    ["halted", result({ status: "halted", haltError: serverError })],
    ["without a course list", result({ courses: null })],
  ])("produces nothing when %s", (_label, input) => {
    expect(buildSnapshot(input, AT)).toBeNull();
  });
});

describe("mergeSnapshot", () => {
  const partial: ContentSnapshot = buildSnapshot(
    result({
      unitLists: result().unitLists.slice(0, 1),
      exerciseLists: [result().exerciseLists[1]!],
      failures: [
        {
          kind: "unit",
          courseId: 1,
          unitId: 10,
          title: "Ünite 10",
          error: serverError,
        },
        { kind: "course", courseId: 2, error: serverError },
      ],
    }),
    AT,
  )!;

  it("fills in a retried course and a retried unit and becomes complete", () => {
    const merged = mergeSnapshot(
      partial,
      result({
        courses: null,
        unitLists: [result().unitLists[1]!],
        exerciseLists: [result().exerciseLists[0]!, result().exerciseLists[2]!],
      }),
      LATER,
    );

    expect(merged.status).toBe("complete");
    expect(merged.errors).toEqual([]);
    expect(merged.generatedAt).toBe(LATER);
    expect(merged).toEqual(buildSnapshot(result(), LATER));
  });

  it("keeps whatever still fails, and errors the retry did not touch", () => {
    const merged = mergeSnapshot(
      partial,
      result({
        courses: null,
        unitLists: [],
        exerciseLists: [result().exerciseLists[0]!],
        failures: [{ kind: "course", courseId: 2, error: serverError }],
      }),
      LATER,
    );

    expect(merged.status).toBe("partial");
    expect(merged.errors).toEqual([
      { kind: "course", courseId: 2, error: serverError },
    ]);
    expect(merged.exercises.map((exercise) => exercise.id)).toEqual([100, 101]);
  });

  it("replaces the snapshot when the retry re-read the course list", () => {
    const merged = mergeSnapshot(partial, result(), LATER);

    expect(merged).toEqual(buildSnapshot(result(), LATER));
  });
});

describe("indexSnapshot", () => {
  it("indexes courses, units and exercises", () => {
    const index = indexSnapshot(buildSnapshot(result(), AT)!);

    expect(index.courseById.get(2)).toEqual(courses[1]);
    expect(index.unitsByCourse.get(1)?.map((unit) => unit.id)).toEqual([
      10, 11,
    ]);
    expect(
      index.exercisesByUnit.get(10)?.map((exercise) => exercise.id),
    ).toEqual([100, 101]);
    expect(index.exercisesByUnit.get(11)).toBeUndefined();
    // An empty unit was still read.
    expect([...index.scannedUnitIds]).toEqual([10, 11, 20]);
  });

  it("leaves units whose read failed out of the scanned set", () => {
    const index = indexSnapshot(
      buildSnapshot(
        result({
          exerciseLists: result().exerciseLists.slice(1),
          failures: [
            {
              kind: "unit",
              courseId: 1,
              unitId: 10,
              title: "Ünite 10",
              error: serverError,
            },
          ],
        }),
        AT,
      )!,
    );

    expect(index.scannedUnitIds.has(10)).toBe(false);
    expect(index.scannedUnitIds.has(11)).toBe(true);
  });
});

describe("snapshotByteSize", () => {
  it("grows with the catalogue, which is why it stays out of web storage", () => {
    const small = snapshotByteSize(buildSnapshot(result(), AT)!);
    const exercises = Array.from({ length: 5_000 }, (_, index) =>
      qualityExercise(index + 1, {
        preview: "Orhun Yazıtları hangi Türk devletine aittir? ".repeat(2),
      }),
    );
    const large = snapshotByteSize(
      buildSnapshot(
        result({
          unitLists: [{ courseId: 1, units: [qualityUnit(10)] }],
          exerciseLists: [
            {
              courseId: 1,
              unitId: 10,
              data: qualityUnitExercises(10, exercises),
            },
          ],
        }),
        AT,
      )!,
    );

    expect(small).toBeGreaterThan(0);
    // Roughly 350+ bytes per question: a ~5 MB storage quota (often counted
    // in UTF-16, i.e. half that in bytes) is reached somewhere between
    // ~7,000 and ~14,000 questions — a realistic catalogue size.
    expect(large / exercises.length).toBeGreaterThan(300);
    expect(large).toBeGreaterThan(1_500_000);
  });
});
