/**
 * Runs `worker` over `items` with at most `limit` in flight, in input order.
 * `shouldStop` is checked before each item starts; items already in flight
 * are allowed to finish.
 *
 * Used wherever the admin panel has to repeat a per-resource backend read
 * (there are no bulk endpoints), so a large catalogue never turns into
 * hundreds of simultaneous requests.
 */
export async function runWithConcurrency<Item>(
  items: readonly Item[],
  limit: number,
  worker: (item: Item) => Promise<void>,
  shouldStop: () => boolean,
): Promise<void> {
  let next = 0;

  async function lane(): Promise<void> {
    while (next < items.length && !shouldStop()) {
      const item = items[next] as Item;
      next += 1;
      await worker(item);
    }
  }

  const lanes = Math.max(1, Math.min(limit, items.length));

  await Promise.all(Array.from({ length: lanes }, () => lane()));
}
