import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {}, invokeFunction: vi.fn() }));
vi.mock("@/hooks/auth", () => ({ useAuth: () => ({}) }));

import { diffReservation, getOverlappingReservations } from "@/hooks/data";
import { diffReservation as webDiff, getOverlappingReservations as webOverlap } from "./web/oracle";
import { cases } from "./rand";
import type { Reservation } from "@/lib/types";

const STATUSES = ["confirmed", "pending", "cancelled", "checked-in", "checked-out"] as const;

function makeRes(r: ReturnType<typeof import("./rand").rng>, i: number): Reservation {
  const ci = r.iso(2026, 2026);
  const n = r.int(0, 20);
  const d = new Date(Date.parse(ci));
  d.setUTCDate(d.getUTCDate() + n);
  return {
    id: `r${i}`,
    user_id: "u",
    apartment_id: r.pick(["a1", "a2", "a3"]),
    guest_name: r.str(8),
    guest_email: r.pick(["", "g@x.com", null as unknown as string]),
    guest_phone: r.pick(["", "+971500000000", null as unknown as string]),
    check_in: ci,
    check_out: d.toISOString().slice(0, 10),
    status: r.pick(STATUSES),
    total_price: r.pick([0, 1200, 1200.5, 99999]),
    source: r.pick(["direct", "airbnb", "booking"] as const),
    adults: r.pick([null, 1, 2]),
    children: r.pick([null, 0, 1]),
    infants: r.pick([null, 0]),
    notes: r.pick([null, "", "late arrival"]),
  };
}

describe("overlap check matches the website exactly (double-booking warning)", () => {
  const overlapCases = cases(1500, 21, (r) => {
    const list = Array.from({ length: r.int(0, 12) }, (_, i) => makeRes(r, i));
    const ci = r.iso(2026, 2026);
    const d = new Date(Date.parse(ci));
    d.setUTCDate(d.getUTCDate() + r.int(0, 15));
    return { list, apt: r.pick(["a1", "a2", "a3", "a4"]), ci, co: d.toISOString().slice(0, 10), exclude: r.bool() ? `r${r.int(0, 12)}` : undefined };
  });
  it.each(overlapCases)("%s", (_l, c) => {
    const app = getOverlappingReservations(c.list, c.apt, c.ci, c.co, c.exclude).map((x) => x.id);
    const web = (webOverlap(c.list, c.apt, c.ci, c.co, c.exclude) as Reservation[]).map((x) => x.id);
    expect(app).toEqual(web);
    // Independent check: same unit, not cancelled, not itself, and the nights intersect (checkout day is free).
    for (const x of c.list) {
      const clash = x.apartment_id === c.apt && x.status !== "cancelled" && x.id !== c.exclude && x.check_in < c.co && x.check_out > c.ci;
      expect(app.includes(x.id)).toBe(clash);
    }
  });
});

describe("change summary in alert emails matches the website", () => {
  const FIELDS = ["guest_name", "apartment_id", "check_in", "check_out", "status", "total_price", "adults", "children", "infants", "guest_phone", "guest_email", "notes", "source"] as const;
  const diffCases = cases(1000, 22, (r, i) => {
    const before = r.bool(0.05) ? undefined : makeRes(r, i);
    const other = makeRes(r, i + 1);
    const updates: Partial<Reservation> = {};
    for (const f of FIELDS) if (r.bool(0.4)) (updates as any)[f] = r.bool(0.5) ? (other as any)[f] : before ? (before as any)[f] : null;
    return { before, updates };
  });
  it.each(diffCases)("%s", (_l, { before, updates }) => {
    expect(diffReservation(before, updates)).toEqual(webDiff(before, updates));
  });
});
