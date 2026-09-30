/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type { PublishUnitData } from "@/contracts/admin/publication";
import type { ApiError } from "@/lib/api/error";
import {
  contentNotPublishableResponse,
  publishSuccessResponse,
} from "@/test/fixtures/publication-api";

const publishUnit = vi.fn<(unitId: number) => Promise<PublishUnitData>>();

vi.mock("@/features/content/content-client", () => ({
  publishUnit: (unitId: number) => publishUnit(unitId),
}));

const { usePublishUnit } = await import("@/features/content/use-publish-unit");

const target = { courseId: 3, unitId: 11, nodeIds: [101, 102] };

function setup(onPublished = vi.fn()) {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const view = renderHook(() => usePublishUnit(target, { onPublished }), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });

  return { ...view, invalidate, onPublished };
}

beforeEach(() => {
  publishUnit.mockReset();
});

describe("usePublishUnit", () => {
  it("publishes the unit and invalidates everything publishing changed", async () => {
    publishUnit.mockResolvedValue(
      publishSuccessResponse.data as PublishUnitData,
    );
    const { result, invalidate, onPublished } = setup();

    act(() => result.current.publish());

    await waitFor(() =>
      expect(result.current.result).toEqual(publishSuccessResponse.data),
    );
    expect(publishUnit).toHaveBeenCalledWith(11);
    expect(onPublished).toHaveBeenCalledWith(publishSuccessResponse.data);
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(6));
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual(
      [
        ["content", "courses"],
        ["content", "courses", 3, "units"],
        ["content", "units", 11, "nodes"],
        ["content", "units", 11, "exercises"],
        ["content", "nodes", 101, "preview"],
        ["content", "nodes", 102, "preview"],
      ],
    );
    expect(result.current.error).toBeNull();
  });

  it("exposes the backend's blocking rows on a refusal and invalidates nothing", async () => {
    const refusal: ApiError = {
      kind: "validation",
      status: 422,
      ...contentNotPublishableResponse.error,
    };
    publishUnit.mockRejectedValue(refusal);
    const { result, invalidate, onPublished } = setup();

    act(() => result.current.publish());

    await waitFor(() => expect(result.current.error).toEqual(refusal));
    expect(result.current.blocking).toEqual(
      contentNotPublishableResponse.error.details.blocking,
    );
    expect(result.current.result).toBeNull();
    expect(invalidate).not.toHaveBeenCalled();
    expect(onPublished).not.toHaveBeenCalled();
  });

  it("never retries a publish", async () => {
    publishUnit.mockRejectedValue({
      kind: "server",
      status: 500,
      message: "Sunucu hatası oluştu.",
    });
    const { result } = setup();

    act(() => result.current.publish());

    await waitFor(() => expect(result.current.error?.kind).toBe("server"));
    await new Promise((done) => setTimeout(done, 20));
    expect(publishUnit).toHaveBeenCalledTimes(1);
    expect(result.current.blocking).toEqual([]);
  });

  it("normalises an unshaped failure", async () => {
    publishUnit.mockRejectedValue(new Error("boom"));
    const { result } = setup();

    act(() => result.current.publish());

    await waitFor(() =>
      expect(result.current.error).toEqual({
        kind: "unknown",
        status: null,
        message: "İstek tamamlanamadı.",
      }),
    );
  });

  it("clears an earlier error after a successful retry by the admin", async () => {
    publishUnit
      .mockRejectedValueOnce({ kind: "network", status: null, message: "x" })
      .mockResolvedValueOnce(publishSuccessResponse.data as PublishUnitData);
    const { result } = setup();

    act(() => result.current.publish());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    act(() => result.current.publish());
    await waitFor(() => expect(result.current.result).not.toBeNull());
    expect(result.current.error).toBeNull();
  });
});
