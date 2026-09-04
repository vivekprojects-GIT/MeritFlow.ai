/**
 * Run `fn` over `items` with at most `limit` promises in flight at once.
 * Results preserve input order. Used to bound concurrent YouTube lookups.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) break;
      results[index] = await fn(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}
