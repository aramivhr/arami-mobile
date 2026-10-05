import { describe, expect, it } from "vitest";
import { addMonths, startOfMonth, startOfYear, subMonths } from "date-fns";
import { computeFinancial, presets, type ManageFilter } from "@/lib/financial";
import { webFinancial } from "./web/financial";
import { cases, rng } from "./rand";
import type { Reservation } from "@/lib/types";

// The website's own Financial calculation is the reference. It works with
// local Date objects, so the comparison is exact in time zones without
// daylight saving (Dubai, UTC); elsewhere only the app's own rules are checked.
const noDst = new Date(2026, 0, 1).getTimezoneOffset() === new Date(2026, 6, 1).getTimezoneOffset();
const local = (iso: string) => new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const shift = (iso: string, n: number) => {
  const d = new Date(Date.parse(iso));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe("Financial numbers match the website's Financial page", () => {
  const finCases = cases(1500, 81, (r) => {
    const apartments = ["a1", "a2", "a3", "a4"].map((id) => ({ id, manage_type: r.pick(["sublease", "revenue_share", null] as const) }));
    const reservations: Reservation[] = Array.from({ length: r.int(0, 15) }, (_, i) => {
      const ci = r.iso(2026, 2026);
      const source = r.pick(["booking", "airbnb", "direct"] as const);
      return {
        id: `r${i}`, user_id: "u", apartment_id: r.pick(apartments).id, guest_name: "G", guest_email: "", guest_phone: "",
        check_in: ci, check_out: shift(ci, r.pick([0, 1, 2, 3, 7, 14, 31, 60])), status: r.pick(["confirmed", "pending", "cancelled", "checked-out"] as const),
        total_price: r.pick([0, 450, 1000, 1234.56, 9999.99, 37000]), source,
        direct_payment_method: source === "direct" ? r.pick(["cash", "payment_link", "bank_transfer", null] as const) : null,
      };
    });
    const financeRows = apartments.filter(() => r.bool(0.5)).map((a) => ({ apartment_id: a.id, contract_end: r.bool(0.5) ? r.iso(2026, 2026) : null }));
    const start = r.iso(2026, 2026);
    return {
      apartments, reservations, financeRows,
      selected: apartments.filter(() => r.bool(0.3)).map((a) => a.id),
      manage: r.pick(["all", "all", "sublease", "revenue_share"] as ManageFilter[]),
      start, end: shift(start, r.pick([1, 7, 28, 30, 31, 90, 365])),
    };
  });

  it.each(finCases)("%s", (_l, c) => {
    const app = computeFinancial(c);
    // Independent checks of the rules.
    expect(app.totalAmount).toBeCloseTo(app.breakdown.reduce((s, b) => s + b.proRatedAmount, 0), 6);
    expect(app.totalAmount).toBeCloseTo(Object.values(app.bySource).reduce((s, v) => s + v, 0), 6);
    expect(app.occupancy).toBeGreaterThanOrEqual(0);
    expect(app.occupancy).toBeLessThanOrEqual(100);
    for (const b of app.breakdown) {
      expect(b.reservation.status).not.toBe("cancelled");
      expect(b.proRatedDays).toBeGreaterThan(0);
      expect(b.proRatedAmount).toBeLessThanOrEqual(b.reservation.total_price + 0.01);
    }
    if (!noDst) return;
    const web = webFinancial({ ...c, selectedApartments: c.selected, manageFilter: c.manage, startDate: local(c.start), endDate: local(c.end) })!;
    expect(app.totalAmount).toBe(web.totalAmount);
    expect(app.totalCheckIns).toBe(web.totalCheckIns);
    expect(app.bySource).toEqual(web.bySource);
    expect(app.byDirectPayment).toEqual(web.byDirectPayment);
    expect(app.bookedNights).toBe(web.bookedNights);
    expect(app.capacity).toBe(web.capacity);
    expect(app.occupancy).toBe(web.occupancy);
    expect(app.breakdown.map((b) => [b.reservation.id, b.proRatedAmount, b.proRatedDays, b.isCheckIn])).toEqual(
      web.breakdown.map((b: any) => [b.reservation.id, b.proRatedAmount, b.proRatedDays, b.isCheckIn]),
    );
  });
});

describe("quick date ranges match the website's presets", () => {
  const r = rng(82);
  const nowCases = cases(200, 83, (g) => new Date(g.int(2024, 2030), g.int(0, 11), g.int(1, 28), g.int(0, 23)).getTime(), String);
  it.each(nowCases)("now=%s", (_l, ms) => {
    void r;
    const now = new Date(ms);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const web = [
      [startOfMonth(now), addMonths(startOfMonth(now), 1)],
      [startOfMonth(subMonths(now, 1)), addMonths(startOfMonth(subMonths(now, 1)), 1)],
      [startOfMonth(subMonths(now, 2)), startOfMonth(now)],
      [startOfYear(now), startOfMonth(now)],
      [startOfYear(now), addMonths(startOfYear(now), 12)],
    ].map(([a, b]) => [iso(a), iso(b)]);
    expect(presets(now).map((p) => [p.from, p.to])).toEqual(web);
  });
});
