import { describe, expect, it, vi } from "vitest";

import { runWithConcurrency } from "@/lib/async/run-with-concurrency";

function deferred<Value = void>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("runWithConcurrency", () => {
  it("never exceeds the limit and processes every item once, in order", async () => {
    let inFlight = 0;
    let peak = 0;
    const started: number[] = [];

    await runWithConcurrency(
      [1, 2, 3, 4, 5, 6, 7],
      3,
      async (item) => {
        started.push(item);
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await Promise.resolve();
        await Promise.resolve();
        inFlight -= 1;
      },
      () => false,
    );

    expect(peak).toBe(3);
    expect(started).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("stops starting new items once asked, letting in-flight ones finish", async () => {
    const gates = [deferred(), deferred(), deferred(), deferred()];
    const started: number[] = [];
    const finished: number[] = [];
    let stop = false;

    const run = runWithConcurrency(
      [0, 1, 2, 3],
      2,
      async (item) => {
        started.push(item);
        await gates[item]!.promise;
        finished.push(item);
      },
      () => stop,
    );

    expect(started).toEqual([0, 1]);
    stop = true;
    gates[0]!.resolve();
    gates[1]!.resolve();
    await run;

    expect(started).toEqual([0, 1]);
    expect(finished).toEqual([0, 1]);
  });

  it("handles an empty list", async () => {
    const worker = vi.fn(async () => {});
    await runWithConcurrency([], 4, worker, () => false);
    expect(worker).not.toHaveBeenCalled();
  });
});
