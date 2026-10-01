import { describe, expect, it } from "vitest";

import type { CourseTopicsData } from "@/contracts/admin/exercise-editor";
import {
  applyCoverageFilters,
  buildCourseMatrix,
  buildCoverageRows,
  buildScopeMatrix,
  countByCoverageState,
  courseScanIncomplete,
  coverageCsvColumns,
  coverageViewLabels,
  DEFAULT_COVERAGE_STATE,
  gradeOptions,
  matrixCsvColumns,
  matrixScopes,
  parentOptions,
  parseCoverageState,
  serializeCoverageState,
  sortCoverageRows,
  type CoverageRow,
  type CoverageState,
} from "@/features/analytics/coverage-model";
import type { ContentSnapshot } from "@/features/content/content-snapshot";
import type { ApiError } from "@/lib/api/error";
import { toCsv } from "@/lib/export/csv";
import { healthSnapshot, snapshotExercise } from "@/test/fixtures/health";
import { qualityCourse } from "@/test/fixtures/quality";

const serverError: ApiError = { kind: "server", status: 500, message: "x" };

const topics: CourseTopicsData = {
  course: { id: 1, name: "TYT Tarih" },
  subject_id: 7,
  topics: [
    {
      id: 1,
      code: "ilk_cag",
      name: "İlk Çağ",
      grade_level: 9,
      exercise_count: 30,
    },
    {
      id: 2,
      code: "orta_cag",
      name: "Orta Çağ",
      parent_id: 1,
      grade_level: 9,
      exercise_count: 12,
    },
    {
      id: 3,
      code: "osmanli",
      name: "Osmanlı",
      parent_id: 1,
      grade_level: 10,
      exercise_count: 4,
    },
    { id: 4, code: "cumhuriyet", name: "Cumhuriyet", exercise_count: 0 },
    { id: 5, code: "kayip", name: "Kayıp", parent_id: 99, exercise_count: 1 },
  ],
};

/** Snapshot: course 1 has 2 questions of topic 1, course 2 has 1 of topic 1. */
function snapshot(overrides: Partial<ContentSnapshot> = {}): ContentSnapshot {
  return {
    ...healthSnapshot(),
    exercises: [
      snapshotExercise(100, 1, 10, {
        topic: { id: 1, name: "İlk Çağ" },
        scopes: ["tyt", "ayt"],
      }),
      snapshotExercise(101, 1, 10, {
        topic: { id: 1, name: "İlk Çağ" },
        scopes: ["tyt"],
      }),
      snapshotExercise(102, 1, 10, {
        topic: { id: 3, name: "Osmanlı" },
        scopes: [],
      }),
      snapshotExercise(200, 2, 20, {
        topic: { id: 1, name: "İlk Çağ" },
        scopes: ["ayt"],
      }),
    ],
    ...overrides,
  };
}

function ids(rows: readonly CoverageRow[]): number[] {
  return rows.map((row) => row.topic.id);
}

const rows = buildCoverageRows(topics, null);

describe("buildCoverageRows", () => {
  it("joins parents, keeps backend counts and classifies them", () => {
    expect(
      rows.map((row) => [
        row.topic.id,
        row.parentName,
        row.backendCount,
        row.scannedCount,
        row.state,
      ]),
    ).toEqual([
      [1, null, 30, null, "good"],
      [2, "İlk Çağ", 12, null, "medium"],
      [3, "İlk Çağ", 4, null, "low"],
      [4, null, 0, null, "none"],
      // A parent outside the list is named by id, never dropped.
      [5, "Konu #99", 1, null, "low"],
    ]);
  });

  it("counts only this course's scanned questions, and 0 — not unknown — for none", () => {
    const scanned = buildCoverageRows(topics, snapshot());

    expect(scanned.map((row) => [row.topic.id, row.scannedCount])).toEqual([
      [1, 2],
      [2, 0],
      [3, 1],
      [4, 0],
      [5, 0],
    ]);
    // The band always follows the backend count, never the scanned one.
    expect(scanned.map((row) => row.state)).toEqual(
      rows.map((row) => row.state),
    );
    expect(scanned.every((row) => !row.scannedIncomplete)).toBe(true);
  });

  it("marks scanned counts as possibly low when this course's lists failed", () => {
    const failed = buildCoverageRows(
      topics,
      snapshot({
        status: "partial",
        errors: [
          {
            kind: "unit",
            courseId: 1,
            unitId: 11,
            title: "Zaman",
            error: serverError,
          },
        ],
      }),
    );

    expect(failed.every((row) => row.scannedIncomplete)).toBe(true);
  });
});

describe("courseScanIncomplete", () => {
  it.each([
    [{ kind: "courses" as const, error: serverError }, true],
    [{ kind: "course" as const, courseId: 1, error: serverError }, true],
    [{ kind: "course" as const, courseId: 2, error: serverError }, false],
    [
      {
        kind: "unit" as const,
        courseId: 2,
        unitId: 20,
        title: "x",
        error: serverError,
      },
      false,
    ],
  ])("judges %j for course 1", (error, expected) => {
    expect(courseScanIncomplete(snapshot({ errors: [error] }), 1)).toBe(
      expected,
    );
  });
});

describe("filters, views and sorting", () => {
  it("counts every band", () => {
    expect(countByCoverageState(rows)).toEqual({
      none: 1,
      low: 2,
      medium: 1,
      good: 1,
    });
  });

  it.each<[Partial<CoverageState>, number[]]>([
    [{}, [1, 2, 3, 4, 5]],
    [{ view: "empty" }, [4]],
    [{ view: "under_medium" }, [3, 4, 5]],
    [{ view: "under_good" }, [2, 3, 4, 5]],
    [{ grade: 9 }, [1, 2]],
    [{ grade: "none" }, [4, 5]],
    [{ parent: 1 }, [2, 3]],
    [{ parent: "root" }, [1, 4]],
    [{ query: "çağ" }, [1, 2]],
    [{ query: "OSMANLI" }, [3]],
    [{ query: "cumhur" }, [4]],
    [{ query: "  " }, [1, 2, 3, 4, 5]],
    [{ view: "under_good", grade: 9 }, [2]],
  ])("filters %j", (filters, expected) => {
    expect(
      ids(
        applyCoverageFilters(rows, { ...DEFAULT_COVERAGE_STATE, ...filters }),
      ),
    ).toEqual(expected);
  });

  it("matches search accent- and case-insensitively", () => {
    expect(
      ids(
        applyCoverageFilters(rows, {
          ...DEFAULT_COVERAGE_STATE,
          query: "osmanli",
        }),
      ),
    ).toEqual([3]);
    expect(
      ids(
        applyCoverageFilters(rows, { ...DEFAULT_COVERAGE_STATE, query: "İLK" }),
      ),
    ).toEqual([1]);
  });

  it("labels the threshold views from the central config", () => {
    expect(coverageViewLabels).toEqual({
      all: "Tümü",
      empty: "Yalnız boş",
      under_medium: "10 altı",
      under_good: "25 altı",
    });
  });

  it("sorts and keeps curriculum order on ties", () => {
    expect(ids(sortCoverageRows(rows, "order"))).toEqual([1, 2, 3, 4, 5]);
    expect(ids(sortCoverageRows(rows, "count_asc"))).toEqual([4, 5, 3, 2, 1]);
    expect(ids(sortCoverageRows(rows, "count_desc"))).toEqual([1, 2, 3, 5, 4]);
    expect(ids(sortCoverageRows(rows, "name"))).toEqual([4, 1, 5, 2, 3]);
    expect(sortCoverageRows(rows, "order")).not.toBe(rows);
  });

  it("offers grades and parent topics that exist", () => {
    expect(gradeOptions(rows)).toEqual([9, 10]);
    expect(parentOptions(rows)).toEqual([
      { id: 1, name: "İlk Çağ" },
      { id: 99, name: "Konu #99" },
    ]);
  });
});

describe("matrices", () => {
  const courses = [
    qualityCourse(1, { name: "TYT Tarih", scope: "tyt" }),
    qualityCourse(2, { name: "AYT Tarih", scope: "ayt" }),
  ];

  it("counts topic × course from the snapshot only", () => {
    const matrix = buildCourseMatrix(courses, snapshot());

    expect(matrix.columns.map((column) => column.label)).toEqual([
      "TYT Tarih",
      "AYT Tarih",
    ]);
    expect(matrix.cell(1, "1")).toBe(2);
    expect(matrix.cell(1, "2")).toBe(1);
    expect(matrix.cell(4, "1")).toBe(0);
  });

  it("never splits the backend count: without a snapshot every cell is unknown", () => {
    expect(buildCourseMatrix(courses, null).cell(1, "1")).toBeNull();
    expect(buildScopeMatrix(["tyt"], null).cell(1, "tyt")).toBeNull();
  });

  it("flags course columns whose lists failed", () => {
    const matrix = buildCourseMatrix(
      courses,
      snapshot({
        errors: [{ kind: "course", courseId: 2, error: serverError }],
      }),
    );

    expect(matrix.columns.map((column) => column.incomplete)).toEqual([
      false,
      true,
    ]);
  });

  it("counts topic × scope, a multi-scope question in each of its scopes", () => {
    const matrix = buildScopeMatrix(["tyt", "ayt"], snapshot());

    expect(matrix.cell(1, "tyt")).toBe(2);
    expect(matrix.cell(1, "ayt")).toBe(2);
    expect(matrix.cell(3, "tyt")).toBe(0);
    expect(matrix.columns.map((column) => column.label)).toEqual([
      "TYT",
      "AYT",
    ]);
  });

  it("flags scope columns of a partial snapshot", () => {
    const matrix = buildScopeMatrix(["tyt"], snapshot({ status: "partial" }));

    expect(matrix.columns[0]?.incomplete).toBe(true);
  });

  it("picks scope columns from the courses and the scanned questions, in enum order", () => {
    expect(matrixScopes(new Set([1]), [courses[0]!], snapshot())).toEqual([
      "tyt",
      "ayt",
    ]);
    expect(matrixScopes(new Set([3]), [courses[1]!], null)).toEqual(["ayt"]);
  });
});

describe("CSV", () => {
  it("exports the table, leaving unknown scanned counts empty", () => {
    const csv = toCsv(rows.slice(0, 2), coverageCsvColumns("TYT Tarih")).split(
      "\r\n",
    );

    expect(csv[0]).toBe(
      "Ders,Konu,Konu kodu,Üst konu,Sınıf,Backend soru sayısı,Bu dersin taranan sorusu,Taranan sayı eksik olabilir,Kapsam durumu",
    );
    expect(csv[1]).toBe("TYT Tarih,İlk Çağ,ilk_cag,,9,30,,,İyi");
    expect(csv[2]).toBe("TYT Tarih,Orta Çağ,orta_cag,İlk Çağ,9,12,,,Orta");
  });

  it("exports scanned counts and their completeness", () => {
    const scanned = buildCoverageRows(
      topics,
      snapshot({
        errors: [{ kind: "course", courseId: 1, error: serverError }],
      }),
    );

    expect(
      toCsv(scanned.slice(0, 1), coverageCsvColumns("TYT Tarih")).split(
        "\r\n",
      )[1],
    ).toBe("TYT Tarih,İlk Çağ,ilk_cag,,9,30,2,Evet,İyi");
  });

  it("exports a matrix with unknown cells left empty", () => {
    const unknown = buildCourseMatrix(
      [qualityCourse(1, { name: "TYT Tarih" })],
      null,
    );
    const known = buildCourseMatrix(
      [qualityCourse(1, { name: "TYT Tarih" })],
      snapshot(),
    );

    expect(
      toCsv(rows.slice(0, 1), matrixCsvColumns(unknown)).split("\r\n"),
    ).toEqual([
      "Konu,Backend soru sayısı (konu geneli),TYT Tarih",
      "İlk Çağ,30,",
    ]);
    expect(
      toCsv(rows.slice(0, 1), matrixCsvColumns(known)).split("\r\n")[1],
    ).toBe("İlk Çağ,30,2");
  });
});

describe("URL state", () => {
  it("parses an empty query as the default view", () => {
    expect(parseCoverageState(new URLSearchParams())).toEqual(
      DEFAULT_COVERAGE_STATE,
    );
  });

  it("round-trips every field", () => {
    const state: CoverageState = {
      courseId: 3,
      view: "under_good",
      grade: 11,
      parent: 7,
      query: "vektör",
      sort: "count_asc",
      mode: "scope",
    };

    expect(
      parseCoverageState(new URLSearchParams(serializeCoverageState(state))),
    ).toEqual(state);
  });

  it("round-trips the special grade and parent values", () => {
    const state: CoverageState = {
      ...DEFAULT_COVERAGE_STATE,
      grade: "none",
      parent: "root",
    };

    expect(serializeCoverageState(state)).toBe("grade=none&parent=root");
    expect(
      parseCoverageState(new URLSearchParams("grade=none&parent=root")),
    ).toEqual(state);
  });

  it("drops invalid values and leaves defaults out of the URL", () => {
    expect(
      parseCoverageState(
        new URLSearchParams(
          "course=x&view=odd&grade=abc&parent=-1&sort=up&mode=pie",
        ),
      ),
    ).toEqual(DEFAULT_COVERAGE_STATE);
    expect(serializeCoverageState(DEFAULT_COVERAGE_STATE)).toBe("");
  });

  it("caps and trims the search", () => {
    expect(
      parseCoverageState(new URLSearchParams(`q=${"a".repeat(150)}`)).query,
    ).toHaveLength(100);
    expect(
      serializeCoverageState({ ...DEFAULT_COVERAGE_STATE, query: "  çağ " }),
    ).toBe("q=%C3%A7a%C4%9F");
  });
});
