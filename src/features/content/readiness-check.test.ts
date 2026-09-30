import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NodePreview, UnitNodesData } from "@/contracts/admin/publication";
import {
  nodePreviewQueryKey,
  unitNodesQueryKey,
} from "@/features/content/content-queries";
import type { ApiError } from "@/lib/api/error";
import { nodePreview, unitNode } from "@/test/fixtures/publishing";

const getUnitNodes = vi.fn<(unitId: number) => Promise<UnitNodesData>>();
const getNodePreview = vi.fn<(nodeId: number) => Promise<NodePreview>>();

vi.mock("@/features/content/content-client", () => ({
  getUnitNodes: (unitId: number) => getUnitNodes(unitId),
  getNodePreview: (nodeId: number) => getNodePreview(nodeId),
}));

const { checkUnitReadiness, checkUnitsReadiness, READINESS_CHECK_CONCURRENCY } =
  await import("@/features/content/readiness-check");

function nodesFor(unitId: number, count = 2): UnitNodesData {
  return {
    unit: { id: unitId, title: `Ünite ${unitId}`, status: "draft" },
    nodes: Array.from({ length: count }, (_, index) =>
      unitNode(unitId * 10 + index + 1),
    ),
  };
}

function apiError(kind: ApiError["kind"]): ApiError {
  return { kind, status: null, message: `${kind} hatası` };
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  getUnitNodes.mockReset();
  getNodePreview.mockReset();
  getUnitNodes.mockImplementation(async (unitId) => nodesFor(unitId));
  getNodePreview.mockImplementation(async (nodeId) => nodePreview(nodeId));
});

describe("checkUnitReadiness", () => {
  it("reads the node list, then every node's preview, into the shared cache", async () => {
    const queryClient = client();

    const outcome = await checkUnitReadiness(queryClient, 3);

    expect(outcome).toEqual({ failed: false, haltError: null });
    expect(getUnitNodes).toHaveBeenCalledWith(3);
    expect(getNodePreview.mock.calls.map(([id]) => id)).toEqual([31, 32]);
    expect(queryClient.getQueryData(unitNodesQueryKey(3))).toEqual(nodesFor(3));
    expect(queryClient.getQueryData(nodePreviewQueryKey(32))).toEqual(
      nodePreview(32),
    );
  });

  it("serves fresh cache entries without a request", async () => {
    const queryClient = client();
    queryClient.setQueryData(unitNodesQueryKey(3), nodesFor(3, 1));
    queryClient.setQueryData(nodePreviewQueryKey(31), nodePreview(31));

    await checkUnitReadiness(queryClient, 3);

    expect(getUnitNodes).not.toHaveBeenCalled();
    expect(getNodePreview).not.toHaveBeenCalled();
  });

  it("asks again on refresh", async () => {
    const queryClient = client();
    queryClient.setQueryData(unitNodesQueryKey(3), nodesFor(3, 1));
    queryClient.setQueryData(nodePreviewQueryKey(31), nodePreview(31));

    await checkUnitReadiness(queryClient, 3, { refresh: true });

    expect(getUnitNodes).toHaveBeenCalledTimes(1);
    expect(getNodePreview.mock.calls.map(([id]) => id)).toEqual([31, 32]);
  });

  it("reports a failed node list without asking for previews", async () => {
    getUnitNodes.mockRejectedValue(apiError("server"));

    expect(await checkUnitReadiness(client(), 3)).toEqual({
      failed: true,
      haltError: null,
    });
    expect(getNodePreview).not.toHaveBeenCalled();
  });

  it("keeps a failed preview in the cache and still reads the others", async () => {
    const queryClient = client();
    getNodePreview.mockImplementation(async (nodeId) => {
      if (nodeId === 31) throw apiError("server");
      return nodePreview(nodeId);
    });

    expect(await checkUnitReadiness(queryClient, 3)).toEqual({
      failed: true,
      haltError: null,
    });
    expect(queryClient.getQueryState(nodePreviewQueryKey(31))?.error).toEqual(
      apiError("server"),
    );
    expect(queryClient.getQueryData(nodePreviewQueryKey(32))).toBeDefined();
  });

  it.each(["authentication", "rate_limit"] as const)(
    "surfaces a %s error so a batch can stop",
    async (kind) => {
      getNodePreview.mockRejectedValue(apiError(kind));

      expect((await checkUnitReadiness(client(), 3)).haltError).toEqual(
        apiError(kind),
      );
    },
  );

  it("surfaces a halting error from the node list", async () => {
    getUnitNodes.mockRejectedValue(apiError("authentication"));

    expect(await checkUnitReadiness(client(), 3)).toEqual({
      failed: true,
      haltError: apiError("authentication"),
    });
  });

  it("handles a unit with no nodes", async () => {
    getUnitNodes.mockResolvedValue(nodesFor(3, 0));

    expect(await checkUnitReadiness(client(), 3)).toEqual({
      failed: false,
      haltError: null,
    });
    expect(getNodePreview).not.toHaveBeenCalled();
  });
});

describe("checkUnitsReadiness", () => {
  it("checks units with bounded concurrency and reports progress", async () => {
    let inFlight = 0;
    let peak = 0;
    getUnitNodes.mockImplementation(async (unitId) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((done) => setTimeout(done, 1));
      inFlight -= 1;
      return nodesFor(unitId, 0);
    });
    const progress: { completed: number; total: number }[] = [];

    const outcome = await checkUnitsReadiness(client(), [1, 2, 3, 4, 5], {
      isCancelled: () => false,
      onProgress: (event) => progress.push(event),
    });

    expect(outcome).toEqual({
      status: "completed",
      failedUnitIds: [],
      haltError: null,
    });
    expect(peak).toBe(READINESS_CHECK_CONCURRENCY);
    expect(progress[0]).toEqual({ completed: 0, total: 5 });
    expect(progress.at(-1)).toEqual({ completed: 5, total: 5 });
  });

  it("lists units whose reads failed and keeps going", async () => {
    getNodePreview.mockImplementation(async (nodeId) => {
      if (nodeId === 21) throw apiError("server");
      return nodePreview(nodeId);
    });

    const outcome = await checkUnitsReadiness(client(), [1, 2, 3], {
      isCancelled: () => false,
      onProgress: () => {},
    });

    expect(outcome.failedUnitIds).toEqual([2]);
    expect(getUnitNodes).toHaveBeenCalledTimes(3);
  });

  it("halts on a session or rate-limit error", async () => {
    getUnitNodes.mockRejectedValue(apiError("rate_limit"));

    const outcome = await checkUnitsReadiness(client(), [1, 2, 3, 4], {
      isCancelled: () => false,
      onProgress: () => {},
      concurrency: 1,
    });

    expect(outcome).toEqual({
      status: "halted",
      failedUnitIds: [],
      haltError: apiError("rate_limit"),
    });
    expect(getUnitNodes).toHaveBeenCalledTimes(1);
  });

  it("stops scheduling when cancelled", async () => {
    let cancelled = false;
    getUnitNodes.mockImplementation(async (unitId) => {
      cancelled = true;
      return nodesFor(unitId, 0);
    });

    const outcome = await checkUnitsReadiness(client(), [1, 2, 3], {
      isCancelled: () => cancelled,
      onProgress: () => {},
      concurrency: 1,
    });

    expect(outcome.status).toBe("cancelled");
    expect(getUnitNodes).toHaveBeenCalledTimes(1);
  });

  it("forwards refresh to every unit", async () => {
    const queryClient = client();
    queryClient.setQueryData(unitNodesQueryKey(1), nodesFor(1, 0));

    await checkUnitsReadiness(queryClient, [1], {
      refresh: true,
      isCancelled: () => false,
      onProgress: () => {},
    });

    expect(getUnitNodes).toHaveBeenCalledWith(1);
  });
});
