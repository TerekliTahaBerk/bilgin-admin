/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type { NodePreview, UnitNodesData } from "@/contracts/admin/publication";
import type { ApiError } from "@/lib/api/error";
import { nodePreview, unitNode } from "@/test/fixtures/publishing";

const getUnitNodes = vi.fn<(unitId: number) => Promise<UnitNodesData>>();
const getNodePreview = vi.fn<(nodeId: number) => Promise<NodePreview>>();

vi.mock("@/features/content/content-client", () => ({
  getUnitNodes: (unitId: number) => getUnitNodes(unitId),
  getNodePreview: (nodeId: number) => getNodePreview(nodeId),
}));

const { useReadinessCheck } =
  await import("@/features/content/use-readiness-check");

function nodesFor(unitId: number): UnitNodesData {
  return {
    unit: { id: unitId, title: `Ünite ${unitId}`, status: "draft" },
    nodes: [unitNode(unitId * 10 + 1)],
  };
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return renderHook(() => useReadinessCheck(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  getUnitNodes.mockReset();
  getNodePreview.mockReset();
  getUnitNodes.mockImplementation(async (unitId) => nodesFor(unitId));
  getNodePreview.mockImplementation(async (nodeId) => nodePreview(nodeId));
});

describe("useReadinessCheck", () => {
  it("starts idle and sends nothing on its own", async () => {
    const { result } = setup();

    expect(result.current.state).toEqual({
      status: "idle",
      progress: null,
      failedUnitIds: [],
      haltError: null,
      isCancelling: false,
    });
    await new Promise((done) => setTimeout(done, 5));
    expect(getUnitNodes).not.toHaveBeenCalled();
  });

  it("checks many units and reports completion", async () => {
    const { result } = setup();

    act(() => result.current.checkMany([1, 2, 3]));
    expect(result.current.state.status).toBe("running");

    await waitFor(() => expect(result.current.state.status).toBe("completed"));
    expect(result.current.state.progress).toEqual({ completed: 3, total: 3 });
    expect(getUnitNodes).toHaveBeenCalledTimes(3);
  });

  it("ignores an empty batch and a second batch while one runs", async () => {
    const { result } = setup();

    act(() => result.current.checkMany([]));
    expect(result.current.state.status).toBe("idle");

    act(() => {
      result.current.checkMany([1]);
      result.current.checkMany([1, 2]);
    });

    await waitFor(() => expect(result.current.state.status).toBe("completed"));
    expect(getUnitNodes).toHaveBeenCalledTimes(1);
  });

  it("reports units whose reads failed", async () => {
    getNodePreview.mockImplementation(async (nodeId) => {
      if (nodeId === 21) {
        throw { kind: "server", status: 500, message: "Sunucu hatası." };
      }
      return nodePreview(nodeId);
    });
    const { result } = setup();

    act(() => result.current.checkMany([1, 2]));

    await waitFor(() => expect(result.current.state.status).toBe("completed"));
    expect(result.current.state.failedUnitIds).toEqual([2]);
  });

  it("halts and exposes the halting error", async () => {
    const expired: ApiError = {
      kind: "authentication",
      status: 401,
      message: "Oturum doğrulanamadı.",
    };
    getUnitNodes.mockRejectedValue(expired);
    const { result } = setup();

    act(() => result.current.checkMany([1, 2, 3, 4]));

    await waitFor(() => expect(result.current.state.status).toBe("halted"));
    expect(result.current.state.haltError).toEqual(expired);
  });

  it("cancels on request", async () => {
    const pending: (() => void)[] = [];
    getUnitNodes.mockImplementation(
      (unitId) =>
        new Promise((resolve) => {
          pending.push(() => resolve({ ...nodesFor(unitId), nodes: [] }));
        }),
    );
    const { result } = setup();

    act(() => result.current.checkMany([1, 2, 3, 4, 5]));
    await waitFor(() => expect(getUnitNodes).toHaveBeenCalledTimes(2));

    act(() => result.current.cancel());
    expect(result.current.state.isCancelling).toBe(true);

    await act(async () => {
      for (const release of pending.splice(0)) release();
    });

    await waitFor(() => expect(result.current.state.status).toBe("cancelled"));
    expect(getUnitNodes).toHaveBeenCalledTimes(2);
  });

  it("cancel is a no-op when nothing runs", () => {
    const { result } = setup();

    act(() => result.current.cancel());

    expect(result.current.state.isCancelling).toBe(false);
  });

  it("checks one unit without touching the batch state", async () => {
    const { result } = setup();

    act(() => result.current.checkOne(4));

    await waitFor(() => expect(getNodePreview).toHaveBeenCalledWith(41));
    expect(result.current.state.status).toBe("idle");
  });

  it("surfaces a halting error from a single check", async () => {
    const limited: ApiError = {
      kind: "rate_limit",
      status: 429,
      message: "Çok fazla istek.",
    };
    getUnitNodes.mockRejectedValue(limited);
    const { result } = setup();

    act(() => result.current.checkOne(4));

    await waitFor(() =>
      expect(result.current.state.haltError).toEqual(limited),
    );
  });

  it("stops scheduling after unmount", async () => {
    const pending: (() => void)[] = [];
    getUnitNodes.mockImplementation(
      (unitId) =>
        new Promise((resolve) => {
          pending.push(() => resolve({ ...nodesFor(unitId), nodes: [] }));
        }),
    );
    const { result, unmount } = setup();

    act(() => result.current.checkMany([1, 2, 3, 4, 5]));
    await waitFor(() => expect(getUnitNodes).toHaveBeenCalledTimes(2));

    unmount();
    for (const release of pending.splice(0)) release();
    await new Promise((done) => setTimeout(done, 10));

    expect(getUnitNodes).toHaveBeenCalledTimes(2);
  });
});
