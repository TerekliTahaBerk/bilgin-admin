/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type { PublishStatus } from "@/contracts/admin/content";
import type { PublishUnitData } from "@/contracts/admin/publication";
import {
  buildPublishingRows,
  type PublishingRow,
} from "@/features/content/publishing-model";
import type { UnitReadinessSnapshot } from "@/features/content/use-readiness-snapshots";
import type { ApiError } from "@/lib/api/error";
import { contentNotPublishableResponse } from "@/test/fixtures/publication-api";
import {
  nodePreview,
  readinessSnapshot,
  unitNode,
} from "@/test/fixtures/publishing";
import { qualityCourse, qualityUnit } from "@/test/fixtures/quality";

const publishUnit = vi.fn<(unitId: number) => Promise<PublishUnitData>>();

vi.mock("@/features/content/content-client", () => ({
  publishUnit: (unitId: number) => publishUnit(unitId),
}));

const { PublishingUnitCard } =
  await import("@/features/content/publishing-unit-card");

function row(
  snapshot: UnitReadinessSnapshot | undefined,
  status: PublishStatus = "draft",
): PublishingRow {
  return buildPublishingRows(
    [qualityCourse(3, { name: "AYT Fizik" })],
    new Map([
      [
        3,
        [
          qualityUnit(31, {
            title: "Vektörler",
            status,
            node_count: 2,
            exercise_count: 17,
          }),
        ],
      ],
    ]),
    snapshot === undefined ? new Map() : new Map([[31, snapshot]]),
  )[0]!;
}

const nodes = [
  unitNode(311, { title: "Çalışma" }),
  unitNode(312, { title: "Mini Challenge" }),
];
const ready = readinessSnapshot(31, nodes, [
  nodePreview(311),
  nodePreview(312),
]);
const blocked = readinessSnapshot(31, nodes, [
  nodePreview(311),
  nodePreview(312, { available: 1 }),
]);

function renderCard(
  target: PublishingRow,
  { canPublish = true, onCheck = vi.fn(), onPublished = vi.fn() } = {},
) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PublishingUnitCard
        canPublish={canPublish}
        onCheck={onCheck}
        onPublished={onPublished}
        row={target}
      />
    </QueryClientProvider>,
  );

  return { onCheck, onPublished };
}

function stat(label: string) {
  return screen.getByText(label).nextElementSibling?.textContent;
}

beforeEach(() => {
  publishUnit.mockReset();
});

describe("PublishingUnitCard", () => {
  it("shows the unit's identity, status and counts", () => {
    renderCard(row(blocked));

    const card = screen.getByRole("article", { name: "Vektörler" });
    expect(within(card).getByText("AYT Fizik")).toBeDefined();
    expect(
      within(card)
        .getByRole("link", { name: "Vektörler" })
        .getAttribute("href"),
    ).toBe("/courses/3/units/31");
    expect(within(card).getByText("Bloklanmış")).toBeDefined();
    expect(within(card).getByText("Taslak")).toBeDefined();
    expect(stat("Adım")).toBe("2");
    expect(stat("Toplam soru")).toBe("17");
    expect(stat("Hazır adım")).toBe("1 / 2");
    expect(stat("Bloklayan adım")).toBe("1");
    expect(stat("Uyarı")).toBe("0");
  });

  it("shows a dash, never zero, for counts it does not have", () => {
    renderCard(row(undefined));

    expect(stat("Adım")).toBe("2");
    expect(stat("Hazır adım")).toBe("—");
    expect(stat("Bloklayan adım")).toBe("—");
    expect(stat("Uyarı")).toBe("—");
    expect(screen.getByText("Hazırlık henüz kontrol edilmedi.")).toBeDefined();
    expect(screen.getByText("Hazırlık durumu bilinmiyor")).toBeDefined();
  });

  it("asks for a first check, then a refresh", async () => {
    const user = userEvent.setup();
    const first = renderCard(row(undefined));

    await user.click(
      screen.getByRole("button", { name: "Vektörler: hazırlığı kontrol et" }),
    );
    expect(first.onCheck).toHaveBeenCalledWith(31, { refresh: false });
  });

  it("refreshes a unit that was already checked", async () => {
    const user = userEvent.setup();
    const { onCheck } = renderCard(row(ready));

    await user.click(
      screen.getByRole("button", {
        name: "Vektörler: hazırlığı yeniden kontrol et",
      }),
    );
    expect(onCheck).toHaveBeenCalledWith(31, { refresh: true });
  });

  it("disables checking while a check runs", () => {
    renderCard(row(readinessSnapshot(31, null, [], { checking: true })));

    expect(
      (
        screen.getByRole("button", {
          name: "Vektörler: hazırlığı yeniden kontrol et",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByText("Kontrol ediliyor…")).toBeDefined();
  });

  it.each([
    [
      readinessSnapshot(31, nodes, [nodePreview(311)]),
      "1 adım henüz kontrol edilmedi.",
    ],
    [
      {
        ...readinessSnapshot(31, null),
        nodesState: "error" as const,
        nodesError: {
          kind: "server",
          status: 500,
          message: "Sunucu hatası.",
        } as ApiError,
      },
      "Adımlar okunamadı: Sunucu hatası.",
    ],
    [
      {
        ...readinessSnapshot(31, nodes, [nodePreview(311)]),
        checks: [
          {
            node: nodes[0]!,
            state: "answered" as const,
            preview: nodePreview(311),
            error: null,
          },
          {
            node: nodes[1]!,
            state: "error" as const,
            preview: undefined,
            error: { kind: "server", status: 500, message: "x" } as ApiError,
          },
        ],
      },
      "1 adımın kontrolü başarısız oldu.",
    ],
  ])("explains an incomplete check (%#)", (snapshot, text) => {
    renderCard(row(snapshot));

    expect(screen.getByText(text)).toBeDefined();
  });

  it("keeps the publish button out of the DOM without publish_content", () => {
    renderCard(row(ready), { canPublish: false });

    expect(screen.queryByRole("button", { name: /yayınla/ })).toBeNull();
  });

  it("disables publishing for a blocked unit and says why", () => {
    renderCard(row(blocked));

    const button = screen.getByRole("button", { name: "Üniteyi yayınla" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText("Bloklayan adımlar var; sunucu yayını reddeder."),
    ).toBeDefined();
  });

  it("disables publishing for an unchecked unit and says why", () => {
    renderCard(row(undefined));

    expect(
      (
        screen.getByRole("button", {
          name: "Üniteyi yayınla",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByText(/Önce hazırlığı kontrol edin/)).toBeDefined();
  });

  it("offers a republish for a published unit", () => {
    renderCard(row(ready, "published"));

    expect(screen.getByText("Zaten yayında")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Üniteyi yeniden yayınla" }),
    ).toBeDefined();
  });

  it("publishes after its own confirmation and reports it", async () => {
    const user = userEvent.setup();
    publishUnit.mockResolvedValue({
      id: 31,
      status: "published",
      published_nodes: 2,
    });
    const { onPublished } = renderCard(row(ready));

    await user.click(screen.getByRole("button", { name: "Üniteyi yayınla" }));
    expect(publishUnit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Evet, yayınla" }));

    expect(
      await screen.findByText("Ünite yayınlandı. 2 adım yayına alındı."),
    ).toBeDefined();
    expect(publishUnit).toHaveBeenCalledWith(31);
    expect(onPublished).toHaveBeenCalledWith(
      expect.objectContaining({ unit: expect.objectContaining({ id: 31 }) }),
      {
        id: 31,
        status: "published",
        published_nodes: 2,
      },
    );
  });

  it("opens the node details on a refusal so the blocking links resolve", async () => {
    const user = userEvent.setup();
    publishUnit.mockRejectedValue({
      kind: "validation",
      status: 422,
      ...contentNotPublishableResponse.error,
      details: {
        blocking: [
          { node_id: 312, node_title: "Mini Challenge", message: "Yetersiz." },
        ],
      },
    });
    renderCard(row(ready));

    expect(
      screen
        .getByRole("button", { name: "Adım ayrıntıları" })
        .getAttribute("aria-expanded"),
    ).toBe("false");

    await user.click(screen.getByRole("button", { name: "Üniteyi yayınla" }));
    await user.click(screen.getByRole("button", { name: "Evet, yayınla" }));

    const alert = await screen.findByRole("alert");
    expect(
      within(alert)
        .getByRole("link", { name: "Mini Challenge" })
        .getAttribute("href"),
    ).toBe("#node-preview-312");
    expect(
      screen
        .getByRole("button", { name: "Adım ayrıntıları" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(document.getElementById("node-preview-312")).not.toBeNull();
  });

  it("toggles the node details", async () => {
    const user = userEvent.setup();
    renderCard(row(ready));
    const toggle = screen.getByRole("button", { name: "Adım ayrıntıları" });

    expect(
      screen.queryByRole("list", { name: "Vektörler adımları" }),
    ).toBeNull();
    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(
      within(
        screen.getByRole("list", { name: "Vektörler adımları" }),
      ).getAllByRole("listitem"),
    ).toHaveLength(2);

    await user.click(toggle);
    expect(
      screen.queryByRole("list", { name: "Vektörler adımları" }),
    ).toBeNull();
  });

  it("asks for a check before showing details it does not have", async () => {
    const user = userEvent.setup();
    renderCard(row(undefined));

    await user.click(screen.getByRole("button", { name: "Adım ayrıntıları" }));

    expect(
      screen.getByText("Adımları görmek için hazırlığı kontrol edin."),
    ).toBeDefined();
  });

  it("says a unit without nodes has nothing to check", async () => {
    const user = userEvent.setup();
    renderCard(row(readinessSnapshot(31, [], [])));

    await user.click(screen.getByRole("button", { name: "Adım ayrıntıları" }));

    expect(
      screen.getByText(
        "Bu ünitede adım yok; kontrol edilecek bir kural bulunmuyor.",
      ),
    ).toBeDefined();
  });
});
