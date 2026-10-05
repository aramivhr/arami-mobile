import { describe, expect, it } from "vitest";
import { buildOverbookings } from "@/lib/overbookings";
import { bookingRows, bodyFields, isChannelBooking, takeNewBookings } from "@/lib/newBookingAlert";
import { findThreadForReservation } from "@/lib/threads";
import { notificationTarget, pushTarget } from "@/lib/notify";
import { confirmationHtml } from "@/lib/confirmation";
import { formatAmount } from "@/lib/dates";
import * as web from "./web/overbookings";
import * as webAlert from "./web/new-booking-alert";
import * as webMsg from "./web/messages-api";
import { cases } from "./rand";
import type { Reservation, Thread } from "@/lib/types";

// Website changes 94f190f..2fb1ffb (overbookings, sync alerts, new-booking
// pop-up, Message button, receipt): the app's copies against the live website code.

const shift = (iso: string, n: number) => {
  const d = new Date(Date.parse(iso));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe("Overbooking rows match the website's calendar", () => {
  const apartments = [
    { id: "a1", room_type_id: null },
    { id: "a2", room_type_id: "g1" },
    { id: "a3", room_type_id: "g1" },
    { id: "a4", room_type_id: "g2" },
  ];
  const obCases = cases(800, 501, (r) => {
    const bookingIds = ["b1", "b2", "b3", "b4"];
    const intake = Array.from({ length: r.int(0, 8) }, () => {
      const ci = r.iso(2026, 2026);
      const rooms = Array.from({ length: r.pick([0, 1, 1, 2, 3]) }, () => ({
        room_type_id: r.pick(["rt1", "rt2", "rtX", undefined]),
        checkin_date: r.bool(0.8) ? ci : undefined,
        checkout_date: r.bool(0.8) ? shift(ci, r.int(1, 9)) : undefined,
        amount: r.pick([undefined, "", "1200.50", 900, "abc"]),
        occupancy: r.bool(0.7) ? { adults: r.int(1, 4), children: r.int(0, 2) } : undefined,
      }));
      const attrs = {
        status: r.pick(["new", "modified", "cancelled"]),
        ota_reservation_code: r.bool(0.8) ? `OTA${r.int(1, 99)}` : undefined,
        ota_name: r.pick(["BookingCom", "Airbnb", undefined]),
        arrival_date: r.bool(0.9) ? ci : undefined,
        departure_date: r.bool(0.9) ? shift(ci, r.int(1, 9)) : undefined,
        amount: r.pick([undefined, "3000", 450.25]),
        currency: r.pick([undefined, "AED", "USD"]),
        customer: r.pick([undefined, { name: " Ann ", surname: "Lee" }, { full_name: " Bob Ray " }, { name: "", surname: "" }]),
        rooms,
        occupancy: r.bool(0.5) ? { adults: 2, children: 1 } : undefined,
      };
      const raw = r.pick(["data", "attributes", "dataOnly", "plain", "none"]);
      return {
        channex_booking_id: r.pick(bookingIds),
        channex_property_id: r.pick(["p1", "p2", "p3"]),
        received_at: `2026-10-0${r.int(1, 5)}T0${r.int(0, 9)}:00:00Z`,
        status: r.pick(["needs_manual_assignment", "needs_manual_assignment", "applied", "failed", "received"]),
        error: r.pick([null, "no free unit"]),
        raw_revision:
          raw === "data" ? { data: { attributes: attrs } } : raw === "attributes" ? { attributes: attrs } : raw === "dataOnly" ? { data: attrs } : raw === "plain" ? attrs : undefined,
      };
    });
    const mappings = [
      { entity_type: "property", channex_id: "p1", internal_id: "a1" },
      { entity_type: "property", channex_id: "p2", internal_id: "g1" },
      { entity_type: "property", channex_id: "p2", internal_id: "g2" },
      { entity_type: "room_type", channex_id: "rt1", internal_id: "g1" },
      { entity_type: "room_type", channex_id: "rt2", internal_id: "g2" },
    ].filter(() => r.bool(0.9));
    const reservations = Array.from({ length: r.int(0, 3) }, () => ({
      external_booking_id: r.pick([null, `OTA${r.int(1, 99)}`, `OTA${r.int(1, 99)}-2`]),
      status: r.pick(["confirmed", "cancelled"]),
    }));
    return { intake, mappings, reservations };
  });
  it.each(obCases)("%s", (_l, c) => {
    expect(buildOverbookings(c.intake, c.mappings, apartments, c.reservations)).toEqual(web.buildOverbookings(c.intake, c.mappings, apartments, c.reservations));
  });
});

describe("New-booking pop-up picks the same bookings as the website", () => {
  const nCases = cases(400, 502, (r) => {
    const mk = (i: number) => ({
      id: `n${r.int(1, 12)}`,
      kind: r.pick(["new", "new", "modified", "message"]),
      title: "New reservation",
      body: r.pick([
        "Guest: Ann\nSource: Booking.com\nCheck-in: 2026-10-05\nCheck-out: 2026-10-07\nBuilding: Tower\nApartment: 1201\nTotal amount: 900 AED",
        "Guest: Bob\nChanged in app by: x@arami.app",
        " indented: line\nBooking number: 123\nApartment: —\nBuilding: —",
        r.str(30),
      ]),
      reservation_id: r.bool(0.8) ? `r${i}` : null,
      created_at: `2026-10-05T1${r.int(0, 9)}:00:00Z`,
    });
    const seen = r.bool(0.3) ? null : new Set(Array.from({ length: r.int(0, 5) }, () => `n${r.int(1, 12)}`));
    return { seen, latest: Array.from({ length: r.int(0, 8) }, (_, i) => mk(i)) };
  }, (c) => JSON.stringify({ s: c.seen ? [...c.seen] : null, l: c.latest }));
  it.each(nCases)("%s", (_l, c) => {
    const a = takeNewBookings(c.seen ? new Set(c.seen) : null, c.latest);
    const b = webAlert.takeNewBookings(c.seen ? new Set(c.seen) : null, c.latest);
    expect([...a.seen].sort()).toEqual([...b.seen].sort());
    expect(a.fresh.map((n) => n.id)).toEqual(b.fresh.map((n) => n.id));
    for (const n of c.latest) {
      expect(isChannelBooking(n)).toBe(webAlert.isChannelBooking(n));
      expect(bodyFields(n.body)).toEqual(webAlert.bodyFields(n.body));
    }
  });

  it("shows the website's rows", () => {
    expect(bookingRows("Guest: Ann\nSource: Airbnb\nBuilding: Tower\nApartment: —\nCheck-in: 2026-10-05\nCheck-out: 2026-10-07\nTotal amount: 900 AED")).toEqual([
      ["Guest", "Ann"],
      ["Channel", "Airbnb"],
      ["Apartment", "Tower"],
      ["Dates", "2026-10-05 → 2026-10-07"],
      ["Total", "900 AED"],
    ]);
  });
});

describe("Message finds the same conversation as the website's Message button", () => {
  const tCases = cases(600, 503, (r) => {
    const names = ["Ann Lee", "ann", "Bob Ray", "Ray", "José Núñez", "", "A B"];
    const ci = "2026-10-05";
    const threads = Array.from({ length: r.int(0, 6) }, (_, i) => ({
      id: `t${i}`,
      title: r.pick([null, "Booking.com guest", ...names]),
      guest_name: r.pick([null, ...names]),
      check_in: r.pick([null, ci, shift(ci, 1)]),
      check_out: r.pick([null, shift(ci, 2), shift(ci, 3)]),
      reservation_id: r.pick([undefined, null, "r1", "r2"]),
    })) as unknown as Thread[];
    const res = { id: r.pick(["r1", "r2", "r3"]), guest_name: r.pick(names), check_in: r.pick([ci, shift(ci, 1)]), check_out: r.pick([shift(ci, 2), shift(ci, 3)]) };
    return { threads, res };
  });
  it.each(tCases)("%s", (_l, c) => {
    expect(findThreadForReservation(c.threads, c.res)?.id ?? null).toBe(webMsg.findThreadForReservation(c.threads as never, c.res)?.id ?? null);
  });
});

describe("Sync alerts", () => {
  it("open the reservation they name, else the reservations list, like the website", () => {
    expect(notificationTarget({ kind: "alert", reservation_id: "r1", dedupe_key: "alert:no-unit:x:2026-10-05" })).toEqual({ pathname: "/reservation/[id]", params: { id: "r1" } });
    expect(notificationTarget({ kind: "alert", reservation_id: null, dedupe_key: "alert:feed:2026-10-05" })).toBe("/reservations");
  });
  it("phone alerts for them open the same place", () => {
    expect(pushTarget({ type: "notification", kind: "alert", reservation_id: "r1" })).toEqual({ pathname: "/reservation/[id]", params: { id: "r1" } });
    expect(pushTarget({ type: "notification", kind: "bogus" })).toBe("/notifications");
  });
});

describe("Receipt and amounts follow the website", () => {
  const base: Reservation = {
    id: "11111111-2222-3333-4444-555555555555", user_id: "u", apartment_id: "a", guest_name: "Ann", guest_email: "", guest_phone: "",
    check_in: "2026-10-05", check_out: "2026-10-07", status: "confirmed", total_price: 1234.5, source: "booking",
  };
  it("channel bookings show the amount as paid with nothing left", () => {
    const html = confirmationHtml({ r: base, showFinancial: true, showContacts: false, idNumber: "P1", additionalGuests: "", issued: "2026-10-05" });
    expect(html).toContain("Amount paid");
    expect(html).toContain("Balance remaining");
  });
  it("direct bookings show only the total", () => {
    const html = confirmationHtml({ r: { ...base, source: "direct" }, showFinancial: true, showContacts: false, idNumber: "P1", additionalGuests: "", issued: "2026-10-05" });
    expect(html).toContain("Total amount");
    expect(html).not.toContain("Amount paid");
  });
  it("no figures without the financial permission", () => {
    const html = confirmationHtml({ r: base, showFinancial: false, showContacts: false, idNumber: "P1", additionalGuests: "", issued: "2026-10-05" });
    expect(html).not.toContain("Amount paid");
  });
  it.each([[1234.5, "1,234.5"], [900, "900"], [0, "0"], [null, "0"], ["12.345", "12.35"], ["abc", "abc"]] as const)("formatAmount(%s)", (v, out) => {
    expect(formatAmount(v)).toBe(out);
  });
});
