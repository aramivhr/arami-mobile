import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { Alert } from "react-native";
import ReservationRoute from "@/app/reservation/[id]";
import BuildingEmailRoute from "@/app/building-email";
import { APARTMENTS, BUILDINGS, hosts, press, pressableWith, render, setParams, settle, setup, textOf, type, type Role } from "./harness";
import { cases } from "../rand";
import * as web from "../web/building-email";

// The reservation page's Edit and Email building, and the More menu's
// "Email a building", with the website's rights: Edit for admins or users with
// "can edit reservations" (every booking, the source kept), Email building for
// admins and super admins, sent through send-building-email with the photos.

afterEach(() => {
  vi.restoreAllMocks();
  (globalThis as any).__picked = undefined;
});

const BLDS = BUILDINGS.map((b, i) => ({ ...b, email: i === 0 ? "security@marinagate.ae" : null }));
const APTS: (typeof APARTMENTS[number] & { building_email?: string })[] = APARTMENTS.map((a) => (a.id === "a3" ? { ...a, building_email: "unit302@bay.ae" } : a));

const scen = cases(600, 9301, (r, i) => {
  const source = r.pick(["booking", "airbnb", "direct"] as const);
  return {
    role: r.pick(["super_admin", "admin", "owner"] as const) as Role,
    perms: { can_edit_reservations: r.bool(), show_contacts: r.bool(), show_financial: r.bool() },
    res: {
      id: `0a1b2c3d-aaaa-bbbb-cccc-${String(i).padStart(12, "0")}`, user_id: "x", apartment_id: r.pick(APTS).id,
      guest_name: r.pick(["Ann Lee", "José Núñez"]), guest_email: "", guest_phone: r.pick(["", "+971501234567"]),
      check_in: "2026-11-06", check_out: "2026-11-09",
      status: r.pick(["confirmed", "pending", "cancelled"] as const), total_price: 900, source,
      direct_payment_method: source === "direct" ? "cash" : null, notes: r.pick([null, "Late arrival"]),
      adults: 2, children: 0, infants: 0, created_at: "2026-11-01T09:00:00Z",
    },
    newName: r.pick(["Ann Lee-Smith", "Bob Ray"]),
    photos: r.int(0, 2),
  };
});

describe("Reservation page: Edit and Email building", () => {
  it.each(scen)("%s", async (_l, c) => {
    const db = setup(c.role, c.perms, { buildings: BLDS, apartments: APTS, reservations_safe: [c.res], reservations: [{ ...c.res }] });
    db.functionHandler = async (name) => (name === "send-building-email" ? { sent: true, sent_to: "x@y.z", sent_at: "now" } : {});
    setParams({ id: c.res.id });
    const alerts = vi.spyOn(Alert, "alert");
    const { r, unmount } = await render(<ReservationRoute />);
    const text = textOf(r);

    // Website rule: perms.can_edit_reservations || perms.isAdmin, where isAdmin means an "admin" role row.
    const canEdit = c.role === "admin" || c.perms.can_edit_reservations;
    const contacts = c.role === "admin" || c.perms.show_contacts;
    const canEmail = c.role !== "owner" && c.res.status !== "cancelled";
    expect(text.includes("| Edit |") || text.endsWith("| Edit")).toBe(canEdit);
    expect(text.includes("Email building")).toBe(canEmail);

    if (canEdit) {
      await press(pressableWith(r, /^Edit$/));
      expect(textOf(r)).toContain("Edit Reservation");
      // Payment method only for Arami's own bookings.
      expect(textOf(r).includes("Payment Method")).toBe(c.res.source === "direct");
      const name = hosts(r, "TextInput").find((n) => n.props.value === c.res.guest_name)!;
      await type(name, c.newName);
      if (!c.res.guest_phone && contacts) {
        await press(pressableWith(r, "Save Changes"));
        expect(alerts).toHaveBeenCalledWith("Missing fields", expect.any(String));
        expect(db.tables.reservations[0].guest_name).toBe(c.res.guest_name);
      } else {
        await press(pressableWith(r, "Save Changes"));
        await settle();
        const saved = db.tables.reservations[0];
        expect(saved.guest_name).toBe(c.newName);
        expect(saved.source).toBe(c.res.source);
        expect(saved.direct_payment_method).toBe(c.res.source === "direct" ? "cash" : null);
        expect(db.functionCalls.some((f) => f.name === "notify-reservation-change")).toBe(true);
      }
      alerts.mockClear();
    }

    if (canEmail) {
      const apt = APTS.find((a) => a.id === c.res.apartment_id)!;
      const bld = BLDS.find((b) => b.id === apt.building_id)!;
      const to = (apt.building_email || bld.email || "").trim();
      await press(pressableWith(r, "Email building"));
      let t = textOf(r);
      expect(t.includes("has no building email yet")).toBe(!to);
      (globalThis as any).__picked = {
        canceled: false,
        assets: Array.from({ length: c.photos }, (_, k) => ({ uri: `file:///p${k}.jpg`, width: 3000, height: 2000 })),
      };
      if (c.photos) await press(pressableWith(r, "Choose photos"));
      await settle();
      t = textOf(r);
      const input = {
        purpose: "check_in" as const, buildingName: bld.name, unit: apt.name, guestName: c.res.guest_name, guestPhone: c.res.guest_phone,
        checkIn: c.res.check_in, checkOut: c.res.check_out, visitDate: "", visitors: "", notes: "", idCount: c.photos,
      };
      const missing = web.missingFields(input);
      if (missing.length) expect(t).toContain(`Still needed: ${missing.join(", ")}.`);
      else expect(t).toContain(web.buildBuildingEmail(input).subject);
      const sendBtn = pressableWith(r, "Send to building");
      expect(!!sendBtn.props.disabled).toBe(missing.length > 0 || !to);
      if (!sendBtn.props.disabled) {
        await press(sendBtn);
        await settle();
        const sent = db.functionCalls.filter((f) => f.name === "send-building-email");
        expect(sent).toHaveLength(1);
        expect(sent[0].body).toMatchObject({
          apartment_id: apt.id, reservation_id: c.res.id, purpose: "check_in",
          guest_name: c.res.guest_name, guest_phone: c.res.guest_phone, check_in: c.res.check_in, check_out: c.res.check_out,
        });
        expect(sent[0].body.attachments).toHaveLength(c.photos);
        expect(sent[0].body.attachments[0]).toEqual({ filename: "id-1.jpg", content_type: "image/jpeg", base64: "QUJD" });
        expect(alerts).toHaveBeenCalledWith("Email sent", "Sent to x@y.z");
      }
    }
    await unmount();
  });
});

describe("More > Email a building", () => {
  it("lists units with their email and sends a cleaning visit", async () => {
    const db = setup("admin", {}, { buildings: BLDS, apartments: APTS });
    db.functionHandler = async () => ({ sent: true, sent_to: "unit302@bay.ae", sent_at: "now" });
    const { r, unmount } = await render(<BuildingEmailRoute />);
    const t = textOf(r);
    expect(t).toContain("1204 | security@marinagate.ae");
    expect(t).toContain("B-302 | unit302@bay.ae");
    expect(t).toContain("B-410 | No building email yet");
    await press(pressableWith(r, "B-302"));
    (globalThis as any).__picked = { canceled: false, assets: [{ uri: "file:///c.jpg", width: 800, height: 600 }] };
    await press(pressableWith(r, "Take photo"));
    await settle();
    expect(textOf(r)).toContain("Cleaning – Unit B-302, Bay Square");
    await press(pressableWith(r, "Send to building"));
    await settle();
    const sent = db.functionCalls.filter((f) => f.name === "send-building-email");
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toMatchObject({ apartment_id: "a3", purpose: "cleaning" });
    expect(sent[0].body.visit_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sent[0].body.reservation_id).toBeUndefined();
    await unmount();
  });

  it("is hidden from owners", async () => {
    setup("owner", {}, { buildings: BLDS, apartments: APTS });
    const { r, unmount } = await render(<BuildingEmailRoute />);
    expect(textOf(r)).toContain("You don't have access to this page.");
    await unmount();
  });
});
