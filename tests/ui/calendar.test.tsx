import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import React from "react";
import CalendarScreen from "@/app/(tabs)/calendar";
import { APARTMENTS, BUILDINGS, isoShift, press, pushes, render, setup, textOf, byLabel, type Role } from "./harness";
import { cases } from "../rand";
import { buildOverbookings } from "@/lib/overbookings";
import { dateStr, daysInMonth, formatAmount, formatMonth, nightsBetween } from "@/lib/dates";

// The calendar rendered for random months: overbooking rows (admins only),
// price-first booking labels, the legend, and the overbooking details sheet.

beforeAll(() => vi.useFakeTimers({ toFake: ["Date"] }));
afterAll(() => vi.useRealTimers());

const MAPPINGS = [
  { entity_type: "property", channex_id: "p1", internal_id: "a1" },
  { entity_type: "property", channex_id: "p2", internal_id: "g1" },
  { entity_type: "room_type", channex_id: "rt1", internal_id: "g1" },
];

const scen = cases(1500, 9301, (r) => {
  const year = 2026;
  const month = r.int(0, 11);
  const now = Date.UTC(year, month, r.int(1, 28), 8);
  const first = dateStr(year, month, 1);
  const role = r.pick(["super_admin", "admin", "owner"] as const) as Role;
  const reservations = Array.from({ length: r.int(0, 6) }, (_, i) => {
    const ci = isoShift(first, r.int(-5, 30));
    return {
      id: `r${i}`, user_id: "x", apartment_id: r.pick(APARTMENTS).id, guest_name: r.pick(["Annabelle Lee", "Bo Ray", "Chen Wu"]),
      guest_email: "", guest_phone: "", check_in: ci, check_out: isoShift(ci, r.int(1, 8)),
      status: r.pick(["confirmed", "pending", "cancelled"] as const), total_price: r.pick([450, 1234.5, 12000]),
      source: r.pick(["booking", "airbnb", "direct"] as const), external_booking_id: r.bool() ? `OTA${i}` : null,
    };
  });
  const intake = Array.from({ length: r.int(0, 4) }, (_, i) => {
    const ci = isoShift(first, r.int(-10, 35));
    return {
      channex_booking_id: `bk${i}`,
      channex_property_id: r.pick(["p1", "p2", "p9"]),
      received_at: `2026-0${r.int(1, 9)}-0${r.int(1, 9)}T10:00:00Z`,
      status: r.pick(["needs_manual_assignment", "needs_manual_assignment", "applied"]),
      error: null,
      raw_revision: {
        data: {
          attributes: {
            status: r.pick(["new", "new", "cancelled"]),
            ota_name: r.pick(["BookingCom", "Airbnb"]),
            ota_reservation_code: `OB${i}`,
            arrival_date: ci,
            departure_date: isoShift(ci, r.int(1, 6)),
            amount: r.pick(["2500", undefined]),
            currency: "AED",
            customer: { name: r.pick(["Zed", "Yara"]), surname: `Q${i}` },
            rooms: [{ room_type_id: "rt1", occupancy: { adults: 2, children: r.int(0, 2) } }],
          },
        },
      },
    };
  });
  return { now, year, month, role, fin: r.bool(), reservations, intake };
});

describe("Calendar", () => {
  it.each(scen)("%s", async (_l, c) => {
    vi.setSystemTime(c.now);
    setup(c.role, { show_financial: c.fin }, {
      buildings: BUILDINGS, apartments: APARTMENTS, reservations_safe: c.reservations, blocked_dates: [],
      channex_booking_intake: c.intake, channex_mapping: MAPPINGS,
    });
    const { r, unmount } = await render(<CalendarScreen />);
    const text = textOf(r);
    expect(text).toContain(formatMonth(c.year, c.month));

    const n = daysInMonth(c.year, c.month);
    const start = dateStr(c.year, c.month, 1);
    const end = dateStr(c.year, c.month, n);
    const admin = c.role !== "owner";
    const all = admin ? buildOverbookings(c.intake as any, MAPPINGS, APARTMENTS, c.reservations) : [];
    const shown = all.filter((o) => !(o.checkOut <= start || o.checkIn > end));
    expect(r.root.findAll((x) => (x.type as unknown) === "Text" && x.children.join("") === "Overbooking")).toHaveLength(shown.length);
    expect(text.includes("Overbooking (no free unit)")).toBe(all.length > 0);
    for (const o of shown) expect(text).toContain(`OVERBOOKING · ${o.guestName}`);

    // Booking bars: price first with the financial permission, name only otherwise.
    const fin = c.role === "admin" || c.fin;
    // (Only stays that don't overlap another stay in the same unit: like the
    // website, an overlapping stay is drawn under the first one.)
    const live = c.reservations.filter((x) => x.status !== "cancelled");
    const clash = (x: (typeof live)[number]) => live.some((y) => y !== x && y.apartment_id === x.apartment_id && y.check_in < x.check_out && x.check_in < y.check_out);
    for (const x of live.filter((x) => x.check_in >= start && x.check_in <= end && !clash(x))) {
      const first = x.guest_name.split(" ")[0];
      const name = nightsBetween(x.check_in, x.check_out) < 4 ? first.slice(0, 2) : first;
      const label = fin ? `${formatAmount(x.total_price)} · ${name}` : name;
      expect(text).toContain(label);
    }

    // Tapping an overbooking opens its details.
    if (shown.length) {
      const o = shown[0];
      await press(byLabel(r, `Overbooking: ${o.guestName}`)[0]);
      const t = textOf(r);
      expect(t).toContain(`Booking number | ${o.ref}`);
      expect(t).toContain("Can go in |");
      expect(t.includes("| Total |")).toBe(fin && o.amount != null);
      expect(t).toContain("it imports automatically within 2 minutes");
    }
    // Month arrows move one month either way.
    await press(byLabel(r, "Next month")[0]);
    const next = new Date(c.year, c.month + 1, 1);
    expect(textOf(r)).toContain(formatMonth(next.getFullYear(), next.getMonth()));
    await press(byLabel(r, "Previous month")[0]);
    await press(byLabel(r, "Previous month")[0]);
    const prev = new Date(c.year, c.month - 1, 1);
    expect(textOf(r)).toContain(formatMonth(prev.getFullYear(), prev.getMonth()));
    expect(pushes()).toEqual([]);
    await unmount();
  });
});
