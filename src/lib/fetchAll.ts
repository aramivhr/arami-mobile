// Supabase returns at most 1000 rows per request and silently drops the rest.
// There are more than 1000 reservations, so a single request hid every stay
// past the cut-off (the newest check-ins) and the dashboard counts came out
// lower than the website's. Same helper as the website's src/lib/fetch-all.ts.

export const PAGE_SIZE = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
