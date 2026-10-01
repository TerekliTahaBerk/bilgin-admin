import { describe, expect, it } from "vitest";

import {
  topicCoverage,
  topicsBySubject,
} from "@/features/analytics/health-metrics";
import {
  buildHealthProblems,
  countProblemsByKind,
  problemKindLabels,
  problemKinds,
} from "@/features/analytics/health-problems";
import type { ApiError } from "@/lib/api/error";
import {
  healthSnapshot,
  snapshotExercise,
  topicList,
} from "@/test/fixtures/health";

const serverError: ApiError = { kind: "server", status: 500, message: "Hata" };

const topics = topicCoverage(
  topicsBySubject([topicList(1, 1, { 1: 0, 2: 1, 3: 10, 4: 10 }, "TYT Tarih")]),
);

describe("buildHealthProblems", () => {
  it("lists one problem per finding, most severe first, each with a link", () => {
    const problems = buildHealthProblems(healthSnapshot(), topics, true);

    expect(
      problems.map((problem) => [
        problem.severity,
        problem.kind,
        problem.title,
        problem.href,
      ]),
    ).toEqual([
      ["high", "course_without_units", "AYT Fizik", "/courses/2"],
      [
        "high",
        "unit_without_exercises",
        "TYT Tarih › Zaman",
        "/courses/1/units/11",
      ],
      [
        "high",
        "unit_without_nodes",
        "TYT Tarih › Takvim",
        "/courses/1/units/12",
      ],
      [
        "high",
        "exercise_needs_review",
        "Uygurlar",
        "/courses/1/units/10/exercises/101",
      ],
      [
        "medium",
        "unit_few_exercises",
        "TYT Tarih › İlk Çağ",
        "/courses/1/units/10",
      ],
      [
        "medium",
        "unit_few_exercises",
        "TYT Tarih › Takvim",
        "/courses/1/units/12",
      ],
      ["medium", "topic_without_exercises", "Konu 1", "/courses/1"],
      ["low", "topic_low_coverage", "Konu 2", "/quality?course=1&topic=2"],
    ]);
    expect(new Set(problems.map((problem) => problem.id)).size).toBe(
      problems.length,
    );
  });

  it("describes each finding with the backend's own numbers", () => {
    const problems = buildHealthProblems(healthSnapshot(), topics, true);
    const detail = (kind: string) =>
      problems.find((problem) => problem.kind === kind)?.detail;

    expect(detail("exercise_needs_review")).toBe(
      "TYT Tarih › İlk Çağ · 30 deneme · %97 doğru",
    );
    // Counted from the scanned list: unit 12 has one active question.
    expect(detail("unit_few_exercises")).toBe(
      "Yalnızca 2 aktif (arşivlenmemiş) soru var.",
    );
    expect(detail("topic_low_coverage")).toBe(
      "1 soru; aynı dersin konularında ortanca 10.",
    );
  });

  it("links a read-only admin to the unit page instead of the editor", () => {
    const review = buildHealthProblems(healthSnapshot(), null, false).find(
      (problem) => problem.kind === "exercise_needs_review",
    );

    expect(review).toMatchObject({
      href: "/courses/1/units/10",
      linkLabel: "Ünitede gör",
    });
  });

  it("lists nothing about topics until their lists are loaded", () => {
    const problems = buildHealthProblems(healthSnapshot(), null, true);

    expect(problems.some((problem) => problem.kind.startsWith("topic"))).toBe(
      false,
    );
  });

  it("puts what the scan could not read first, linking back to the scan", () => {
    const problems = buildHealthProblems(
      healthSnapshot([
        { kind: "courses", error: serverError },
        { kind: "course", courseId: 2, error: serverError },
        {
          kind: "unit",
          courseId: 1,
          unitId: 11,
          title: "Zaman",
          error: serverError,
        },
      ]),
      null,
      true,
    );
    const scanErrors = problems.filter(
      (problem) => problem.kind === "scan_error",
    );

    expect(problems[0]?.kind).toBe("scan_error");
    expect(scanErrors.map((problem) => problem.title)).toEqual([
      "Ders listesi",
      "AYT Fizik — ünite listesi",
      "TYT Tarih › Zaman — soru listesi",
    ]);
    expect(scanErrors.every((problem) => problem.href === "/scan")).toBe(true);
  });

  it("names an unknown course by id", () => {
    const [problem] = buildHealthProblems(
      healthSnapshot([{ kind: "course", courseId: 99, error: serverError }]),
      null,
      true,
    );

    expect(problem?.title).toBe("Ders #99 — ünite listesi");
  });

  it("finds nothing in a healthy catalogue", () => {
    const snapshot = healthSnapshot();
    const plenty = Array.from({ length: 11 }, (_, index) =>
      snapshotExercise(500 + index, 1, 10),
    );

    expect(
      buildHealthProblems(
        {
          ...snapshot,
          courses: snapshot.courses.slice(0, 1),
          units: snapshot.units.slice(0, 1),
          exercises: plenty,
        },
        [],
        true,
      ),
    ).toEqual([]);
  });
});

describe("countProblemsByKind", () => {
  it("counts every kind, zeros included", () => {
    const counts = countProblemsByKind(
      buildHealthProblems(healthSnapshot(), topics, true),
    );

    expect(counts).toEqual({
      scan_error: 0,
      course_without_units: 1,
      unit_without_exercises: 1,
      unit_without_nodes: 1,
      exercise_needs_review: 1,
      unit_few_exercises: 2,
      topic_without_exercises: 1,
      topic_low_coverage: 1,
    });
  });

  it("labels every kind", () => {
    for (const kind of problemKinds) {
      expect(problemKindLabels[kind].length).toBeGreaterThan(0);
    }
  });
});
