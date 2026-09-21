import { describe, expect, it, vi } from "vitest";

import { archiveSequentially } from "@/features/content/bulk-archive";

describe("archiveSequentially", () => {
  it("archives every id and reports them all as succeeded", async () => {
    const archiveOne = vi.fn().mockResolvedValue(undefined);

    const result = await archiveSequentially([1, 2, 3], archiveOne);

    expect(archiveOne).toHaveBeenCalledTimes(3);
    expect(archiveOne.mock.calls.map((call) => call[0])).toEqual([1, 2, 3]);
    expect(result).toEqual({ succeededIds: [1, 2, 3], failedIds: [] });
  });

  it("keeps going past a failure and reports it separately", async () => {
    const archiveOne = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("nope"))
      .mockResolvedValueOnce(undefined);

    const result = await archiveSequentially([1, 2, 3], archiveOne);

    expect(archiveOne).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ succeededIds: [1, 3], failedIds: [2] });
  });

  it("reports progress after each attempt, in order", async () => {
    const archiveOne = vi.fn().mockResolvedValue(undefined);
    const onProgress = vi.fn();

    await archiveSequentially([10, 20], archiveOne, onProgress);

    expect(onProgress.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("resolves immediately with empty results for an empty id list", async () => {
    const archiveOne = vi.fn();
    const onProgress = vi.fn();

    const result = await archiveSequentially([], archiveOne, onProgress);

    expect(archiveOne).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
    expect(result).toEqual({ succeededIds: [], failedIds: [] });
  });
});
