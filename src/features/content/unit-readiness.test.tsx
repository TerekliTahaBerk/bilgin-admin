/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type {
  NodePreview,
  PublishUnitData,
  UnitNodesData,
} from "@/contracts/admin/publication";
import type { ApiError } from "@/lib/api/error";
import {
  contentNotPublishableResponse,
  emptyUnitNodesResponse,
  failingPreviewResponse,
  passingPreviewResponse,
  publishSuccessResponse,
  relaxedPreviewResponse,
  validUnitNodesResponse,
} from "@/test/fixtures/publication-api";

const getUnitNodes = vi.fn<() => Promise<UnitNodesData>>();
const getNodePreview = vi.fn<(nodeId: number) => Promise<NodePreview>>();
const publishUnit = vi.fn<(unitId: number) => Promise<PublishUnitData>>();

vi.mock("@/features/content/content-client", () => ({
  getUnitNodes: () => getUnitNodes(),
  getNodePreview: (nodeId: number) => getNodePreview(nodeId),
  publishUnit: (unitId: number) => publishUnit(unitId),
}));

const { UnitReadiness } = await import("@/features/content/unit-readiness");

const nodes = validUnitNodesResponse.data as UnitNodesData;
const COURSE_ID = 1;
const UNIT_ID = nodes.unit.id;

const previewsById: Record<number, NodePreview> = {
  101: passingPreviewResponse.data as NodePreview,
  102: relaxedPreviewResponse.data as NodePreview,
  103: failingPreviewResponse.data as NodePreview,
};

function renderReadiness(canPublish = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <UnitReadiness
        canPublish={canPublish}
        courseId={COURSE_ID}
        unitId={UNIT_ID}
      />
    </QueryClientProvider>,
  );
}

/** Every node passes, so the publish button becomes available. */
function allPassing() {
  getNodePreview.mockImplementation((nodeId) =>
    Promise.resolve({
      ...(passingPreviewResponse.data as NodePreview),
      node_id: nodeId,
    }),
  );
}

beforeEach(() => {
  getUnitNodes.mockReset().mockResolvedValue(nodes);
  getNodePreview
    .mockReset()
    .mockImplementation((nodeId) =>
      Promise.resolve(previewsById[nodeId] ?? previewsById[101]!),
    );
  publishUnit
    .mockReset()
    .mockResolvedValue(publishSuccessResponse.data as PublishUnitData);
});

describe("UnitReadiness states", () => {
  it("asks the backend once per node, in parallel", async () => {
    renderReadiness();

    await screen.findByText("Kural 3 soru getiriyor, 10 gerekiyor.", {
      exact: false,
    });

    expect(getUnitNodes).toHaveBeenCalledTimes(1);
    expect(getNodePreview.mock.calls.map(([id]) => id)).toEqual([
      101, 102, 103,
    ]);
  });

  it("shows a pass, a relaxed pass and a failure distinctly", async () => {
    renderReadiness();

    const list = await screen.findByRole("list", {
      name: "Ünite adımları",
    });

    expect(within(list).getByText("Hazır")).toBeDefined();
    expect(within(list).getByText("Havuz dar")).toBeDefined();
    expect(within(list).getByText("Yetersiz")).toBeDefined();
  });

  it("names the relaxed step as a widened filter, not a plain pass", async () => {
    renderReadiness();

    await screen.findByText(/zorluk filtresi gevşetilerek/, { exact: false });
  });

  it("shows the backend counts and message for a failing step", async () => {
    renderReadiness();

    const failure = await screen.findByText(
      /Kural 3 soru getiriyor, 10 gerekiyor\./,
    );

    expect(failure.textContent).toContain("3 / 10");
    expect(failure.getAttribute("role")).toBe("alert");
  });

  it("anchors every step so a blocking row can link to it", async () => {
    const { container } = renderReadiness();

    await screen.findByRole("list", { name: "Ünite adımları" });

    expect(container.querySelector("#node-preview-101")).not.toBeNull();
    expect(container.querySelector("#node-preview-103")).not.toBeNull();
  });

  it("summarises how many steps are ready", async () => {
    renderReadiness();

    const summary = await screen.findByText(/adım hazır/);

    expect(summary.textContent).toContain("2 / 3 adım hazır");
    expect(summary.textContent).toContain("1 adımda havuz dar");
    expect(summary.textContent).toContain("1 adım yetersiz");
  });

  it("reports a step whose check could not run, without calling it ready", async () => {
    const readError: ApiError = {
      kind: "server",
      status: 500,
      message: "Sunucu hatası oluştu.",
    };

    getNodePreview.mockReset().mockRejectedValue(readError);
    renderReadiness(true);

    await screen.findAllByText(/Hazırlık durumu okunamadı/);

    expect(
      screen.getByRole("button", { name: "Üniteyi yayınla" }),
    ).toHaveProperty("disabled", true);
  });

  it("says a unit with no steps has no rule to check", async () => {
    getUnitNodes
      .mockReset()
      .mockResolvedValue(emptyUnitNodesResponse.data as UnitNodesData);

    renderReadiness();

    await screen.findByText(/kontrol edilecek bir kural yok/);
    expect(getNodePreview).not.toHaveBeenCalled();
  });
});

describe("UnitReadiness publish ability", () => {
  it("keeps the publish button out of the DOM without publish_content", async () => {
    allPassing();
    renderReadiness(false);

    await screen.findByRole("list", { name: "Ünite adımları" });

    expect(
      screen.queryByRole("button", { name: "Üniteyi yayınla" }),
    ).toBeNull();
    expect(document.body.textContent).not.toContain("Üniteyi yayınla");
  });

  it("offers publishing with publish_content once every step passes", async () => {
    allPassing();
    renderReadiness(true);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Üniteyi yayınla" }),
      ).toHaveProperty("disabled", false),
    );
  });

  it("disables publishing while a step fails", async () => {
    renderReadiness(true);

    await screen.findByText("Yetersiz");

    expect(
      screen.getByRole("button", { name: "Üniteyi yayınla" }),
    ).toHaveProperty("disabled", true);
  });
});

describe("UnitReadiness publishing", () => {
  it("confirms what publishing does before sending anything", async () => {
    const user = userEvent.setup();
    allPassing();
    renderReadiness(true);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Üniteyi yayınla" }),
      ).toHaveProperty("disabled", false),
    );

    await user.click(screen.getByRole("button", { name: "Üniteyi yayınla" }));

    expect(screen.getByText(/adımın tamamı yayınlanır/)).toBeDefined();
    expect(screen.getByText(/Arşivlenmiş sorular arşivde kalır/)).toBeDefined();
    expect(publishUnit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Vazgeç" }));

    expect(publishUnit).not.toHaveBeenCalled();
  });

  it("offers no force path anywhere", async () => {
    renderReadiness(true);

    await screen.findByText("Yetersiz");

    expect(document.body.textContent).not.toMatch(/zorla|yine de yayınla/i);
  });

  it("publishes once confirmed and reports the result", async () => {
    const user = userEvent.setup();
    allPassing();
    renderReadiness(true);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Üniteyi yayınla" }),
      ).toHaveProperty("disabled", false),
    );

    await user.click(screen.getByRole("button", { name: "Üniteyi yayınla" }));
    await user.click(screen.getByRole("button", { name: "Evet, yayınla" }));

    await screen.findByText(/Ünite yayınlandı\. 3 adım yayına alındı\./);
    expect(publishUnit).toHaveBeenCalledTimes(1);
  });

  it("names every blocking step when the backend refuses", async () => {
    const user = userEvent.setup();
    allPassing();

    const error: ApiError = {
      kind: "validation",
      status: 422,
      code: contentNotPublishableResponse.error.code,
      message: contentNotPublishableResponse.error.message,
      details: contentNotPublishableResponse.error.details,
    };

    publishUnit.mockReset().mockRejectedValue(error);
    renderReadiness(true);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Üniteyi yayınla" }),
      ).toHaveProperty("disabled", false),
    );

    await user.click(screen.getByRole("button", { name: "Üniteyi yayınla" }));
    await user.click(screen.getByRole("button", { name: "Evet, yayınla" }));

    const alert = await screen.findByRole("alert");

    expect(within(alert).getByText("Ünite yayınlanamadı")).toBeDefined();

    // A race can make the backend refuse a unit the preview called ready, so
    // the refusal has to name the steps rather than show one generic error.
    const link = within(alert).getByRole("link", { name: "Ünite Challenge" });

    expect(link.getAttribute("href")).toBe("#node-preview-103");
  });

  it("shows a plain failure when the refusal carries no blocking rows", async () => {
    const user = userEvent.setup();
    allPassing();

    publishUnit.mockReset().mockRejectedValue({
      kind: "server",
      status: 500,
      message: "Sunucu hatası oluştu.",
    } satisfies ApiError);

    renderReadiness(true);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Üniteyi yayınla" }),
      ).toHaveProperty("disabled", false),
    );

    await user.click(screen.getByRole("button", { name: "Üniteyi yayınla" }));
    await user.click(screen.getByRole("button", { name: "Evet, yayınla" }));

    const alert = await screen.findByRole("alert");

    expect(within(alert).getByText("Sunucu hatası oluştu.")).toBeDefined();
    expect(within(alert).queryAllByRole("link")).toHaveLength(0);
  });

  it("never retries a publish automatically", async () => {
    const user = userEvent.setup();
    allPassing();
    publishUnit.mockReset().mockRejectedValue({
      kind: "server",
      status: 500,
      message: "Sunucu hatası oluştu.",
    } satisfies ApiError);

    renderReadiness(true);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Üniteyi yayınla" }),
      ).toHaveProperty("disabled", false),
    );

    await user.click(screen.getByRole("button", { name: "Üniteyi yayınla" }));
    await user.click(screen.getByRole("button", { name: "Evet, yayınla" }));

    await screen.findByRole("alert");

    expect(publishUnit).toHaveBeenCalledTimes(1);
  });
});
