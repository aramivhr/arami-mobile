import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import React from "react";
import ThreadRoute from "@/app/thread/[id]";
import InspectionsRoute from "@/app/(tabs)/inspections";
import InspectionRoute from "@/app/inspection/[id]";
import { APARTMENTS, BUILDINGS, byLabel, hosts, pressableWith, press, render, setParams, setup, settle, textOf, type, type Role } from "./harness";
import { cases } from "../rand";
import { store } from "../stubs/async-storage";

// Super admins see who submitted each inspection and which staff member sent
// each reply to a guest; admins and everyone else see no change.

beforeAll(() => vi.useFakeTimers({ toFake: ["Date"] }));
afterAll(() => vi.useRealTimers());

const NOW = Date.UTC(2026, 9, 5, 12);
const STAFF = [
  { id: "anna", username: "Anna", email: "anna@arami.app", created_at: "2025-01-01T00:00:00Z" },
  { id: "ben", username: "", email: "ben.r@arami.app", created_at: "2025-01-01T00:00:00Z" },
];

const scen = cases(216, 4242, (r) => ({
  role: r.pick(["super_admin", "admin"] as const) as Role,
  // Before Lovable adds mobile_staff_names(), names come from profiles if readable.
  namesBy: r.pick(["rpc", "profiles", "none"] as const),
  replyBy: r.pick(["anna", "ben", null] as const),
  reply: r.pick(["Thanks!", "The code is 4321", ""]),
  inspector: r.pick(["anna", "ben", "me", null] as const),
}));

describe("Staff attribution", () => {
  it.each(scen)("%s", async (_l, c) => {
    vi.setSystemTime(NOW);
    store.clear();
    const db = setup(c.role, {}, { apartments: APARTMENTS, buildings: BUILDINGS });
    const superAdmin = c.role === "super_admin";
    if (c.namesBy === "rpc") db.rpcHandlers.mobile_staff_names = () => STAFF.map(({ id, username, email }) => ({ id, username, email }));
    if (c.namesBy === "profiles") db.tables.profiles = STAFF;
    const name = (id: string) => (c.namesBy === "none" ? (id === "me" ? "You" : "Unknown staff member") : id === "anna" ? "Anna" : id === "ben" ? "ben.r" : "You");

    // ---- Messages ----
    const thread = { id: "t1", title: null, provider: "AirBNB", thread_kind: null, last_message: "In the lockbox", last_message_at: "2026-10-05T10:02:00Z", unit: "1204", building: null, guest_name: "Guest", guest_phone: null, check_in: null, check_out: null, status: null, total_price: null, currency: null, adults: null, children: null, infants: null, guest_ages: null };
    const msgs = [
      { id: "g1", text: "Where is the key?", sender: "guest", at: "2026-10-05T10:00:00Z" },
      { id: "p1", text: "In the lockbox", sender: "property", at: "2026-10-05T10:02:00Z" },
    ];
    db.tables.mobile_message_senders = c.replyBy ? [{ id: "n1", thread_id: "t1", body: "In the lockbox", user_id: c.replyBy, sent_at: "2026-10-05T10:02:05Z" }] : [];
    db.functionHandler = async (_n, body) => {
      if (body.action === "threads") return { threads: [thread] };
      if (body.action === "messages") return { messages: msgs };
      if (body.action === "send") {
        msgs.push({ id: `p${msgs.length}`, text: body.text, sender: "property", at: new Date(NOW).toISOString() });
        return { ok: true };
      }
      return {};
    };
    setParams({ id: "t1" });
    const th = await render(<ThreadRoute />);
    let text = textOf(th.r);
    if (!superAdmin) expect(text).not.toMatch(/Sent by|Sender not recorded/);
    else if (c.replyBy) expect(text).toContain(`Sent by ${name(c.replyBy)}`);
    else expect(text).toContain("Sender not recorded (sent outside the app)");
    // No other role ever reads the notes or staff names.
    if (!superAdmin) {
      expect(db.calls.some((x) => x.table === "mobile_message_senders" && x.op === "select")).toBe(false);
      expect(db.rpcCalls).toHaveLength(0);
    }

    // Every reply from the app is noted with who sent it, whoever sends it.
    if (c.reply) {
      await type(hosts(th.r, "TextInput")[0], c.reply);
      await press(byLabel(th.r, "Send")[0]);
      await settle();
      const notes = db.tables.mobile_message_senders.filter((n) => n.body === c.reply);
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({ thread_id: "t1", user_id: "me" });
      if (superAdmin) {
        await th.unmount();
        const again = await render(<ThreadRoute />);
        expect(textOf(again.r).split(`Sent by ${name("me")}`).length - 1).toBeGreaterThanOrEqual(1);
        await again.unmount();
      } else await th.unmount();
    } else await th.unmount();

    // ---- Inspections ----
    db.tables.mobile_inspections = [
      { id: "i1", reservation_id: null, apartment_id: "a1", template_id: null, due_date: "2026-10-04", urgent: false, status: "completed", inspector_id: c.inspector, guest_name: "Guest A", check_in: "2026-10-01", check_out: "2026-10-04", results: [], general_notes: null, summary: null, damage_found: false, started_at: null, completed_at: "2026-10-04T10:00:00Z", created_at: "2026-10-04T00:00:00Z", updated_at: "2026-10-04T00:00:00Z" },
    ];
    const list = await render(<InspectionsRoute />);
    await press(pressableWith(list.r, "Previous inspections"));
    text = textOf(list.r);
    expect(text).toContain("Guest A");
    if (superAdmin && c.inspector) expect(text).toContain(`· submitted by ${name(c.inspector)}`);
    else expect(text).not.toContain("submitted by");
    await list.unmount();

    setParams({ id: "i1" });
    const one = await render(<InspectionRoute />);
    text = textOf(one.r);
    if (superAdmin && c.inspector) expect(text).toContain(`Submitted by ${name(c.inspector)}`);
    else expect(text).not.toContain("Submitted by");
    await press(pressableWith(one.r, "Share PDF"));
    const html = ((globalThis as any).__printed as string[]).at(-1)!;
    if (superAdmin && c.inspector) expect(html).toContain("<td>Submitted by</td>");
    else expect(html).not.toContain("Submitted by");
    await one.unmount();
  });
});

describe("Finishing an inspection", () => {
  it.each(["anna", null] as const)("records whoever presses Finish as the submitter (started by %s)", async (startedBy) => {
    vi.setSystemTime(NOW);
    store.clear();
    const db = setup("admin", {}, { apartments: APARTMENTS, buildings: BUILDINGS });
    db.tables.mobile_inspections = [
      { id: "i2", reservation_id: null, apartment_id: "a1", template_id: null, due_date: "2026-10-05", urgent: false, status: startedBy ? "in_progress" : "pending", inspector_id: startedBy, guest_name: "Guest B", check_in: "2026-10-01", check_out: "2026-10-05", results: [], general_notes: null, summary: null, damage_found: false, started_at: null, completed_at: null, created_at: "2026-10-05T00:00:00Z", updated_at: "2026-10-05T00:00:00Z" },
    ];
    const { Alert } = await import("react-native");
    const alerts = vi.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === "Finish")?.onPress?.();
    });
    setParams({ id: "i2" });
    const one = await render(<InspectionRoute />);
    expect(textOf(one.r)).not.toContain("Started by");
    await press(pressableWith(one.r, "Finish inspection"));
    await settle();
    expect(db.tables.mobile_inspections[0].inspector_id).toBe("me");
    expect(db.functionCalls.some((f) => f.name === "mobile-inspection-complete" && f.body.inspection_id === "i2")).toBe(true);
    alerts.mockRestore();
    await one.unmount();
  });
});
