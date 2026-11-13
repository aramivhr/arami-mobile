import { describe, expect, it } from "vitest";
import { dayCell, orderOverlap, overlapGroup, type OverlapStay } from "@/lib/calendar-overlaps";

const stay = (id: string, check_in: string, check_out: string, extra: Partial<OverlapStay> = {}): OverlapStay => ({
  id,
  apartment_id: "2303",
  check_in,
  check_out,
  status: "confirmed",
  created_at: "2026-11-01T00:00:00Z",
  ...extra,
});

describe("dayCell", () => {
  const guest = stay("guest", "2026-11-11", "2026-11-14", { created_at: "2026-11-01T10:00:00Z" });
  const ob = stay("ob", "2026-11-13", "2026-11-15", { created_at: "2026-11-12T10:00:00Z", is_overbooking: true });
  const row = [guest, ob];

  it("shows a single stay normally", () => {
    expect(dayCell(row, "2026-11-12")).toEqual({ type: "reserved", stay: guest });
    expect(dayCell(row, "2026-11-14")).toEqual({ type: "reserved", stay: ob });
  });

  it("marks a night with two stays as an overlap, overbooking last", () => {
    const cell = dayCell(row, "2026-11-13");
    expect(cell.type).toBe("overlap");
    expect(cell.type === "overlap" && cell.stays.map((s) => s.id)).toEqual(["guest", "ob"]);
  });

  it("keeps checkout/check-in days as a split, not an overlap", () => {
    const a = stay("a", "2026-11-01", "2026-11-05");
    const b = stay("b", "2026-11-05", "2026-11-08");
    expect(dayCell([a, b], "2026-11-05")).toEqual({ type: "split", checkout: a, checkin: b });
  });

  it("ignores cancelled stays", () => {
    expect(dayCell([guest, { ...ob, status: "cancelled" }], "2026-11-13")).toEqual({ type: "reserved", stay: guest });
    expect(dayCell([], "2026-11-13")).toEqual({ type: "free" });
  });
});

describe("orderOverlap", () => {
  it("puts the last booking that came in last", () => {
    const a = stay("a", "2026-11-01", "2026-11-05", { created_at: "2026-11-03T00:00:00Z" });
    const b = stay("b", "2026-11-01", "2026-11-05", { created_at: "2026-10-01T00:00:00Z" });
    expect(orderOverlap([a, b]).map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("puts a flagged overbooking last even if it was created earlier", () => {
    const ob = stay("ob", "2026-11-01", "2026-11-05", { created_at: "2026-10-01T00:00:00Z", is_overbooking: true });
    const g = stay("g", "2026-11-01", "2026-11-05", { created_at: "2026-11-03T00:00:00Z" });
    expect(orderOverlap([ob, g]).map((s) => s.id)).toEqual(["g", "ob"]);
  });
});

describe("overlapGroup", () => {
  it("collects the stays on the same unit that overlap the clicked one", () => {
    const guest = stay("guest", "2026-11-11", "2026-11-14");
    const ob = stay("ob", "2026-11-13", "2026-11-15", { is_overbooking: true });
    const later = stay("later", "2026-11-15", "2026-11-18");
    const elsewhere = { ...stay("x", "2026-11-12", "2026-11-14"), apartment_id: "6301" };
    expect(overlapGroup([guest, ob, later, elsewhere], ob).map((s) => s.id)).toEqual(["guest", "ob"]);
    expect(overlapGroup([guest, ob, later, elsewhere], later).map((s) => s.id)).toEqual(["later"]);
  });
});
