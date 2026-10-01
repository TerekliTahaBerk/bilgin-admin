import {
  activeExerciseCounts,
  hasFewActiveExercises,
  LOW_UNIT_EXERCISE_MAX,
  type TopicCoverageRow,
} from "@/features/analytics/health-metrics";
import {
  courseHref,
  exerciseHref,
  unitHref,
} from "@/features/content/content-links";
import type { ContentSnapshot } from "@/features/content/content-snapshot";
import { topicCoverageRanges } from "@/features/content/topic-coverage";

export type ProblemSeverity = "high" | "medium" | "low";

export const problemKinds = [
  "scan_error",
  "course_without_units",
  "unit_without_exercises",
  "unit_without_nodes",
  "exercise_needs_review",
  "unit_few_exercises",
  "topic_without_exercises",
  "topic_low_coverage",
] as const;

export type ProblemKind = (typeof problemKinds)[number];

export const problemKindLabels: Readonly<Record<ProblemKind, string>> = {
  scan_error: "Taramada okunamayan liste",
  course_without_units: "Ünitesi olmayan ders",
  unit_without_exercises: "Sorusu olmayan ünite",
  unit_without_nodes: "Adımı olmayan ünite",
  exercise_needs_review: "İnceleme gerekli soru",
  unit_few_exercises: `Az aktif sorulu ünite (1–${LOW_UNIT_EXERCISE_MAX})`,
  topic_without_exercises: "Sorusu olmayan konu",
  topic_low_coverage: "Kapsamı düşük konu",
};

const severityByKind: Readonly<Record<ProblemKind, ProblemSeverity>> = {
  scan_error: "high",
  course_without_units: "high",
  unit_without_exercises: "high",
  unit_without_nodes: "high",
  exercise_needs_review: "high",
  unit_few_exercises: "medium",
  topic_without_exercises: "medium",
  topic_low_coverage: "low",
};

export const severityLabels: Readonly<Record<ProblemSeverity, string>> = {
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
};

/** One thing to fix, with a link straight to where it is fixed. */
export type HealthProblem = Readonly<{
  id: string;
  kind: ProblemKind;
  severity: ProblemSeverity;
  title: string;
  detail: string;
  href: string;
  linkLabel: string;
}>;

const severityOrder: Readonly<Record<ProblemSeverity, number>> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Everything worth a human look in a snapshot, most severe first; within a
 * kind, in catalogue order. Each problem reads one backend field or flag as
 * it is — `unit_count`, `exercise_count`, `node_count`, `needs_review` — and
 * the app-wide topic coverage bands (`classifyTopicCoverage`).
 */
export function buildHealthProblems(
  snapshot: ContentSnapshot,
  topics: readonly TopicCoverageRow[] | null,
  canEdit: boolean,
): HealthProblem[] {
  const problems: HealthProblem[] = [];
  const courseName = new Map(
    snapshot.courses.map((course) => [course.id, course.name]),
  );
  const unitTitle = new Map(
    snapshot.units.map((unit) => [unit.id, unit.title]),
  );
  const active = activeExerciseCounts(snapshot);
  const add = (
    kind: ProblemKind,
    problem: Omit<HealthProblem, "kind" | "severity">,
  ) => problems.push({ ...problem, kind, severity: severityByKind[kind] });

  snapshot.errors.forEach((error, index) => {
    const where =
      error.kind === "courses"
        ? "Ders listesi"
        : error.kind === "course"
          ? `${courseName.get(error.courseId) ?? `Ders #${error.courseId}`} — ünite listesi`
          : `${courseName.get(error.courseId) ?? `Ders #${error.courseId}`} › ${error.title} — soru listesi`;

    add("scan_error", {
      id: `scan-error-${index}`,
      title: where,
      detail: `Taramada okunamadı (${error.error.message}); bu veri aşağıdaki sayılarda yok.`,
      href: "/scan",
      linkLabel: "Taramaya git",
    });
  });

  for (const course of snapshot.courses) {
    if (course.unit_count === 0) {
      add("course_without_units", {
        id: `course-${course.id}`,
        title: course.name,
        detail: "Bu derste hiç ünite yok.",
        href: courseHref(course.id),
        linkLabel: "Dersi aç",
      });
    }
  }

  for (const unit of snapshot.units) {
    const where = `${courseName.get(unit.courseId) ?? ""} › ${unit.title}`;
    const href = unitHref(unit.courseId, unit.id);

    if (unit.exercise_count === 0) {
      add("unit_without_exercises", {
        id: `unit-empty-${unit.id}`,
        title: where,
        detail: "Bu ünitede hiç soru yok.",
        href,
        linkLabel: "Üniteyi aç",
      });
    } else if (hasFewActiveExercises(active.get(unit.id))) {
      add("unit_few_exercises", {
        id: `unit-few-${unit.id}`,
        title: where,
        detail: `Yalnızca ${active.get(unit.id)} aktif (arşivlenmemiş) soru var.`,
        href,
        linkLabel: "Üniteyi aç",
      });
    }

    if (unit.node_count === 0) {
      add("unit_without_nodes", {
        id: `unit-nodes-${unit.id}`,
        title: where,
        detail: "Bu ünitede hiç adım yok; öğrenciye sunulacak bir yol yok.",
        href,
        linkLabel: "Üniteyi aç",
      });
    }
  }

  for (const exercise of snapshot.exercises) {
    if (!exercise.stats.needs_review) continue;

    const { attempts, correct_rate } = exercise.stats;

    add("exercise_needs_review", {
      id: `exercise-${exercise.id}`,
      title:
        exercise.preview.trim() === "" ? "(önizleme yok)" : exercise.preview,
      detail: `${courseName.get(exercise.courseId) ?? ""} › ${unitTitle.get(exercise.unitId) ?? ""} · ${attempts} deneme${correct_rate === null ? "" : ` · %${correct_rate} doğru`}`,
      href: exerciseHref(
        {
          courseId: exercise.courseId,
          unitId: exercise.unitId,
          exerciseId: exercise.id,
          type: exercise.type,
        },
        canEdit,
      ),
      linkLabel: canEdit ? "Soruyu düzenle" : "Ünitede gör",
    });
  }

  for (const row of topics ?? []) {
    if (row.coverage === "none") {
      add("topic_without_exercises", {
        id: `topic-none-${row.topic.id}`,
        title: row.topic.name,
        detail: `${row.subject.courseName} dersinin konusu; hiç sorusu yok.`,
        href: courseHref(row.subject.courseId),
        linkLabel: "Dersi aç",
      });
    } else if (row.coverage === "low") {
      add("topic_low_coverage", {
        id: `topic-low-${row.topic.id}`,
        title: row.topic.name,
        detail: `${row.topic.exercise_count} soru (düşük kapsam: ${topicCoverageRanges.low}).`,
        href: `/quality?course=${row.subject.courseId}&topic=${row.topic.id}`,
        linkLabel: "Soruları gör",
      });
    }
  }

  const kindOrder = new Map(problemKinds.map((kind, index) => [kind, index]));

  // Stable sort: catalogue order is kept inside each kind.
  return problems.sort(
    (left, right) =>
      severityOrder[left.severity] - severityOrder[right.severity] ||
      (kindOrder.get(left.kind) ?? 0) - (kindOrder.get(right.kind) ?? 0),
  );
}

export function countProblemsByKind(
  problems: readonly HealthProblem[],
): Readonly<Record<ProblemKind, number>> {
  const counts = Object.fromEntries(
    problemKinds.map((kind) => [kind, 0]),
  ) as Record<ProblemKind, number>;

  for (const problem of problems) counts[problem.kind] += 1;

  return counts;
}
