import type { Course, PublishStatus, Unit } from "@/contracts/admin/content";
import type {
  CurriculumOptions,
  CurriculumRow,
} from "@/contracts/admin/workflows";
import { publishStatusLabels } from "@/features/content/content-labels";

/*
 | Curriculum Health — reads of the existing curriculum endpoints only:
 | options (variants, sections), each variant's course mapping, the course
 | list (status, unit_count) and, for the variant being edited, its courses'
 | unit lists.
 |
 | Severity follows what the data can prove:
 | - "error": the data itself is inconsistent — the same course twice in the
 |   list being edited (the save would be rejected), a section that belongs
 |   to another exam (the backend only checks the section exists), a
 |   required course with no units at all.
 | - "warning": the data cannot say whether it is wrong or intended — a draft
 |   or archived course (the learner read still lists it as unpublished, and
 |   a "Yakında" placeholder is not in the admin contract), an inactive
 |   variant, duplicate sort orders, a missing exam weight, no published
 |   unit, an empty mapping.
 */

export type CurriculumVariant = CurriculumOptions["variants"][number];
export type CurriculumSection = CurriculumOptions["sections"][number];

export type HealthSeverity = "error" | "warning";

export const curriculumSignalKinds = [
  "duplicate_course",
  "section_mismatch",
  "required_no_units",
  "course_not_published",
  "required_no_published_units",
  "duplicate_sort_order",
  "missing_weight",
  "inactive_variant",
  "empty_mapping",
  "unknown_course",
] as const;
export type CurriculumSignalKind = (typeof curriculumSignalKinds)[number];

export const curriculumSignalLabels: Readonly<
  Record<CurriculumSignalKind, string>
> = {
  duplicate_course: "Aynı ders birden fazla kez",
  section_mismatch: "Oturum uyumsuzluğu",
  required_no_units: "Zorunlu ders, ünitesiz",
  course_not_published: "Ders yayında değil",
  required_no_published_units: "Zorunlu ders, yayında ünite yok",
  duplicate_sort_order: "Aynı sıra numarası",
  missing_weight: "Sınav ağırlığı şüpheli",
  inactive_variant: "Pasif varyant",
  empty_mapping: "Eşlemede ders yok",
  unknown_course: "Ders listede bulunamadı",
};

export type CurriculumSignal = Readonly<{
  id: string;
  kind: CurriculumSignalKind;
  severity: HealthSeverity;
  message: string;
  /** The row the signal is about, when it is about one. */
  courseId?: number;
}>;

export type VariantMetrics = Readonly<{
  courseCount: number;
  requiredCount: number;
  freeCount: number;
  premiumCount: number;
  /** Per section of the variant's exam, in section order; plus foreign ones. */
  sections: readonly Readonly<{ id: number; name: string; count: number }>[];
  /** Sum of the weights that are set, and how many rows have none. */
  weightTotal: number;
  weightMissing: number;
  /** Course status counts, from the mapping rows. */
  statuses: Readonly<Record<PublishStatus, number>>;
  /** Sum of the mapped courses' `unit_count`; null if a course is unknown. */
  unitTotal: number | null;
}>;

export function sectionsForVariant(
  variant: CurriculumVariant,
  sections: readonly CurriculumSection[],
): CurriculumSection[] {
  return sections.filter((section) => section.exam_id === variant.exam_id);
}

export function variantMetrics(
  variant: CurriculumVariant,
  rows: readonly CurriculumRow[],
  sections: readonly CurriculumSection[],
  courses: readonly Course[] | undefined,
): VariantMetrics {
  const own = sectionsForVariant(variant, sections);
  const counts = new Map<number, number>();
  for (const row of rows) {
    counts.set(row.exam_section_id, (counts.get(row.exam_section_id) ?? 0) + 1);
  }
  const foreign = [...counts.keys()].filter(
    (id) => !own.some((section) => section.id === id),
  );

  const statuses: Record<PublishStatus, number> = {
    draft: 0,
    review: 0,
    published: 0,
    archived: 0,
  };
  for (const row of rows) statuses[row.status] += 1;

  let unitTotal: number | null = 0;
  for (const row of rows) {
    const course = courses?.find((item) => item.id === row.course_id);
    if (course === undefined) {
      unitTotal = null;
      break;
    }
    unitTotal += course.unit_count;
  }

  return {
    courseCount: rows.length,
    requiredCount: rows.filter((row) => row.is_required).length,
    freeCount: rows.filter((row) => row.access === "free").length,
    premiumCount: rows.filter((row) => row.access === "premium").length,
    sections: [
      ...own.map((section) => ({
        id: section.id,
        name: section.name,
        count: counts.get(section.id) ?? 0,
      })),
      ...foreign.map((id) => ({
        id,
        name:
          sections.find((section) => section.id === id)?.name ??
          `Oturum #${id}`,
        count: counts.get(id) ?? 0,
      })),
    ],
    weightTotal: rows.reduce((sum, row) => sum + (row.exam_weight ?? 0), 0),
    weightMissing: rows.filter((row) => row.exam_weight === null).length,
    statuses,
    unitTotal: courses === undefined ? null : unitTotal,
  };
}

/**
 * Every signal for one variant's rows — the saved mapping or the editor's
 * unsaved list. `unitsByCourse` (optional) adds the published-unit check for
 * the courses whose unit list is loaded.
 */
export function curriculumSignals(
  variant: CurriculumVariant,
  rows: readonly CurriculumRow[],
  sections: readonly CurriculumSection[],
  courses: readonly Course[] | undefined,
  unitsByCourse?: ReadonlyMap<number, readonly Unit[]>,
): CurriculumSignal[] {
  const signals: CurriculumSignal[] = [];
  const add = (signal: CurriculumSignal) => signals.push(signal);

  if (!variant.is_active) {
    add({
      id: "inactive",
      kind: "inactive_variant",
      severity: "warning",
      message:
        "Varyant pasif: öğrencilerin sınav kataloğunda listelenmez. Kasıtlı olabilir.",
    });
  }
  if (rows.length === 0) {
    add({
      id: "empty",
      kind: "empty_mapping",
      severity: "warning",
      message: "Bu varyantta eşlenmiş ders yok.",
    });
  }

  // Same course more than once — only possible in an unsaved list (the
  // backend keeps (variant, course) unique); the save would be refused.
  const seen = new Map<number, number>();
  for (const row of rows) {
    seen.set(row.course_id, (seen.get(row.course_id) ?? 0) + 1);
  }
  for (const [courseId, count] of seen) {
    if (count > 1) {
      add({
        id: `duplicate-${courseId}`,
        kind: "duplicate_course",
        severity: "error",
        courseId,
        message: `${rows.find((row) => row.course_id === courseId)?.name ?? `Ders #${courseId}`} listede ${count} kez var; kaydedilemez.`,
      });
    }
  }

  const ownSectionIds = new Set(
    sectionsForVariant(variant, sections).map((section) => section.id),
  );
  for (const row of rows) {
    const course = courses?.find((item) => item.id === row.course_id);

    if (!ownSectionIds.has(row.exam_section_id)) {
      const section = sections.find((item) => item.id === row.exam_section_id);
      add({
        id: `section-${row.course_id}`,
        kind: "section_mismatch",
        severity: "error",
        courseId: row.course_id,
        message:
          section === undefined
            ? `${row.name}: oturum (#${row.exam_section_id}) seçenek listesinde yok.`
            : `${row.name}: "${section.name}" oturumu bu varyantın sınavına ait değil.`,
      });
    }

    if (row.status !== "published") {
      add({
        id: `status-${row.course_id}`,
        kind: "course_not_published",
        severity: "warning",
        courseId: row.course_id,
        message: `${row.name} ${publishStatusLabels[row.status].toLocaleLowerCase("tr")} durumda; öğrenci tarafında yayında olmayan ders olarak listelenir. "Yakında" gibi kasıtlı bir durum olabilir.`,
      });
    }

    if (courses !== undefined && course === undefined) {
      add({
        id: `unknown-${row.course_id}`,
        kind: "unknown_course",
        severity: "warning",
        courseId: row.course_id,
        message: `${row.name} ders listesinde bulunamadı; ünite sayısı bilinmiyor.`,
      });
    }

    if (row.is_required && course !== undefined) {
      if (course.unit_count === 0) {
        add({
          id: `no-units-${row.course_id}`,
          kind: "required_no_units",
          severity: "error",
          courseId: row.course_id,
          message: `${row.name} zorunlu ama hiç ünitesi yok.`,
        });
      } else {
        const units = unitsByCourse?.get(row.course_id);
        if (
          units !== undefined &&
          !units.some((unit) => unit.status === "published")
        ) {
          add({
            id: `no-published-${row.course_id}`,
            kind: "required_no_published_units",
            severity: "warning",
            courseId: row.course_id,
            message: `${row.name} zorunlu; ${units.length} ünitesinden hiçbiri yayında değil.`,
          });
        }
      }
    }

    if (
      row.is_required &&
      (row.exam_weight === null || row.exam_weight === 0)
    ) {
      const othersWeighted = rows.some(
        (other) =>
          other.course_id !== row.course_id &&
          other.exam_weight !== null &&
          other.exam_weight > 0,
      );
      if (othersWeighted || row.exam_weight === 0) {
        add({
          id: `weight-${row.course_id}`,
          kind: "missing_weight",
          severity: "warning",
          courseId: row.course_id,
          message:
            row.exam_weight === 0
              ? `${row.name} zorunlu ama sınav ağırlığı 0.`
              : `${row.name} zorunlu ve sınav ağırlığı boş; aynı varyanttaki başka derslerde ağırlık var.`,
        });
      }
    }
  }

  // Order is per section (the backend's index is variant + section + order);
  // equal numbers leave the order between those courses undefined.
  const bySectionOrder = new Map<string, CurriculumRow[]>();
  for (const row of rows) {
    const key = `${row.exam_section_id}:${row.sort_order}`;
    bySectionOrder.set(key, [...(bySectionOrder.get(key) ?? []), row]);
  }
  for (const [key, group] of bySectionOrder) {
    if (group.length > 1) {
      add({
        id: `order-${key}`,
        kind: "duplicate_sort_order",
        severity: "warning",
        courseId: group[0]!.course_id,
        message: `${group.map((row) => row.name).join(", ")} aynı oturumda aynı sıra numarasına (${group[0]!.sort_order}) sahip; aralarındaki sıra belirsiz.`,
      });
    }
  }

  return signals.sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) ||
      curriculumSignalKinds.indexOf(a.kind) -
        curriculumSignalKinds.indexOf(b.kind),
  );
}

export function countSignals(signals: readonly CurriculumSignal[]) {
  return {
    errors: signals.filter((signal) => signal.severity === "error").length,
    warnings: signals.filter((signal) => signal.severity === "warning").length,
  };
}

/** Signals per row, for the editor table's badges. */
export function signalsByCourse(
  signals: readonly CurriculumSignal[],
): ReadonlyMap<number, CurriculumSignal[]> {
  const map = new Map<number, CurriculumSignal[]>();
  for (const signal of signals) {
    if (signal.courseId === undefined) continue;
    map.set(signal.courseId, [...(map.get(signal.courseId) ?? []), signal]);
  }
  return map;
}
