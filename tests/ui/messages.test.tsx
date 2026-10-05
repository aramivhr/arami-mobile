import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import React from "react";
import { Alert } from "react-native";
import MessagesScreen from "@/app/(tabs)/messages";
import ThreadRoute from "@/app/thread/[id]";
import { byLabel, hosts, press, pushes, render, setParams, setup, settle, textOf, type, type Role } from "./harness";
import { cases } from "../rand";
import { store } from "../stubs/async-storage";
import { dateTime } from "@/lib/dates";

// Messages list and a conversation, against a fake channex-messages function:
// list and search, unread styling, preloading only the newest 8 two at a time,
// opening a conversation, sending a text reply (shown at once), and a failed
// send putting the text back.

beforeAll(() => vi.useFakeTimers({ toFake: ["Date"] }));
afterAll(() => vi.useRealTimers());

const scen = cases(1000, 9501, (r) => {
  const now = Date.UTC(2026, 9, 5, 12);
  const threads = Array.from({ length: r.int(0, 12) }, (_, i) => ({
    id: `t${i}`, title: r.pick([null, `Booking ${i}`]), provider: r.pick(["AirBNB", "BookingCom", null]),
    thread_kind: r.pick([null, "enquiry", "booking_request"]), last_message: r.pick([null, `hello ${i}`, `Is parking free? ${i}`]),
    last_message_at: r.pick([null, new Date(now - (i + 1) * 3600_000).toISOString()]),
    unit: r.pick([null, "1204", "B-302"]), building: null, guest_name: r.pick([null, `Guest${i}`]),
    guest_phone: null, check_in: null, check_out: null, status: null, total_price: null, currency: null, adults: null, children: null, infants: null, guest_ages: null,
  }));
  const seen = Object.fromEntries(threads.filter(() => r.bool(0.4)).map((t) => [t.id, r.pick(["2000-01-01T00:00:00Z", "2100-01-01T00:00:00Z"])]));
  return {
    now, role: r.pick(["admin", "super_admin"] as const) as Role, threads, seen,
    search: r.pick(["", "", "guest1", "1204", "parking", "zzz"]),
    reply: r.pick(["Thanks!", "  ", "See you at 3pm <b>", ""]),
    sendFails: r.bool(0.2),
  };
});

describe("Messages", () => {
  it.each(scen)("%s", async (_l, c) => {
    vi.setSystemTime(c.now);
    store.clear();
    store.set("messages-seen", JSON.stringify(c.seen));
    const db = setup(c.role, {});
    const messages: Record<string, { id: string; text: string; sender: string; at: string }[]> = {};
    const first = () => [{ id: "m1", text: "Hi there", sender: "guest", at: "2026-10-05T08:00:00Z" }];
    let inFlight = 0;
    let maxInFlight = 0;
    db.functionHandler = async (_n, body) => {
      if (body.action === "threads") return { threads: c.threads };
      if (body.action === "messages") {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((res) => setImmediate(res));
        inFlight--;
        return { messages: messages[body.thread_id] ?? first() };
      }
      if (body.action === "send") {
        if (c.sendFails) throw new Error("Channex rejected it");
        (messages[body.thread_id] ??= first()).push({ id: `m${messages[body.thread_id].length + 1}`, text: body.text, sender: "property", at: "2026-10-05T12:00:00Z" });
        return { ok: true };
      }
      return {};
    };
    const list = await render(<MessagesScreen />);
    let text = textOf(list.r);
    const name = (t: (typeof c.threads)[number]) => t.guest_name || t.title || "Guest";
    if (!c.threads.length) expect(text).toContain("No conversations yet.");
    for (const t of c.threads) expect(text).toContain(name(t));

    // Only the newest 8 conversations are preloaded, at most two at a time.
    const preloaded = new Set(db.functionCalls.filter((f) => f.body.action === "messages").map((f) => f.body.thread_id));
    expect([...preloaded].sort()).toEqual(c.threads.slice(0, 8).map((t) => t.id).sort());
    expect(maxInFlight).toBeLessThanOrEqual(2);

    // Unread: the last message is shown in full colour on threads with a newer message than last seen.
    const unread = c.threads.filter((t) => !!t.last_message_at && (!c.seen[t.id] || c.seen[t.id] < t.last_message_at));
    const rows = () => list.r.root.findAll((x) => (x.type as unknown) === "Pressable" && typeof x.props.onPress === "function");
    rows().forEach((row, i) => {
      const t = c.threads[i];
      expect(textOf(row)).toContain(name(t));
      if (t.last_message) {
        const msg = row.findAll((x) => typeof x.type !== "string" && x.props.numberOfLines === 1 && x.props.children === t.last_message);
        expect(msg[0].props.muted).toBe(!unread.includes(t));
      }
    });

    // Search narrows the list by title, guest, unit or last message.
    if (c.search) {
      await type(hosts(list.r, "TextInput")[0], c.search);
      text = textOf(list.r);
      const q = c.search.toLowerCase();
      const hit = c.threads.filter((t) => [t.title, t.guest_name, t.unit, t.last_message].some((v) => v?.toLowerCase().includes(q)));
      expect(rows()).toHaveLength(hit.length);
      await type(hosts(list.r, "TextInput")[0], "");
    }
    if (!c.threads.length) {
      await list.unmount();
      return;
    }
    const target = c.threads[0];
    await press(rows()[0]);
    expect(pushes().at(-1)).toEqual({ pathname: "/thread/[id]", params: { id: target.id } });
    await list.unmount();

    // The conversation: messages, then a reply.
    setParams({ id: target.id });
    const alerts = vi.spyOn(Alert, "alert");
    const th = await render(<ThreadRoute />);
    expect(textOf(th.r)).toContain("Hi there");
    expect(textOf(th.r)).toContain(dateTime("2026-10-05T08:00:00Z"));
    await type(hosts(th.r, "TextInput")[0], c.reply);
    const send = byLabel(th.r, "Send")[0];
    expect(send.props.disabled).toBe(!c.reply.trim());
    if (c.reply.trim()) {
      await press(send);
      await settle();
      const sent = db.functionCalls.filter((f) => f.body.action === "send");
      expect(sent).toHaveLength(1);
      expect(sent[0].body).toEqual({ action: "send", thread_id: target.id, text: c.reply.trim() });
      if (c.sendFails) {
        expect(alerts).toHaveBeenCalledWith("Message not sent", "Channex rejected it");
        expect(hosts(th.r, "TextInput")[0].props.value).toBe(c.reply.trim());
      } else {
        expect(textOf(th.r)).toContain(c.reply.trim());
        expect(hosts(th.r, "TextInput")[0].props.value).toBe("");
      }
    }
    // Reading the conversation marks it seen on this phone.
    await settle();
    if (target.last_message_at) expect(JSON.parse(store.get("messages-seen")!)[target.id]).toBe(target.last_message_at);
    alerts.mockRestore();
    await th.unmount();
  });
});
