/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

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

const { useReadinessSnapshots } =
  await import("@/features/content/use-readiness-snapshots");

const nodes: UnitNodesData = {
  unit: { id: 1, title: "Ünite", status: "draft" },
  nodes: [unitNode(11), unitNode(12)],
};

function setup(
  unitIds: number[],
  enabled: boolean,
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
  const view = renderHook(
    ({ ids }) => useReadinessSnapshots(ids, { enabled }),
    {
      initialProps: { ids: unitIds },
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    },
  );

  return { ...view, queryClient };
}

beforeEach(() => {
  getUnitNodes.mockReset().mockResolvedValue(nodes);
  getNodePreview
    .mockReset()
    .mockImplementation(async (nodeId) => nodePreview(nodeId));
});

describe("useReadinessSnapshots (observe only)", () => {
  it("sends nothing and reports every unit as unchecked", async () => {
    const { result } = setup([1, 2], false);

    expect(result.current.get(1)).toMatchObject({
      nodesState: "unchecked",
      summary: null,
      checks: [],
      isChecking: false,
    });
    expect(result.current.get(2)?.nodesState).toBe("unchecked");

    await new Promise((done) => setTimeout(done, 5));
    expect(getUnitNodes).not.toHaveBeenCalled();
  });

  it("shows cached nodes and previews, and marks the rest unchecked", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(unitNodesQueryKey(1), nodes);
    queryClient.setQueryData(nodePreviewQueryKey(11), nodePreview(11));

    const { result } = setup([1], false, queryClient);
    const snapshot = result.current.get(1)!;

    expect(snapshot.nodesState).toBe("answered");
    expect(snapshot.checks.map((check) => check.state)).toEqual([
      "answered",
      "unchecked",
    ]);
    expect(snapshot.summary).toMatchObject({ total: 2, passing: 1 });
    expect(getNodePreview).not.toHaveBeenCalled();
  });

  it("follows answers another reader puts in the cache", async () => {
    const { result, queryClient } = setup([1], false);

    act(() => {
      queryClient.setQueryData(unitNodesQueryKey(1), nodes);
    });
    await waitFor(() => expect(result.current.get(1)?.nodes).toHaveLength(2));

    act(() => {
      queryClient.setQueryData(nodePreviewQueryKey(11), nodePreview(11));
      queryClient.setQueryData(
        nodePreviewQueryKey(12),
        nodePreview(12, { available: 0 }),
      );
    });

    await waitFor(() =>
      expect(result.current.get(1)?.summary).toMatchObject({
        passing: 1,
        failing: 1,
        canPublish: false,
      }),
    );
  });

  it("reports a failed check as an error, never as a pass", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(unitNodesQueryKey(1), nodes);
    const failure: ApiError = { kind: "server", status: 500, message: "Hata" };
    getNodePreview.mockImplementation(async (nodeId) => {
      if (nodeId === 12) throw failure;
      return nodePreview(nodeId);
    });

    const { result } = setup([1], false, queryClient);

    await act(async () => {
      await Promise.allSettled([
        queryClient.fetchQuery({
          queryKey: nodePreviewQueryKey(11),
          queryFn: () => getNodePreview(11),
        }),
        queryClient.fetchQuery({
          queryKey: nodePreviewQueryKey(12),
          queryFn: () => getNodePreview(12),
        }),
      ]);
    });

    await waitFor(() =>
      expect(result.current.get(1)?.checks[1]).toMatchObject({
        state: "error",
        error: failure,
        preview: undefined,
      }),
    );
    expect(result.current.get(1)?.summary?.canPublish).toBe(false);
  });

  it("shows an in-flight check", async () => {
    const queryClient = new QueryClient();
    getUnitNodes.mockImplementation(() => new Promise(() => {}));
    const { result } = setup([1], false, queryClient);

    act(() => {
      void queryClient.prefetchQuery({
        queryKey: unitNodesQueryKey(1),
        queryFn: () => getUnitNodes(1),
      });
    });

    await waitFor(() =>
      expect(result.current.get(1)).toMatchObject({
        nodesState: "checking",
        isChecking: true,
      }),
    );
  });

  it("reports a failed node list", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const failure: ApiError = {
      kind: "not_found",
      status: 404,
      message: "Yok",
    };
    getUnitNodes.mockRejectedValue(failure);
    const { result } = setup([1], false, queryClient);

    await act(async () => {
      await queryClient
        .fetchQuery({
          queryKey: unitNodesQueryKey(1),
          queryFn: () => getUnitNodes(1),
        })
        .catch(() => undefined);
    });

    await waitFor(() =>
      expect(result.current.get(1)).toMatchObject({
        nodesState: "error",
        nodesError: failure,
        summary: null,
      }),
    );
  });
});

describe("useReadinessSnapshots (fetching)", () => {
  it("loads the nodes and every preview for a unit page", async () => {
    const { result } = setup([1], true);

    await waitFor(() =>
      expect(result.current.get(1)?.summary).toMatchObject({
        total: 2,
        passing: 2,
        canPublish: true,
      }),
    );
    expect(getUnitNodes).toHaveBeenCalledTimes(1);
    expect(getNodePreview.mock.calls.map(([id]) => id)).toEqual([11, 12]);
  });

  it("keeps each unit's previews with its own nodes", async () => {
    getUnitNodes.mockImplementation(async (unitId) => ({
      unit: { id: unitId, title: `Ünite ${unitId}`, status: "draft" },
      nodes:
        unitId === 1
          ? [unitNode(11)]
          : [unitNode(21), unitNode(22), unitNode(23)],
    }));
    getNodePreview.mockImplementation(async (nodeId) =>
      nodePreview(nodeId, { available: nodeId === 22 ? 0 : 9 }),
    );

    const { result } = setup([1, 2], true);

    await waitFor(() => expect(result.current.get(2)?.summary?.total).toBe(3));
    await waitFor(() =>
      expect(result.current.get(2)?.summary?.failing).toBe(1),
    );
    expect(result.current.get(1)?.summary).toMatchObject({
      total: 1,
      failing: 0,
    });
    expect(
      result.current.get(2)?.checks.map((check) => check.preview?.node_id),
    ).toEqual([21, 22, 23]);
  });
});
