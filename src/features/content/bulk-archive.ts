export type BulkArchiveOutcome = Readonly<{
  succeededIds: readonly number[];
  failedIds: readonly number[];
}>;

/**
 * Archives each id in turn. There is no bulk-archive endpoint on the backend
 * (`DELETE /exercises/{id}` only ever archives one exercise), so a "seçilenleri
 * arşivle" action is this same request repeated — never a route this frontend
 * invents. One question failing to archive does not stop the rest; every id
 * is attempted and both outcomes are reported back.
 */
export async function archiveSequentially(
  ids: readonly number[],
  archiveOne: (id: number) => Promise<unknown>,
  onProgress?: (completed: number, total: number) => void,
): Promise<BulkArchiveOutcome> {
  const succeededIds: number[] = [];
  const failedIds: number[] = [];

  for (const [index, id] of ids.entries()) {
    try {
      await archiveOne(id);
      succeededIds.push(id);
    } catch {
      failedIds.push(id);
    }
    onProgress?.(index + 1, ids.length);
  }

  return { succeededIds, failedIds };
}
