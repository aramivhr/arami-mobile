import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { Alert } from "react-native";
import ReservationRoute from "@/app/reservation/[id]";
import { APARTMENTS, BUILDINGS, hosts, navOptions, press, pressableWith, pushes, render, setParams, setup, settle, textOf, type, type Role } from "./harness";
import { cases } from "../rand";
import { reservationNumber } from "@/lib/company";
import { formatAmount } from "@/lib/dates";

// The reservation page rendered for random reservations, user types and
// permissions: what it shows, who gets Message, and the Create PDF flow
// (ID prefilled, saved on the reservation, the PDF issued and shared).

afterEach(() => vi.restoreAllMocks());

const scen = cases(2500, 9201, (r, i) => {
  const source = r.pick(["booking", "airbnb", "direct"] as const);
  const role = r.pick(["super_admin", "admin", "owner"] as const) as Role;
  const id = `${r.pick(["0a1b2c3d", "9f8e7d6c", "12345678"])}-aaaa-bbbb-cccc-${String(i).padStart(12, "0")}`;
  const res = {
    id, user_id: "x", apartment_id: r.pick(APARTMENTS).id,
    guest_name: r.pick(["Ann Lee", "Bob <Ray>", "José Núñez", "Chen & Wu", ""]),
    guest_email: r.pick(["", "ann@example.com"]), guest_phone: r.pick(["", "+971501234567"]),
    check_in: "2026-10-05", check_out: r.pick(["2026-10-06", "2026-10-09", "2026-11-05"]),
    status: r.pick(["confirmed", "pending", "checked-in", "checked-out", "cancelled"] as const),
    total_price: r.pick([0, 450, 1234.5, 37000]), source,
    direct_payment_method: source === "direct" ? r.pick(["cash", "payment_link", "bank_transfer", null] as const) : null,
    notes: r.pick([null, "", "Late arrival", "Needs <crib> & towels"]),
    adults: r.pick([null, 1, 2, 4]), children: r.pick([null, 0, 1, 3]), infants: r.pick([null, 0, 1]),
    guest_ages: r.pick([null, [], [4], [2, 9]]),
    currency: r.pick([null, "AED", "USD"]),
    external_booking_id: source === "direct" ? null : r.pick([null, "6758442714", "HMABCD1234"]),
    amount_before_tax: r.pick([null, 900, 1100.25]),
    ota_commission: r.pick([null, 0, 130.44]),
    created_at: r.pick([undefined, "2026-10-01T09:15:00.000Z"]),
  };
  return {
    role,
    perms: { show_financial: r.bool(), show_contacts: r.bool() },
    res,
    onFile: r.pick([null, "P7654321"]),
    typed: r.pick(["", "  ", "P1234567", "<X&Y>"]),
    others: r.pick(["", "Jane Doe — P7654321"]),
    threads: r.pick(["linked", "byName", "none", "error"] as const),
  };
});

describe("Reservation page", () => {
  it.each(scen)("%s", async (_l, c) => {
    const db = setup(c.role, c.perms, {
      buildings: BUILDINGS,
      apartments: APARTMENTS,
      reservations_safe: [c.res],
      reservations: [{ ...c.res, guest_id_number: c.onFile, additional_guests: null }],
    });
    db.functionHandler = async (name, body) => {
      if (name !== "channex-messages" || body.action !== "threads") return {};
      if (c.threads === "error") return { error: "Channex down" };
      if (c.threads === "none") return { threads: [] };
      return {
        threads: [
          c.threads === "linked"
            ? { id: "t-linked", reservation_id: c.res.id, guest_name: "Someone else", check_in: null, check_out: null }
            : { id: "t-name", reservation_id: null, guest_name: c.res.guest_name, check_in: c.res.check_in, check_out: c.res.check_out },
        ],
      };
    };
    setParams({ id: c.res.id });
    const alerts = vi.spyOn(Alert, "alert");
    const { r, unmount } = await render(<ReservationRoute />);
    const text = textOf(r);

    expect(navOptions().title).toBe(reservationNumber(c.res.id));
    expect(text).toContain(c.res.external_booking_id || reservationNumber(c.res.id));

    const fin = c.role === "admin" || c.perms.show_financial;
    const contacts = c.role === "admin" || c.perms.show_contacts;
    const channel = c.res.source !== "direct";
    expect(text.includes("| Phone |")).toBe(contacts);
    expect(text.includes("| Email |")).toBe(contacts);
    expect(text).toContain(`Adults | ${c.res.adults ?? "—"}`);
    const ages = (c.res.guest_ages ?? []).filter((a) => a != null);
    expect(text).toContain(`Children | ${c.res.children != null ? `${c.res.children}${ages.length ? ` (ages ${ages.join(", ")})` : ""}` : "—"}`);
    expect(text.includes("Infants |")).toBe(!!c.res.infants);
    expect(text).toContain(`Source | ${{ booking: "Booking.com", airbnb: "Airbnb", direct: "Direct" }[c.res.source]}`);
    expect(text.includes("Booking number |")).toBe(channel);
    expect(text.includes("Payment method |")).toBe(!channel && !!c.res.direct_payment_method);
    expect(text.includes("Booked on |")).toBe(true);

    const cur = c.res.currency ?? "AED";
    expect(text.includes("Total price |")).toBe(fin);
    if (fin) {
      expect(text).toContain(`Total price | ${formatAmount(c.res.total_price)} ${cur}`);
      expect(text).toContain(`Commissionable amount | ${formatAmount(c.res.amount_before_tax ?? c.res.total_price)} ${cur}`);
      const commission = c.res.ota_commission != null ? `${formatAmount(c.res.ota_commission)} ${cur}` : channel ? "Not sent by channel" : "—";
      expect(text).toContain(`Commission | ${commission}`);
    } else {
      expect(text).not.toContain("Commission");
    }
    const notes = (c.res.notes ?? "").trim();
    expect(text).toContain(`Notes from the guest | ${notes || "No notes"}`);

    // Message: channel bookings, admins and super admins only.
    const canMessage = channel && c.role !== "owner";
    expect(text.includes("| Message")).toBe(canMessage);
    if (canMessage) {
      await press(pressableWith(r, "Message"));
      if (c.threads === "linked") expect(pushes().at(-1)).toEqual({ pathname: "/thread/[id]", params: { id: "t-linked" } });
      else if (c.threads === "byName" && c.res.guest_name.split(/[^\p{L}]+/u).some((w) => w.length > 1))
        expect(pushes().at(-1)).toEqual({ pathname: "/thread/[id]", params: { id: "t-name" } });
      else {
        expect(pushes()).toHaveLength(0);
        expect(alerts).toHaveBeenCalledTimes(1);
        alerts.mockClear();
      }
    }

    // Create PDF: the ID on file is prefilled; issuing saves it and shares the PDF.
    await press(pressableWith(r, "Create PDF"));
    const inputs = hosts(r, "TextInput");
    expect(inputs).toHaveLength(2);
    expect(inputs[0].props.value).toBe(c.onFile ?? "");
    if (c.typed || !c.onFile) await type(inputs[0], c.typed);
    if (c.others) await type(hosts(r, "TextInput")[1], c.others);
    await press(pressableWith(r, "Issue confirmation"));
    await settle();
    const id = (c.typed || !c.onFile ? c.typed : c.onFile).trim();
    const printed = (globalThis as any).__printed as string[];
    if (!id) {
      expect(alerts).toHaveBeenCalledWith("Passport / ID number needed", expect.any(String));
      expect(printed).toHaveLength(0);
      expect(db.tables.reservations[0].guest_id_number).toBe(c.onFile);
    } else {
      expect(printed).toHaveLength(1);
      const esc = id.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      expect(printed[0]).toContain(esc);
      expect(printed[0].includes("Amount paid")).toBe(fin && channel);
      expect(printed[0].includes("Total amount")).toBe(fin);
      expect(printed[0].includes(`<td class="l">Phone</td>`)).toBe(contacts);
      expect(db.tables.reservations[0].guest_id_number).toBe(id);
      expect(db.tables.reservations[0].additional_guests).toBe(c.others || null);
      expect((globalThis as any).__shared).toEqual(["file:///tmp/out.pdf"]);
    }
    await unmount();
  });

  it("says so when the reservation doesn't exist", async () => {
    setup("admin", {}, { buildings: BUILDINGS, apartments: APARTMENTS, reservations_safe: [] });
    setParams({ id: "missing" });
    const { r, unmount } = await render(<ReservationRoute />);
    expect(textOf(r)).toContain("This reservation could not be found.");
    await unmount();
  });
});
