/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type { Course, Unit } from "@/contracts/admin/content";
import type {
  NodePreview,
  PublishUnitData,
  UnitNodesData,
} from "@/contracts/admin/publication";
import {
  coursesQueryKey,
  courseUnitsQueryKey,
  nodePreviewQueryKey,
  unitNodesQueryKey,
} from "@/features/content/content-queries";
import {
  DEFAULT_PUBLISHING_SORT,
  type PublishingViewState,
} from "@/features/content/publishing-model";
import type { ApiError } from "@/lib/api/error";
import { nodePreview, unitNode } from "@/test/fixtures/publishing";
import { qualityCourse, qualityUnit } from "@/test/fixtures/quality";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

const getCourses = vi.fn<() => Promise<Course[]>>();
const getCourseUnits = vi.fn<(courseId: number) => Promise<Unit[]>>();
const getUnitNodes = vi.fn<(unitId: number) => Promise<UnitNodesData>>();
const getNodePreview = vi.fn<(nodeId: number) => Promise<NodePreview>>();
const publishUnit = vi.fn<(unitId: number) => Promise<PublishUnitData>>();

vi.mock("@/features/content/content-client", () => ({
  getCourses: () => getCourses(),
  getCourseUnits: (courseId: number) => getCourseUnits(courseId),
  getUnitNodes: (unitId: number) => getUnitNodes(unitId),
  getNodePreview: (nodeId: number) => getNodePreview(nodeId),
  publishUnit: (unitId: number) => publishUnit(unitId),
}));

const { PublishingCenter } =
  await import("@/features/content/publishing-center");

const courses = [
  qualityCourse(1, { name: "TYT Tarih", unit_count: 2 }),
  qualityCourse(3, { name: "AYT Fizik", unit_count: 2 }),
];
const unitsByCourse: Record<number, Unit[]> = {
  1: [
    qualityUnit(11, {
      title: "İlk Çağ",
      status: "published",
      exercise_count: 44,
      sort_order: 1,
    }),
    qualityUnit(12, {
      title: "Zaman",
      status: "draft",
      exercise_count: 3,
      sort_order: 2,
    }),
  ],
  3: [
    qualityUnit(31, {
      title: "Vektörler",
      status: "draft",
      exercise_count: 7,
      sort_order: 1,
    }),
    qualityUnit(32, {
      title: "Dalgalar",
      status: "review",
      exercise_count: 1,
      sort_order: 2,
    }),
  ],
};
const nodesByUnit: Record<number, UnitNodesData> = {
  11: {
    unit: { id: 11, title: "İlk Çağ", status: "published" },
    nodes: [unitNode(111)],
  },
  12: {
    unit: { id: 12, title: "Zaman", status: "draft" },
    nodes: [unitNode(121)],
  },
  31: {
    unit: { id: 31, title: "Vektörler", status: "draft" },
    nodes: [unitNode(311), unitNode(312)],
  },
  32: {
    unit: { id: 32, title: "Dalgalar", status: "review" },
    nodes: [unitNode(321, { title: "Mini Challenge" })],
  },
};
const previews: Record<number, NodePreview> = {
  111: nodePreview(111),
  121: nodePreview(121),
  311: nodePreview(311),
  312: nodePreview(312, { relaxed: true }),
  321: nodePreview(321, {
    node_title: "Mini Challenge",
    required: 8,
    available: 2,
  }),
};

function apiError(kind: ApiError["kind"], status: number | null): ApiError {
  return { kind, status, message: "Beklenmeyen bir hata oluştu." };
}

let lastState: PublishingViewState | null = null;

function Harness({
  initial,
  canPublish,
}: {
  initial: PublishingViewState;
  canPublish: boolean;
}) {
  const [state, setState] = useState(initial);

  return (
    <PublishingCenter
      canPublish={canPublish}
      onChange={(next) => {
        lastState = next;
        setState(next);
      }}
      state={state}
    />
  );
}

function createClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderCenter({
  client = createClient(),
  initial = { filters: { categories: [] }, sort: DEFAULT_PUBLISHING_SORT },
  canPublish = false,
}: {
  client?: QueryClient;
  initial?: PublishingViewState;
  canPublish?: boolean;
} = {}) {
  render(
    <QueryClientProvider client={client}>
      <Harness canPublish={canPublish} initial={initial} />
    </QueryClientProvider>,
  );

  return client;
}

/** Seeds everything a full check would have read. */
function seedChecked(client: QueryClient) {
  client.setQueryData(coursesQueryKey, courses);
  for (const [courseId, units] of Object.entries(unitsByCourse)) {
    client.setQueryData(courseUnitsQueryKey(Number(courseId)), units);
  }
  for (const [unitId, data] of Object.entries(nodesByUnit)) {
    client.setQueryData(unitNodesQueryKey(Number(unitId)), data);
  }
  for (const [nodeId, preview] of Object.entries(previews)) {
    client.setQueryData(nodePreviewQueryKey(Number(nodeId)), preview);
  }
}

function group(name: RegExp) {
  return screen.getByRole("region", { name });
}

function cardTitles(region: HTMLElement) {
  return within(region)
    .getAllByRole("article")
    .map((article) => within(article).getByRole("heading").textContent);
}

beforeEach(() => {
  lastState = null;
  replace.mockReset();
  refresh.mockReset();
  getCourses.mockReset().mockResolvedValue(courses);
  getCourseUnits
    .mockReset()
    .mockImplementation(async (courseId) => unitsByCourse[courseId]!);
  getUnitNodes
    .mockReset()
    .mockImplementation(async (unitId) => nodesByUnit[unitId]!);
  getNodePreview
    .mockReset()
    .mockImplementation(async (nodeId) => previews[nodeId]!);
  publishUnit.mockReset();
});

describe("PublishingCenter states", () => {
  it("shows a loading state while courses load", () => {
    getCourses.mockImplementation(() => new Promise(() => {}));

    renderCenter();

    expect(screen.getByText("Yayın verileri yükleniyor.")).toBeDefined();
  });

  it("shows a retryable error", async () => {
    const user = userEvent.setup();
    getCourses.mockRejectedValueOnce(apiError("server", 500));

    renderCenter();

    expect(await screen.findByText("Dersler yüklenemedi")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(
      await screen.findByRole("heading", { name: "Hazırlık kontrolü" }),
    ).toBeDefined();
  });

  it("shows a forbidden state without a retry", async () => {
    getCourses.mockRejectedValue(apiError("authorization", 403));

    renderCenter();

    expect(
      await screen.findByText("Bu bölüme erişim yetkiniz yok"),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: "Tekrar dene" })).toBeNull();
  });

  it("redirects to login when the session has expired", async () => {
    getCourses.mockRejectedValue(apiError("authentication", 401));

    renderCenter();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(refresh).toHaveBeenCalled();
  });

  it("shows an empty state with no courses", async () => {
    getCourses.mockResolvedValue([]);

    renderCenter();

    expect(await screen.findByText("Henüz ders bulunmuyor.")).toBeDefined();
  });

  it("shows an empty state when the courses have no units", async () => {
    getCourseUnits.mockResolvedValue([]);

    renderCenter();

    expect(await screen.findByText("Henüz ünite bulunmuyor.")).toBeDefined();
  });

  it("reports a course whose unit list failed and retries it", async () => {
    const user = userEvent.setup();
    getCourseUnits.mockImplementation(async (courseId) => {
      if (courseId === 3) throw apiError("server", 500);
      return unitsByCourse[courseId]!;
    });

    renderCenter();

    expect(
      await screen.findByText("1 dersin ünite listesi yüklenemedi."),
    ).toBeDefined();

    getCourseUnits.mockImplementation(
      async (courseId) => unitsByCourse[courseId]!,
    );
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));

    await waitFor(() =>
      expect(
        screen.queryByText("1 dersin ünite listesi yüklenemedi."),
      ).toBeNull(),
    );
    expect(screen.getByRole("article", { name: "Vektörler" })).toBeDefined();
  });
});

describe("PublishingCenter readiness", () => {
  it("lists units without sending a single readiness request", async () => {
    renderCenter();

    const unknown = await screen.findByRole("region", {
      name: /Hazırlık durumu bilinmiyor/,
    });
    expect(cardTitles(unknown)).toEqual(["Zaman", "Vektörler", "Dalgalar"]);
    expect(cardTitles(group(/Zaten yayında/))).toEqual(["İlk Çağ"]);
    expect(getUnitNodes).not.toHaveBeenCalled();
    expect(getNodePreview).not.toHaveBeenCalled();
  });

  it("groups units from cached backend verdicts", async () => {
    const client = createClient();
    seedChecked(client);

    renderCenter({ client });

    expect(
      cardTitles(await screen.findByRole("region", { name: /^Yayına hazır/ })),
    ).toEqual(["Zaman"]);
    expect(cardTitles(group(/Gevşetilmiş kuralla hazır/))).toEqual([
      "Vektörler",
    ]);
    expect(cardTitles(group(/Bloklanmış/))).toEqual(["Dalgalar"]);
    expect(cardTitles(group(/Zaten yayında/))).toEqual(["İlk Çağ"]);
    expect(screen.queryByRole("region", { name: /bilinmiyor/ })).toBeNull();
    expect(getUnitNodes).not.toHaveBeenCalled();
    expect(getNodePreview).not.toHaveBeenCalled();
  });

  it("checks the unknown units on request, then groups them", async () => {
    const user = userEvent.setup();

    renderCenter();

    await user.click(
      await screen.findByRole("button", {
        name: "Bilinmeyenleri kontrol et (4 ünite)",
      }),
    );

    expect(await screen.findByText("Kontrol tamamlandı.")).toBeDefined();
    expect(getUnitNodes.mock.calls.map(([id]) => id).sort()).toEqual([
      11, 12, 31, 32,
    ]);
    expect(getNodePreview).toHaveBeenCalledTimes(5);
    expect(cardTitles(group(/Bloklanmış/))).toEqual(["Dalgalar"]);
    expect(
      screen.queryByRole("button", { name: /^Bilinmeyenleri kontrol et/ }),
    ).toBeNull();
  });

  it("re-checks every visible unit with fresh data on request", async () => {
    const user = userEvent.setup();
    const client = createClient();
    seedChecked(client);

    renderCenter({
      client,
      initial: {
        filters: { courseId: 3, categories: [] },
        sort: DEFAULT_PUBLISHING_SORT,
      },
    });

    await user.click(
      await screen.findByRole("button", {
        name: "Görünenleri yeniden kontrol et (2)",
      }),
    );

    expect(await screen.findByText("Kontrol tamamlandı.")).toBeDefined();
    expect(getUnitNodes.mock.calls.map(([id]) => id).sort()).toEqual([31, 32]);
    expect(getNodePreview).toHaveBeenCalledTimes(3);
  });

  it("checks a single unit from its card", async () => {
    const user = userEvent.setup();

    renderCenter();

    await user.click(
      await screen.findByRole("button", {
        name: "Dalgalar: hazırlığı kontrol et",
      }),
    );

    await waitFor(() =>
      expect(cardTitles(group(/Bloklanmış/))).toEqual(["Dalgalar"]),
    );
    expect(getUnitNodes.mock.calls).toEqual([[32]]);
  });

  it("reports units whose reads failed", async () => {
    const user = userEvent.setup();
    getNodePreview.mockImplementation(async (nodeId) => {
      if (nodeId === 321) throw apiError("server", 500);
      return previews[nodeId]!;
    });

    renderCenter();

    await user.click(
      await screen.findByRole("button", { name: /^Bilinmeyenleri kontrol et/ }),
    );

    expect(
      await screen.findByText(/1 ünitenin bazı adımları okunamadı/),
    ).toBeDefined();
    expect(cardTitles(group(/bilinmiyor/))).toEqual(["Dalgalar"]);
  });

  it("stops on a rate limit and explains it", async () => {
    const user = userEvent.setup();
    getUnitNodes.mockRejectedValue({
      ...apiError("rate_limit", 429),
      retryAfterSeconds: 30,
    });

    renderCenter();

    await user.click(
      await screen.findByRole("button", { name: /^Bilinmeyenleri kontrol et/ }),
    );

    expect(
      await screen.findByText(/30 saniye sonra tekrar deneyin/),
    ).toBeDefined();
  });

  it("redirects to login when the session expires during a check", async () => {
    const user = userEvent.setup();
    getUnitNodes.mockRejectedValue(apiError("authentication", 401));

    renderCenter();

    await user.click(
      await screen.findByRole("button", { name: /^Bilinmeyenleri kontrol et/ }),
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("can stop a running check", async () => {
    const user = userEvent.setup();
    const pending: (() => void)[] = [];
    getUnitNodes.mockImplementation(
      (unitId) =>
        new Promise((resolve) => {
          pending.push(() => resolve({ ...nodesByUnit[unitId]!, nodes: [] }));
        }),
    );

    renderCenter();

    await user.click(
      await screen.findByRole("button", { name: /^Bilinmeyenleri kontrol et/ }),
    );
    expect(
      screen.getByRole("progressbar", { name: "Kontrol ilerlemesi" }),
    ).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Kontrolü durdur" }));
    expect(screen.getByRole("button", { name: "Durduruluyor…" })).toBeDefined();

    for (const release of pending.splice(0)) release();

    expect(
      await screen.findByText(
        "Kontrol durduruldu. O ana kadar okunan sonuçlar kartlarda.",
      ),
    ).toBeDefined();
    expect(getUnitNodes).toHaveBeenCalledTimes(2);
  });
});

describe("PublishingCenter filters and sorting", () => {
  it("counts each category and toggles them", async () => {
    const user = userEvent.setup();
    const client = createClient();
    seedChecked(client);

    renderCenter({ client });

    const chips = await screen.findByRole("group", { name: "Hazırlık durumu" });
    expect(
      within(chips)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual([
      "Tümü",
      "Yayına hazır (1)",
      "Gevşetilmiş kuralla hazır (1)",
      "Bloklanmış (1)",
      "Hazırlık durumu bilinmiyor (0)",
      "Zaten yayında (1)",
    ]);

    await user.click(
      within(chips).getByRole("button", { name: "Zaten yayında (1)" }),
    );
    await user.click(
      within(chips).getByRole("button", { name: "Bloklanmış (1)" }),
    );
    expect(lastState?.filters.categories).toEqual(["blocked", "published"]);
    expect(screen.getAllByRole("article")).toHaveLength(2);

    await user.click(
      within(chips).getByRole("button", { name: "Bloklanmış (1)" }),
    );
    expect(lastState?.filters.categories).toEqual(["published"]);

    await user.click(within(chips).getByRole("button", { name: "Tümü" }));
    expect(lastState?.filters.categories).toEqual([]);
    expect(screen.getAllByRole("article")).toHaveLength(4);
  });

  it("filters by course and unit status", async () => {
    const user = userEvent.setup();
    const client = createClient();
    seedChecked(client);

    renderCenter({ client });

    await user.selectOptions(await screen.findByLabelText("Ders"), "3");
    expect(lastState?.filters).toEqual({ courseId: 3, categories: [] });
    expect(screen.getAllByRole("article")).toHaveLength(2);

    await user.selectOptions(screen.getByLabelText("Ünite durumu"), "review");
    expect(lastState?.filters).toEqual({
      courseId: 3,
      status: "review",
      categories: [],
    });
    expect(screen.getAllByRole("article")).toHaveLength(1);

    await user.selectOptions(screen.getByLabelText("Ders"), "");
    expect(lastState?.filters).toEqual({ status: "review", categories: [] });

    await user.selectOptions(screen.getByLabelText("Ünite durumu"), "");
    expect(lastState?.filters).toEqual({ categories: [] });
  });

  it("counts categories inside the course/status filter", async () => {
    const client = createClient();
    seedChecked(client);

    renderCenter({
      client,
      initial: {
        filters: { courseId: 1, categories: [] },
        sort: DEFAULT_PUBLISHING_SORT,
      },
    });

    expect(
      await screen.findByRole("button", { name: "Bloklanmış (0)" }),
    ).toBeDefined();
  });

  it("offers to clear filters that match nothing", async () => {
    const user = userEvent.setup();
    const client = createClient();
    seedChecked(client);

    renderCenter({
      client,
      initial: {
        filters: { courseId: 1, categories: ["blocked"] },
        sort: DEFAULT_PUBLISHING_SORT,
      },
    });

    expect(
      await screen.findByText("Bu filtrelerle eşleşen ünite bulunmuyor."),
    ).toBeDefined();
    await user.click(
      screen.getByRole("button", { name: "Filtreleri temizle" }),
    );
    expect(lastState?.filters).toEqual({ categories: [] });
  });

  it("sorts inside each group and flips direction", async () => {
    const user = userEvent.setup();
    const client = createClient();
    seedChecked(client);
    // Make two units blocked so there is an order to see.
    client.setQueryData(
      nodePreviewQueryKey(121),
      nodePreview(121, { available: 0 }),
    );

    renderCenter({ client });

    await screen.findByRole("region", { name: /Bloklanmış/ });
    expect(cardTitles(group(/Bloklanmış/))).toEqual(["Zaman", "Dalgalar"]);

    await user.selectOptions(screen.getByLabelText("Sırala"), "unit");
    expect(lastState?.sort).toEqual({ key: "unit", direction: "asc" });
    expect(cardTitles(group(/Bloklanmış/))).toEqual(["Dalgalar", "Zaman"]);

    await user.click(
      screen.getByRole("button", { name: "Artan sırada; azalan sıraya çevir" }),
    );
    expect(lastState?.sort).toEqual({ key: "unit", direction: "desc" });
    expect(cardTitles(group(/Bloklanmış/))).toEqual(["Zaman", "Dalgalar"]);
  });

  it("offers every sort key", async () => {
    renderCenter();

    expect(
      within(await screen.findByLabelText("Sırala"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Bloklayan adım sayısı", "Soru sayısı", "Ders", "Ünite adı"]);
  });
});

describe("PublishingCenter publishing", () => {
  it("shows no publish button without publish_content", async () => {
    const client = createClient();
    seedChecked(client);

    renderCenter({ client, canPublish: false });

    await screen.findByRole("region", { name: /Bloklanmış/ });
    expect(screen.queryByRole("button", { name: /yayınla/i })).toBeNull();
  });

  it("offers no bulk publish", async () => {
    const client = createClient();
    seedChecked(client);

    renderCenter({ client, canPublish: true });

    await screen.findByRole("region", { name: /Bloklanmış/ });
    expect(
      screen.queryByRole("button", { name: /tümünü yayınla|hepsini yayınla/i }),
    ).toBeNull();
    // One publish button per unit card, each behind its own confirmation.
    expect(
      screen.getAllByRole("button", { name: /Üniteyi (yeniden )?yayınla/ }),
    ).toHaveLength(4);
  });

  it("publishes one confirmed unit, announces it and refreshes its data", async () => {
    const user = userEvent.setup();
    const client = createClient();
    seedChecked(client);
    publishUnit.mockResolvedValue({
      id: 31,
      status: "published",
      published_nodes: 2,
    });
    getCourseUnits.mockImplementation(async (courseId) =>
      courseId === 3
        ? unitsByCourse[3]!.map((unit) =>
            unit.id === 31 ? { ...unit, status: "published" as const } : unit,
          )
        : unitsByCourse[courseId]!,
    );

    renderCenter({ client, canPublish: true });

    const card = await screen.findByRole("article", { name: "Vektörler" });
    await user.click(
      within(card).getByRole("button", { name: "Üniteyi yayınla" }),
    );
    await user.click(
      within(card).getByRole("button", { name: "Evet, yayınla" }),
    );

    expect(
      await screen.findByText("«Vektörler» yayınlandı. 2 adım yayına alındı."),
    ).toBeDefined();
    expect(publishUnit).toHaveBeenCalledTimes(1);
    expect(publishUnit).toHaveBeenCalledWith(31);

    // The course's unit list is refetched, so the unit moves to "published".
    await waitFor(() =>
      expect(cardTitles(group(/Zaten yayında/))).toEqual([
        "İlk Çağ",
        "Vektörler",
      ]),
    );
    expect(client.getQueryState(unitNodesQueryKey(31))?.isInvalidated).toBe(
      true,
    );
    expect(client.getQueryState(nodePreviewQueryKey(312))?.isInvalidated).toBe(
      true,
    );

    await user.click(screen.getByRole("button", { name: "Kapat" }));
    expect(screen.queryByText(/«Vektörler» yayınlandı/)).toBeNull();
  });

  it("keeps a blocked unit's publish button disabled", async () => {
    const client = createClient();
    seedChecked(client);

    renderCenter({ client, canPublish: true });

    const card = await screen.findByRole("article", { name: "Dalgalar" });
    expect(
      (
        within(card).getByRole("button", {
          name: "Üniteyi yayınla",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
