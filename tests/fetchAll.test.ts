import { describe, expect, it } from "vitest";
import { fetchAll, PAGE_SIZE } from "../src/lib/fetchAll";

const pagedSource = (total: number) => (from: number, to: number) =>
  Promise.resolve({
    data: Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => from + i),
    error: null,
  });

describe("fetchAll", () => {
  it("reads past the 1000-row page limit", async () => {
    const rows = await fetchAll<number>(pagedSource(1084));
    expect(rows).toHaveLength(1084);
    expect(rows[1083]).toBe(1083);
  });

  it("stops after an exactly full last page", async () => {
    expect(await fetchAll<number>(pagedSource(PAGE_SIZE * 2))).toHaveLength(PAGE_SIZE * 2);
  });

  it("throws the query error", async () => {
    await expect(fetchAll(() => Promise.resolve({ data: null, error: new Error("boom") }))).rejects.toThrow("boom");
  });
});
