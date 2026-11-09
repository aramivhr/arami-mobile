// The website's src/lib/fetch-all.ts: Supabase returns at most 1000 rows per
// request and silently drops the rest, so growing lists are read in pages.

export const PAGE_SIZE = 1000;

type PageResult = PromiseLike<{ data: any; error: any }>;

/** Reads every row by calling `build(from, to)` page by page. The query must have a stable order. */
export async function fetchAll<T>(build: (from: number, to: number) => PageResult): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}
