import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import React from "react";
import Dashboard from "@/app/(tabs)/index";
import { APARTMENTS, BUILDINGS, isoShift, press, pressableWith, pushes, render, setup, textOf, type Role } from "./harness";
import { cases } from "../rand";
import { dubaiISO, toISO, addDays } from "@/lib/dates";

// The Dashboard screen rendered with random portfolios at random moments: every
// number on it is checked against an independent count of the same data.

beforeAll(() => vi.useFakeTimers({ toFake: ["Date"] }));
afterAll(() => vi.useRealTimers());

const STATUSES = ["confirmed", "pending", "checked-in", "checked-out", "cancelled"] as const;

const scen = cases(2500, 9101, (r) => {
  const now = Date.UTC(2026, r.int(0, 11), r.int(1, 28), r.int(0, 23), r.int(0, 59));
  const today = toISO(new Date(now));
  const role = r.pick(["super_admin", "admin", "owner"] as const) as Role;
  const perms = { show_financial: r.bool(), show_contacts: r.bool() };
  const reservations = Array.from({ length: r.int(0, 9) }, (_, i) => {
    const ci = isoShift(today, r.int(-6, 6));
    return {
      id: `r${i}`, user_id: "x", apartment_id: r.pick(APARTMENTS).id, guest_name: r.pick(["Ann Lee", "Bob Ray", "Chen Wu", "Dana Kim", "Eve"]) + ` ${i}`,
      guest_email: "", guest_phone: r.bool() ? `+97150${r.int(1000000, 9999999)}` : "",
      check_in: ci, check_out: isoShift(ci, r.int(1, 7)), status: r.pick(STATUSES), total_price: r.pick([0, 450, 1200, 3999.5]), source: r.pick(["booking", "airbnb", "direct"]),
      created_at: r.bool(0.85) ? new Date(now - r.int(0, 60) * 3600_000).toISOString() : null,
    };
  });
  const blocked = r.bool(0.3)
    ? [{ id: "k1", user_id: "x", apartment_id: r.pick(APARTMENTS).id, start_date: isoShift(today, r.int(-30, 1)), end_date: isoShift(today, r.int(-1, 30)), reason: r.pick(["Out of management", "Maintenance"]) }]
    : [];
  return { now, role, perms, reservations, blocked };
});

describe("Dashboard numbers match the data", () => {
  it.each(scen)("%s", async (_l, c) => {
    vi.setSystemTime(c.now);
    setup(c.role, c.perms, { buildings: BUILDINGS, apartments: APARTMENTS, reservations_safe: c.reservations, blocked_dates: c.blocked });
    const { r, unmount } = await render(<Dashboard />);
    const text = textOf(r);
    const today = toISO(new Date(c.now));
    const tomorrow = toISO(addDays(new Date(c.now), 1));
    const live = c.reservations.filter((x) => x.status !== "cancelled");
    const out = new Set(c.blocked.filter((b) => b.reason === "Out of management" && b.start_date <= today && b.end_date >= today).map((b) => b.apartment_id));
    const activeApts = APARTMENTS.filter((a) => !out.has(a.id));
    const free = activeApts.filter((a) => !live.some((x) => x.apartment_id === a.id && today >= x.check_in && today < x.check_out));
    const received = c.reservations.filter((x) => x.created_at && dubaiISO(new Date(x.created_at)) === dubaiISO(new Date(c.now)));
    const active = c.reservations.filter((x) => x.status === "confirmed" || x.status === "checked-in").length;

    expect(text).toContain(`Buildings | 2 | ${activeApts.length} apartments`);
    expect(text).toContain(`Today's Reservations | ${received.length} | ${active} active bookings`);
    expect(text).toContain(`Available Units | ${free.length}`);
    expect(text).toContain(`Today's Check-ins | ${live.filter((x) => x.check_in === today).length}`);
    expect(text).toContain(`Today's Check-outs | ${live.filter((x) => x.check_out === today).length}`);
    expect(text).toContain(`Tomorrow's Check-ins | ${live.filter((x) => x.check_in === tomorrow).length}`);
    expect(text).toContain(`Tomorrow's Check-outs | ${live.filter((x) => x.check_out === tomorrow).length}`);
    expect(text).toContain(`Today's Available Units | ${free.length}`);

    // Upcoming: check-ins today through the next 2 days, never past or cancelled.
    const last = toISO(addDays(new Date(c.now), 2));
    const upcoming = live.filter((x) => x.check_in >= today && x.check_in <= last);
    const upcomingPart = text.slice(text.indexOf("Upcoming Reservations"));
    for (const x of c.reservations) expect(upcomingPart.includes(x.guest_name)).toBe(upcoming.includes(x));
    if (!upcoming.length) expect(upcomingPart).toContain("No check-ins in the next 2 days");

    // Prices only with the financial permission (admins have it), phones only with contacts.
    // Only the plain "admin" role gets every permission (website rule); others use user_permissions.
    const fin = c.role === "admin" || c.perms.show_financial;
    const contacts = c.role === "admin" || c.perms.show_contacts;
    for (const x of upcoming) {
      expect(upcomingPart.includes(`AED ${x.total_price}`)).toBe(fin);
      if (x.guest_phone) expect(upcomingPart.includes(x.guest_phone)).toBe(contacts);
    }

    // Tapping Today's Reservations lists exactly the bookings received today, and a row opens it.
    await press(pressableWith(r, "Today's Reservations"));
    const sheet = textOf(r).slice(textOf(r).lastIndexOf("Reservations received today"));
    for (const x of c.reservations) expect(sheet.includes(x.guest_name)).toBe(received.includes(x));
    if (!received.length) expect(sheet).toContain("No reservations received today");
    else {
      await press(pressableWith(r, received[0].guest_name));
      expect(pushes().at(-1)).toMatchObject({ pathname: "/reservation/[id]" });
    }
    await unmount();
  });
});
