import { describe, expect, it } from "vitest";
import { fetchAll, PAGE_SIZE } from "@/lib/fetchAll";

const pagedSource = (total: number) => (from: number, to: number) =>
  Promise.resolve({
    data: Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => from + i),
    error: null,
  });

describe("fetchAll", () => {
  it("reads past the 1000-row page limit", async () => {
    const rows = await fetchAll<number>(pagedSource(1083));
    expect(rows).toHaveLength(1083);
    expect(rows[1082]).toBe(1082);
  });
  it("stops after an exactly full last page", async () => {
    expect(await fetchAll<number>(pagedSource(PAGE_SIZE * 2))).toHaveLength(PAGE_SIZE * 2);
  });
  it("reads an empty table", async () => {
    expect(await fetchAll<number>(pagedSource(0))).toEqual([]);
  });
  it("throws the query error", async () => {
    await expect(fetchAll(() => Promise.resolve({ data: null, error: new Error("boom") }))).rejects.toThrow("boom");
  });
});
