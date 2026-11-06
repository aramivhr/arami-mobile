// Supabase (PostgREST) returns at most 1000 rows per request and drops the
// rest without an error. Any list that can grow past that has to be read in
// pages, or the newest rows silently vanish from the app. Same helper as the website (rent-halo-system src/lib/fetch-all.ts).

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
