/**
 * Deterministic, dependency-free page/range loader.
 *
 * Fetches pages in strictly increasing order via `fetchPage`, stopping as
 * soon as a page comes back shorter than `pageSize` (i.e. no more records
 * remain). Used to load the full exercise library from Supabase without
 * relying on any single unbounded `select()`.
 */
export interface PageRange {
  from: number;
  to: number;
}

export async function fetchAllPages<T>(
  fetchPage: (range: PageRange) => Promise<T[]>,
  pageSize: number,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error("pageSize must be a positive integer");
  }
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const to = from + pageSize - 1;
    const page = await fetchPage({ from, to });
    all.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
