import { describe, expect, it } from "vitest";
import { confirmationHtml } from "@/lib/confirmation";
import { reservationNumber } from "@/lib/company";
import { money, nightsBetween, prettyDate } from "@/lib/dates";
import { cases } from "./rand";
import type { Reservation } from "@/lib/types";

// The confirmation PDF (HTML for expo-print) for random reservations and
// permissions: every field the website's receipt prints, in the same rows,
// with every value escaped so a guest's name or note can't break the page.

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
const row = (label: string, value: string, bold = false) => `<tr><td class="l">${esc(label)}</td><td class="v${bold ? " b" : ""}">${esc(value || "—")}</td></tr>`;

const scen = cases(1500, 9951, (r, i) => {
  const source = r.pick(["booking", "airbnb", "direct"] as const);
  const res: Reservation = {
    id: `${r.pick(["abcd1234", "00000000", "ffffeeee"])}-1111-2222-3333-${String(i).padStart(12, "0")}`,
    user_id: "x", apartment_id: "a1",
    guest_name: r.pick(["Ann", "<script>alert(1)</script>", "O'Brien & Sons", "José\nNúñez", r.str(20)]),
    guest_email: r.pick(["", "a@b.co", "x<y>@z"]), guest_phone: r.pick(["", "+971 50 123 4567"]),
    check_in: "2026-10-05", check_out: r.pick(["2026-10-05", "2026-10-06", "2026-12-31"]),
    status: r.pick(["confirmed", "pending", "cancelled", "checked-in", "checked-out"] as const),
    total_price: r.pick([0, 1, 450.5, 1234567.891]), source,
    direct_payment_method: source === "direct" ? r.pick(["cash", "payment_link", "bank_transfer", null] as const) : null,
    notes: r.pick([null, "", "Late check-in", "<b>bold</b>\nline 2"]),
    adults: r.pick([null, 1, 2]), children: r.pick([null, 0, 1, 2]), infants: r.pick([null, 0, 1]),
  };
  const apartment = r.bool(0.8) ? { id: "a1", user_id: "x", building_id: "b1", name: r.pick(["1204", "<PH>"]), type: "1BR", max_guests: r.int(1, 8) } : null;
  const building = apartment && r.bool(0.8) ? { id: "b1", user_id: "x", name: r.pick(["Marina Gate", "A&B Tower"]), address: r.pick(["", "Dubai Marina"]) } : null;
  return { res, apartment, building, fin: r.bool(), contacts: r.bool(), id: r.pick(["P1", "<X>", "A&B 123"]), others: r.pick(["", "Jane — P2", "<b>Kid</b>\nTwo"]) };
});

describe("Confirmation PDF", () => {
  it.each(scen)("%s", (_l, c) => {
    const html = confirmationHtml({ r: c.res, apartment: c.apartment, building: c.building, showFinancial: c.fin, showContacts: c.contacts, idNumber: c.id, additionalGuests: c.others, issued: "2026-10-05" });
    const r = c.res;
    expect(html).toContain(esc(reservationNumber(r.id)));
    expect(html).toContain("Issued 2026-10-05");
    expect(html).toContain(row("Guest name", r.guest_name));
    expect(html).toContain(row("Passport / ID no.", c.id));
    expect(html.includes(row("Phone", r.guest_phone))).toBe(c.contacts);
    expect(html.includes(row("Email", r.guest_email))).toBe(c.contacts);
    expect(html.includes(`<td class="l">Additional guests</td>`)).toBe(!!c.others.trim());
    if (c.others.trim()) expect(html).toContain(row("Additional guests", c.others));
    expect(html).toContain(row("Apartment", c.apartment ? `${c.apartment.name}${c.building ? ` — ${c.building.name}` : ""}` : "—"));
    expect(html.includes(`<td class="l">Address</td>`)).toBe(!!c.building?.address);
    expect(html.includes(`<td class="l">Unit type</td>`)).toBe(!!c.apartment);
    expect(html).toContain(row("Check-in", prettyDate(r.check_in)));
    expect(html).toContain(row("Check-out", prettyDate(r.check_out)));
    expect(html).toContain(row("Nights", String(nightsBetween(r.check_in, r.check_out))));
    expect(html).toContain(row("Status", r.status));
    expect(html).toContain(row("Booking source", { booking: "Booking.com", airbnb: "Airbnb", direct: "Direct" }[r.source]));
    const direct = r.source === "direct";
    expect(html.includes(`<td class="l">Payment method</td>`)).toBe(direct && !!r.direct_payment_method);
    expect(html.includes(row("Total amount", money(Number(r.total_price)), true))).toBe(c.fin);
    expect(html.includes(row("Amount paid", money(Number(r.total_price))))).toBe(c.fin && !direct);
    expect(html.includes(row("Balance remaining", money(0), true))).toBe(c.fin && !direct);
    expect(html.includes("<h3>Notes</h3>")).toBe(!!r.notes);
    // Nothing a guest typed can open a tag.
    for (const v of [r.guest_name, r.guest_email, r.notes ?? "", c.id, c.others, c.apartment?.name ?? "", c.building?.name ?? ""]) {
      if (/[<>]/.test(v)) expect(html).not.toContain(v);
    }
    expect(html.match(/<script/gi)).toBeNull();
  });
});
