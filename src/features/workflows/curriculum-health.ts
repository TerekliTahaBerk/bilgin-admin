import type { Course, PublishStatus, Unit } from "@/contracts/admin/content";
import type {
  CurriculumOptions,
  CurriculumRow,
} from "@/contracts/admin/workflows";
import { publishStatusLabels } from "@/features/content/content-labels";

/*
 | Curriculum Health and pre-save validation — one set of rules, read from
 | the existing curriculum endpoints only: options (variants, sections), each
 | variant's course mapping, the course list (status, unit_count) and, for
 | the variant being edited, its courses' unit lists.
 |
 | "error" — certainly wrong in the list itself; in the editor it BLOCKS the
 |   save:
 |   - the same course more than once (the backend keeps variant+course
 |     unique),
 |   - an id that is not a positive integer,
 |   - a sort order below 1 or not an integer (backend: integer, min 1),
 |   - a weight outside the backend's integer 0–200,
 |   - a section of another exam (the backend only checks it exists),
 |   - an empty list (the backend requires at least one course; for a saved
 |     mapping, which can only be empty if never saved, this is a warning).
 | "warning" — may be intended, or the contract cannot tell; never blocks:
 |   required course without units or without a published unit, a draft or
 |   archived course (the learner read lists it as unpublished; a "Yakında"
 |   placeholder is not in the admin contract), a missing or unusual exam
 |   weight, a premium required course, an inactive variant, duplicate sort
 |   orders, a course missing from the course list.
 |
 | The backend's own validation stays the final word: these rules only stop
 | a save that is certain to be wrong, and the backend's errors after a save
 | are mapped back onto the rows.
 */

export type CurriculumVariant = CurriculumOptions["variants"][number];
export type CurriculumSection = CurriculumOptions["sections"][number];

export type HealthSeverity = "error" | "warning";

/** The editor field a signal is about, for inline marking. */
export type CurriculumField =
  | "course_id"
  | "exam_section_id"
  | "sort_order"
  | "access"
  | "exam_weight"
  | "is_required";

/**
 * Above this many questions a course's exam weight is unusual — the largest
 * single-subject YKS tests have 40 questions. A frontend heuristic: the
 * backend accepts up to 200.
 */
export const UNUSUAL_EXAM_WEIGHT_ABOVE = 60;
/** The backend's `exam_weight` rule: nullable integer, 0–200. */
export const EXAM_WEIGHT_MAX = 200;

export const curriculumSignalKinds = [
  "empty_mapping",
  "duplicate_course",
  "invalid_id",
  "invalid_sort_order",
  "invalid_weight",
  "section_mismatch",
  "inactive_variant",
  "required_no_units",
  "required_no_published_units",
  "course_not_published",
  "premium_required",
  "missing_weight",
  "unusual_weight",
  "duplicate_sort_order",
  "unknown_course",
] as const;
export type CurriculumSignalKind = (typeof curriculumSignalKinds)[number];

export const curriculumSignalLabels: Readonly<
  Record<CurriculumSignalKind, string>
> = {
  empty_mapping: "Eşlemede ders yok",
  duplicate_course: "Aynı ders birden fazla kez",
  invalid_id: "Geçersiz kimlik",
  invalid_sort_order: "Geçersiz sıra",
  invalid_weight: "Geçersiz sınav ağırlığı",
  section_mismatch: "Oturum uyumsuzluğu",
  inactive_variant: "Pasif varyant",
  required_no_units: "Zorunlu ders, ünitesiz",
  required_no_published_units: "Zorunlu ders, yayında ünite yok",
  course_not_published: "Ders yayında değil",
  premium_required: "Zorunlu ders premium",
  missing_weight: "Sınav ağırlığı eksik",
  unusual_weight: "Sınav ağırlığı olağandışı",
  duplicate_sort_order: "Aynı sıra numarası",
  unknown_course: "Ders listede bulunamadı",
};

export type CurriculumSignal = Readonly<{
  id: string;
  kind: CurriculumSignalKind;
  severity: HealthSeverity;
  message: string;
  /** The row the signal is about, when it is about one. */
  courseId?: number;
  /** The field of that row, when it is about one. */
  field?: CurriculumField;
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

const isPositiveId = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

export type SignalOptions = Readonly<{
  /**
   * "draft" is the editor's list about to be saved — an empty list is then a
   * blocking error. "saved" is a stored mapping (the overview).
   */
  mode: "saved" | "draft";
  /** Loaded unit lists, for the "no published unit" check. */
  unitsByCourse?: ReadonlyMap<number, readonly Unit[]>;
}>;

export function curriculumSignals(
  variant: CurriculumVariant,
  rows: readonly CurriculumRow[],
  sections: readonly CurriculumSection[],
  courses: readonly Course[] | undefined,
  { mode, unitsByCourse }: SignalOptions,
): CurriculumSignal[] {
  const signals: CurriculumSignal[] = [];
  const add = (signal: CurriculumSignal) => signals.push(signal);
  const nameOf = (row: CurriculumRow) =>
    row.name.trim() === "" ? `Ders #${row.course_id}` : row.name;

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
      severity: mode === "draft" ? "error" : "warning",
      message:
        mode === "draft"
          ? "Liste boş: en az bir ders olmadan kaydedilemez."
          : "Bu varyantta eşlenmiş ders yok.",
    });
  }

  const seen = new Map<number, number>();
  for (const row of rows) {
    seen.set(row.course_id, (seen.get(row.course_id) ?? 0) + 1);
  }
  for (const [courseId, count] of seen) {
    if (count > 1) {
      const row = rows.find((item) => item.course_id === courseId)!;
      add({
        id: `duplicate-${courseId}`,
        kind: "duplicate_course",
        severity: "error",
        courseId,
        field: "course_id",
        message: `${nameOf(row)} listede ${count} kez var; bir ders bir varyantta yalnızca bir kez olabilir.`,
      });
    }
  }

  const ownSectionIds = new Set(
    sectionsForVariant(variant, sections).map((section) => section.id),
  );
  const anyWeighted = rows.some(
    (row) => row.exam_weight !== null && row.exam_weight > 0,
  );

  for (const row of rows) {
    const course = courses?.find((item) => item.id === row.course_id);

    for (const field of ["course_id", "exam_section_id"] as const) {
      if (!isPositiveId(row[field])) {
        add({
          id: `id-${field}-${row.course_id}`,
          kind: "invalid_id",
          severity: "error",
          courseId: row.course_id,
          field,
          message: `${nameOf(row)}: ${field === "course_id" ? "ders" : "oturum"} kimliği geçersiz.`,
        });
      }
    }

    if (!Number.isInteger(row.sort_order) || row.sort_order < 1) {
      add({
        id: `sort-${row.course_id}`,
        kind: "invalid_sort_order",
        severity: "error",
        courseId: row.course_id,
        field: "sort_order",
        message: `${nameOf(row)}: sıra numarası 1 veya daha büyük bir tam sayı olmalı (şu an ${row.sort_order}).`,
      });
    }

    if (
      row.exam_weight !== null &&
      (!Number.isInteger(row.exam_weight) ||
        row.exam_weight < 0 ||
        row.exam_weight > EXAM_WEIGHT_MAX)
    ) {
      add({
        id: `weight-invalid-${row.course_id}`,
        kind: "invalid_weight",
        severity: "error",
        courseId: row.course_id,
        field: "exam_weight",
        message: `${nameOf(row)}: sınav ağırlığı 0 ile ${EXAM_WEIGHT_MAX} arasında bir tam sayı olmalı.`,
      });
    } else if (
      row.exam_weight !== null &&
      row.exam_weight > UNUSUAL_EXAM_WEIGHT_ABOVE
    ) {
      add({
        id: `weight-unusual-${row.course_id}`,
        kind: "unusual_weight",
        severity: "warning",
        courseId: row.course_id,
        field: "exam_weight",
        message: `${nameOf(row)}: sınav ağırlığı ${row.exam_weight}; tek bir ders için olağandışı yüksek (${UNUSUAL_EXAM_WEIGHT_ABOVE} üstü, uygulama içi eşik).`,
      });
    }

    if (
      isPositiveId(row.exam_section_id) &&
      !ownSectionIds.has(row.exam_section_id)
    ) {
      const section = sections.find((item) => item.id === row.exam_section_id);
      add({
        id: `section-${row.course_id}`,
        kind: "section_mismatch",
        severity: "error",
        courseId: row.course_id,
        field: "exam_section_id",
        message:
          section === undefined
            ? `${nameOf(row)}: oturum (#${row.exam_section_id}) seçenek listesinde yok.`
            : `${nameOf(row)}: "${section.name}" oturumu bu varyantın sınavına ait değil.`,
      });
    }

    if (row.status !== "published") {
      add({
        id: `status-${row.course_id}`,
        kind: "course_not_published",
        severity: "warning",
        courseId: row.course_id,
        message: `${nameOf(row)} ${publishStatusLabels[row.status].toLocaleLowerCase("tr")} durumda; öğrenci tarafında yayında olmayan ders olarak listelenir. "Yakında" gibi kasıtlı bir durum olabilir.`,
      });
    }

    if (courses !== undefined && course === undefined) {
      add({
        id: `unknown-${row.course_id}`,
        kind: "unknown_course",
        severity: "warning",
        courseId: row.course_id,
        field: "course_id",
        message: `${nameOf(row)} ders listesinde bulunamadı; ünite sayısı bilinmiyor.`,
      });
    }

    if (row.is_required) {
      if (course !== undefined && course.unit_count === 0) {
        add({
          id: `no-units-${row.course_id}`,
          kind: "required_no_units",
          severity: "warning",
          courseId: row.course_id,
          field: "is_required",
          message: `${nameOf(row)} zorunlu ama hiç ünitesi yok.`,
        });
      } else if (course !== undefined) {
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
            field: "is_required",
            message: `${nameOf(row)} zorunlu; ${units.length} ünitesinden hiçbiri yayında değil.`,
          });
        }
      }

      if (row.access === "premium") {
        add({
          id: `premium-${row.course_id}`,
          kind: "premium_required",
          severity: "warning",
          courseId: row.course_id,
          field: "access",
          message: `${nameOf(row)} zorunlu ama premium: ücretsiz öğrenciler zorunlu bir derse erişemez. Kasıtlı olabilir.`,
        });
      }

      if (row.exam_weight === null || row.exam_weight === 0) {
        if (anyWeighted || row.exam_weight === 0) {
          add({
            id: `weight-missing-${row.course_id}`,
            kind: "missing_weight",
            severity: "warning",
            courseId: row.course_id,
            field: "exam_weight",
            message:
              row.exam_weight === 0
                ? `${nameOf(row)} zorunlu ama sınav ağırlığı 0.`
                : `${nameOf(row)} zorunlu ve sınav ağırlığı boş; aynı varyanttaki başka derslerde ağırlık var.`,
          });
        }
      }
    }
  }

  if (rows.length > 0 && !anyWeighted) {
    add({
      id: "weight-none",
      kind: "missing_weight",
      severity: "warning",
      message:
        "Bu varyanttaki hiçbir derste sınav ağırlığı yok. Ağırlık kullanılmıyorsa sorun değildir.",
    });
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
        field: "sort_order",
        message: `${group.map(nameOf).join(", ")} aynı oturumda aynı sıra numarasına (${group[0]!.sort_order}) sahip; aralarındaki sıra belirsiz.`,
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

/** Whether a row's field carries a signal of the given severity. */
export function fieldSeverity(
  signals: readonly CurriculumSignal[] | undefined,
  field: CurriculumField,
): HealthSeverity | null {
  const matching = (signals ?? []).filter((signal) => signal.field === field);
  if (matching.some((signal) => signal.severity === "error")) return "error";
  return matching.length > 0 ? "warning" : null;
}

/* ------------------------------------------------- backend error map -- */

export type ServerRowErrors = Readonly<{
  /** Field messages per course id, from `courses.{index}.{field}`. */
  byCourse: ReadonlyMap<number, ReadonlyMap<string, readonly string[]>>;
  /** Messages that are not about one row. */
  general: readonly string[];
}>;

const ROW_FIELD = /^courses\.(\d+)\.([a-z_]+)$/;

/**
 * Maps a Laravel 422 `errors` object onto the rows that were sent:
 * `courses.3.exam_section_id` belongs to the fourth submitted row. Anything
 * else (`courses`, unknown keys) is a general message.
 */
export function mapServerErrors(
  fields: Readonly<Record<string, readonly string[]>> | undefined,
  submitted: readonly Pick<CurriculumRow, "course_id">[],
  fallbackMessage: string,
): ServerRowErrors {
  const byCourse = new Map<number, Map<string, string[]>>();
  const general: string[] = [];

  for (const [key, messages] of Object.entries(fields ?? {})) {
    const match = ROW_FIELD.exec(key);
    const row = match === null ? undefined : submitted[Number(match[1])];

    if (match === null || row === undefined) {
      general.push(...messages);
      continue;
    }

    const fieldsOfRow = byCourse.get(row.course_id) ?? new Map();
    fieldsOfRow.set(match[2]!, [
      ...(fieldsOfRow.get(match[2]!) ?? []),
      ...messages,
    ]);
    byCourse.set(row.course_id, fieldsOfRow);
  }

  if (byCourse.size === 0 && general.length === 0) {
    general.push(fallbackMessage);
  }

  return { byCourse, general };
}
