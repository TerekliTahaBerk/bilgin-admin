import { describe, expect, it } from "vitest";

import type { Unit } from "@/contracts/admin/content";
import {
  applyPublishingFilters,
  blockingCount,
  buildPublishingRows,
  countByCategory,
  DEFAULT_PUBLISHING_SORT,
  groupByCategory,
  nodeCount,
  parsePublishingState,
  serializePublishingState,
  sortPublishingRows,
  warningCount,
  type PublishingRow,
  type PublishingSort,
  type PublishingViewState,
} from "@/features/content/publishing-model";
import type { UnitReadinessSnapshot } from "@/features/content/use-readiness-snapshots";
import { qualityCourse, qualityUnit } from "@/test/fixtures/quality";
import {
  nodePreview,
  readinessSnapshot,
  unitNode,
} from "@/test/fixtures/publishing";

const courses = [
  qualityCourse(1, { name: "TYT Tarih" }),
  qualityCourse(2, { name: "AYT Fizik" }),
];

const unitsByCourse = new Map<number, readonly Unit[]>([
  [
    1,
    [
      qualityUnit(10, {
        title: "Zaman",
        sort_order: 1,
        status: "draft",
        exercise_count: 12,
        node_count: 2,
      }),
      qualityUnit(11, {
        title: "Anadolu",
        sort_order: 2,
        status: "published",
        exercise_count: 40,
        node_count: 1,
      }),
    ],
  ],
  [
    2,
    [
      qualityUnit(20, {
        title: "Kuvvet",
        sort_order: 1,
        status: "review",
        exercise_count: 5,
        node_count: 2,
      }),
      qualityUnit(21, {
        title: "Dalgalar",
        sort_order: 2,
        status: "draft",
        exercise_count: 30,
        node_count: 3,
      }),
    ],
  ],
]);

const snapshots = new Map<number, UnitReadinessSnapshot>([
  // Unit 10: two nodes, both pass cleanly → ready.
  [
    10,
    readinessSnapshot(
      10,
      [unitNode(101), unitNode(102)],
      [nodePreview(101), nodePreview(102)],
    ),
  ],
  // Unit 11: published; one relaxed node → published, 1 warning.
  [
    11,
    readinessSnapshot(
      11,
      [unitNode(111)],
      [nodePreview(111, { relaxed: true })],
    ),
  ],
  // Unit 20: one of two nodes answered → unknown.
  [
    20,
    readinessSnapshot(20, [unitNode(201), unitNode(202)], [nodePreview(201)]),
  ],
  // Unit 21: two failing nodes → blocked.
  [
    21,
    readinessSnapshot(
      21,
      [unitNode(211), unitNode(212), unitNode(213)],
      [
        nodePreview(211, { available: 1 }),
        nodePreview(212, { available: 0 }),
        nodePreview(213),
      ],
    ),
  ],
]);

const rows = buildPublishingRows(courses, unitsByCourse, snapshots);

function ids(list: readonly PublishingRow[]): number[] {
  return list.map((row) => row.unit.id);
}

describe("buildPublishingRows", () => {
  it("lists every unit in catalogue order with its category", () => {
    expect(
      rows.map((row) => [row.unit.id, row.course.id, row.category]),
    ).toEqual([
      [10, 1, "ready"],
      [11, 1, "published"],
      [20, 2, "unknown"],
      [21, 2, "blocked"],
    ]);
  });

  it("treats a unit without a snapshot as unknown", () => {
    const [row] = buildPublishingRows(
      [courses[0]!],
      new Map([[1, [qualityUnit(10, { status: "draft" })]]]),
      new Map(),
    );

    expect(row?.category).toBe("unknown");
    expect(row?.snapshot).toBeUndefined();
  });

  it("skips courses whose unit list is not loaded", () => {
    expect(buildPublishingRows(courses, new Map([[2, []]]), new Map())).toEqual(
      [],
    );
  });
});

describe("row counts", () => {
  it("reads blocking and warning counts from the backend verdicts", () => {
    const byId = new Map(rows.map((row) => [row.unit.id, row]));

    expect(blockingCount(byId.get(21)!)).toBe(2);
    expect(blockingCount(byId.get(10)!)).toBe(0);
    expect(warningCount(byId.get(11)!)).toBe(1);
    expect(warningCount(byId.get(10)!)).toBe(0);
  });

  it("claims zero only once every node answered", () => {
    const byId = new Map(rows.map((row) => [row.unit.id, row]));

    // One of two nodes answered and it passed: not "0 blocking" yet.
    expect(blockingCount(byId.get(20)!)).toBeNull();
    expect(warningCount(byId.get(20)!)).toBeNull();

    // A known failure is a fact even while other nodes are unanswered.
    const [partlyFailing] = buildPublishingRows(
      [courses[0]!],
      new Map([[1, [qualityUnit(30)]]]),
      new Map([
        [
          30,
          readinessSnapshot(
            30,
            [unitNode(301), unitNode(302)],
            [nodePreview(301, { available: 0 })],
          ),
        ],
      ]),
    );
    expect(blockingCount(partlyFailing!)).toBe(1);
  });

  it("returns null — not zero — when nothing is known", () => {
    const [row] = buildPublishingRows(
      [courses[0]!],
      new Map([[1, [qualityUnit(10)]]]),
      new Map([[10, readinessSnapshot(10, null)]]),
    );

    expect(blockingCount(row!)).toBeNull();
    expect(warningCount(row!)).toBeNull();
  });

  it("uses the loaded node list for the node count, else the unit list's", () => {
    const [loaded] = rows;
    const [unloaded] = buildPublishingRows(
      [courses[0]!],
      new Map([[1, [qualityUnit(10, { node_count: 7 })]]]),
      new Map(),
    );

    expect(nodeCount(loaded!)).toBe(2);
    expect(nodeCount(unloaded!)).toBe(7);
  });
});

describe("applyPublishingFilters / countByCategory", () => {
  it.each([
    [{ categories: [] }, [10, 11, 20, 21]],
    [{ courseId: 2, categories: [] }, [20, 21]],
    [{ status: "draft" as const, categories: [] }, [10, 21]],
    [{ categories: ["blocked" as const] }, [21]],
    [{ categories: ["ready" as const, "published" as const] }, [10, 11]],
    [{ courseId: 1, categories: ["blocked" as const] }, []],
  ])("filters %j", (filters, expected) => {
    expect(ids(applyPublishingFilters(rows, filters))).toEqual(expected);
  });

  it("counts every category, including empty ones", () => {
    expect(countByCategory(rows)).toEqual({
      ready: 1,
      relaxed: 0,
      blocked: 1,
      unknown: 1,
      published: 1,
    });
  });
});

describe("sortPublishingRows", () => {
  const order = (sort: PublishingSort) => ids(sortPublishingRows(rows, sort));

  it("defaults to catalogue order", () => {
    expect(order(DEFAULT_PUBLISHING_SORT)).toEqual([10, 11, 20, 21]);
    expect(order({ key: "course", direction: "desc" })).toEqual([
      21, 20, 11, 10,
    ]);
  });

  it("puts units with an unknown blocking count last in both directions", () => {
    const unknown = buildPublishingRows(
      [courses[0]!],
      new Map([[1, [qualityUnit(99, { sort_order: 0 })]]]),
      new Map(),
    );
    const all = [...rows, ...unknown];
    const sorted = (direction: "asc" | "desc") =>
      ids(sortPublishingRows(all, { key: "blocking", direction }));

    // Unit 20 is only partly checked, so its count is unknown too.
    expect(sorted("desc")).toEqual([21, 10, 11, 99, 20]);
    expect(sorted("asc")).toEqual([10, 11, 21, 99, 20]);
  });

  it("sorts by exercise count", () => {
    expect(order({ key: "exercises", direction: "desc" })).toEqual([
      11, 21, 10, 20,
    ]);
    expect(order({ key: "exercises", direction: "asc" })).toEqual([
      20, 10, 21, 11,
    ]);
  });

  it("sorts by unit title in Turkish order", () => {
    expect(order({ key: "unit", direction: "asc" })).toEqual([11, 21, 20, 10]);
  });

  it("returns a new array", () => {
    const sorted = sortPublishingRows(rows, DEFAULT_PUBLISHING_SORT);
    expect(sorted).not.toBe(rows);
  });
});

describe("groupByCategory", () => {
  it("groups in the fixed category order and drops empty groups", () => {
    expect(
      groupByCategory(rows).map((group) => [group.category, ids(group.rows)]),
    ).toEqual([
      ["ready", [10]],
      ["blocked", [21]],
      ["unknown", [20]],
      ["published", [11]],
    ]);
  });

  it("keeps the given order inside a group", () => {
    const sorted = sortPublishingRows(rows, {
      key: "course",
      direction: "desc",
    });
    const both = sorted.map((row) => ({ ...row, category: "ready" as const }));

    expect(ids(groupByCategory(both)[0]!.rows)).toEqual([21, 20, 11, 10]);
  });
});

describe("URL state", () => {
  it("parses an empty query as the default view", () => {
    expect(parsePublishingState(new URLSearchParams())).toEqual({
      filters: { categories: [] },
      sort: DEFAULT_PUBLISHING_SORT,
    });
  });

  it("round-trips every field", () => {
    const state: PublishingViewState = {
      filters: {
        courseId: 3,
        status: "review",
        categories: ["ready", "blocked"],
      },
      sort: { key: "blocking", direction: "desc" },
    };
    const query = serializePublishingState(state);

    expect(query).toBe(
      "course=3&status=review&show=ready%2Cblocked&sort=blocking&dir=desc",
    );
    expect(parsePublishingState(new URLSearchParams(query))).toEqual(state);
  });

  it("orders and de-duplicates categories, dropping unknown ones", () => {
    expect(
      parsePublishingState(
        new URLSearchParams("show=published,nope,ready,ready"),
      ).filters.categories,
    ).toEqual(["ready", "published"]);
  });

  it("drops invalid values instead of failing", () => {
    expect(
      parsePublishingState(
        new URLSearchParams("course=abc&status=gone&sort=name&dir=up"),
      ),
    ).toEqual({ filters: { categories: [] }, sort: DEFAULT_PUBLISHING_SORT });
  });

  it("leaves the default view out of the URL", () => {
    expect(
      serializePublishingState({
        filters: { categories: [] },
        sort: DEFAULT_PUBLISHING_SORT,
      }),
    ).toBe("");
  });

  it("defaults the direction to ascending", () => {
    expect(parsePublishingState(new URLSearchParams("sort=unit")).sort).toEqual(
      { key: "unit", direction: "asc" },
    );
  });
});
