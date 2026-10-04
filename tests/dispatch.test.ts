import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./fakeSupabase";
import { loadFunction, post, useFake } from "./deno";
import { cases, rng } from "./rand";
import { ALERT_TYPES } from "./pushTypes";

// Runs the website's real mobile-push-dispatch function (copied read-only from
// rent-halo-system) against random data, twice in a row like the every-minute
// cron, and checks who gets which phone alert.

const dubai = (d: Date) => new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
const SETTING_BY_KIND: Record<string, string> = { new: "reservation_new", modified: "reservation_modified", cancelled: "reservation_cancelled", message: "guest_message" };

let dispatch: (req: Request) => Promise<Response>;
beforeAll(async () => {
  dispatch = await loadFunction("mobile-push-dispatch");
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterAll(() => vi.useRealTimers());

function scenario(seed: number) {
  const r = rng(seed);
  const now = Date.UTC(2026, r.int(0, 11), r.int(1, 28), r.int(0, 23), r.int(0, 59));
  const today = dubai(new Date(now));
  const ago = (h: number) => new Date(now - h * 3600_000).toISOString();
  const shift = (iso: string, n: number) => {
    const d = new Date(Date.parse(iso));
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  const users = Array.from({ length: r.int(0, 6) }, (_, i) => ({
    id: `u${i}`,
    roles: [...new Set(Array.from({ length: r.int(0, 2) }, () => r.pick(["admin", "super_admin", "user"])))],
    devices: Array.from({ length: r.int(0, 2) }, (_, k) => `ExponentPushToken[u${i}d${k}]`),
    settings: r.bool(0.5) ? Object.fromEntries(ALERT_TYPES.map((k) => [k, r.bool(0.75)])) : null,
  }));
  const apartments = [
    { id: "a1", name: "1204", buildings: { name: "Marina Gate" } },
    { id: "a2", name: "B-302", buildings: { name: "Bay Square" } },
    { id: "a3", name: "PH", buildings: null },
  ];
  const reservations = Array.from({ length: r.int(0, 8) }, (_, i) => {
    const ci = shift(today, r.int(-6, 3));
    return { id: `r${i}`, apartment_id: r.pick(apartments).id, guest_name: r.pick(["Maria", "John", null]), check_in: ci, check_out: r.bool(0.4) ? today : shift(ci, r.int(1, 6)), status: r.pick(["confirmed", "cancelled", "Cancelled", "pending", null]) };
  });
  const notifications = Array.from({ length: r.int(0, 8) }, (_, i) => {
    const kind = r.pick(["new", "modified", "cancelled", "message", "other"]);
    return { id: `n${i}`, kind, title: `T${i}`, body: `B${i}`, reservation_id: kind === "message" || !reservations.length ? null : r.pick(reservations).id, dedupe_key: kind === "message" ? `msg:t${i}:x` : null, created_at: ago(r.pick([0.01, 1, 5, 23.9, 24.1, 48])) };
  });
  const inspections = Array.from({ length: r.int(0, 4) }, (_, i) => ({
    id: `i${i}`, reservation_id: `old${i}`, apartment_id: r.pick(apartments).id, due_date: today, urgent: r.bool(), status: r.pick(["pending", "completed"]),
    damage_found: r.bool(), guest_name: "G", created_at: ago(r.pick([1, 30])), completed_at: r.bool() ? ago(r.pick([1, 30])) : null,
  }));
  const syncLog = Array.from({ length: r.int(0, 3) }, (_, i) => ({ id: `s${i}`, kind: "availability", error: r.bool() ? "x".repeat(r.int(1, 300)) : null, created_at: ago(r.pick([1, 30])) }));
  const threads = Array.from({ length: r.int(0, 3) }, (_, i) => ({
    id: `th${i}`,
    attributes: { title: `Guest ${i}`, provider: "AirBNB", last_message: r.bool(0.8) ? `hello ${i}` : null, last_message_received_at: ago(0.1 * (i + 1)) },
    relationships: {},
  }));
  const alreadyNotified = threads.filter(() => r.bool(0.3)).map((t) => `msg:${t.id}:${t.attributes.last_message_received_at}`);
  const dead = new Set(users.flatMap((u) => u.devices).filter(() => r.bool(0.1)));
  return { now, today, users, apartments, reservations, notifications, inspections, syncLog, threads, alreadyNotified, dead };
}

describe("phone alerts from mobile-push-dispatch", () => {
  const scenarios = cases(1000, 71, (r) => r.int(1, 2 ** 31), (s) => String(s));

  it.each(scenarios)("scenario %s", async (_l, seed) => {
    const s = scenario(seed);
    vi.setSystemTime(s.now);
    const apt = (id: string) => s.apartments.find((a) => a.id === id) ?? null;
    const db = new FakeSupabase({
      unique: { notifications: [["dedupe_key"]], mobile_push_log: [["source", "source_id"]], mobile_inspections: [["reservation_id"]], mobile_devices: [["expo_push_token"]] },
      join: (table, row, select) => (select.includes("apartments(") && (table === "mobile_inspections" || table === "reservations") ? { ...row, apartments: apt(row.apartment_id) } : row),
    });
    db.tables.user_roles = s.users.flatMap((u) => u.roles.map((role) => ({ user_id: u.id, role })));
    db.tables.mobile_devices = s.users.flatMap((u) => u.devices.map((t) => ({ user_id: u.id, expo_push_token: t })));
    db.tables.mobile_notification_settings = s.users.filter((u) => u.settings).map((u) => ({ user_id: u.id, ...u.settings }));
    db.tables.notifications = [...s.notifications.map((n) => ({ ...n })), ...s.alreadyNotified.map((k, i) => ({ id: `pre${i}`, kind: "message", title: "x", body: "y", dedupe_key: k, created_at: new Date(s.now - 3600_000 * 30).toISOString() }))];
    db.tables.reservations = s.reservations.map((r) => ({ ...r }));
    db.tables.mobile_inspections = s.inspections.map((i) => ({ ...i }));
    db.tables.mobile_inspection_templates = [{ id: "tpl", is_default: true }];
    db.tables.channex_sync_log = s.syncLog.map((x) => ({ ...x }));
    db.tables.channex_mapping = [];
    db.tables.channex_booking_intake = [];
    db.tables.apartments = s.apartments;
    useFake(db);

    const emails: any[] = [];
    (globalThis as any).__sendEmail = async (...a: any[]) => void emails.push(a);
    (globalThis as any).__channexFetch = async () => ({ ok: true, status: 200, body: { data: s.threads } });
    const sent: { to: string; title: string; data: any }[] = [];
    const batches: number[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: any) => {
      const msgs = JSON.parse(init.body);
      batches.push(msgs.length);
      sent.push(...msgs);
      return new Response(JSON.stringify({ data: msgs.map((m: any) => (s.dead.has(m.to) ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok" })) }));
    });

    const preInspections = new Set(db.tables.mobile_inspections.map((i) => i.id));
    const r1 = await (await dispatch(post({}))).json();
    const r2 = await (await dispatch(post({}))).json();
    vi.unstubAllGlobals();
    for (const res of [r1, r2]) for (const k of Object.keys(res)) expect(k.endsWith("_error"), JSON.stringify(res)).toBe(false);

    // Inspections: one per non-cancelled checkout today, never twice, urgent when someone arrives that day.
    const outs = s.reservations.filter((r) => r.check_out === s.today && String(r.status ?? "").toLowerCase() !== "cancelled");
    const created = db.tables.mobile_inspections.filter((i) => !preInspections.has(i.id));
    expect(created.map((i) => i.reservation_id).sort()).toEqual(outs.map((r) => r.id).sort());
    for (const i of created) {
      const arriving = s.reservations.some((r) => r.apartment_id === i.apartment_id && r.check_in === s.today && String(r.status ?? "").toLowerCase() !== "cancelled");
      expect(i.urgent).toBe(arriving);
      expect(i.template_id).toBe("tpl");
    }

    // Guest messages: a notification and one email for each message seen the first time, none for ones already notified.
    const fresh = s.threads.filter((t) => t.attributes.last_message && !s.alreadyNotified.includes(`msg:${t.id}:${t.attributes.last_message_received_at}`));
    expect(emails.length).toBe(fresh.length);
    for (const e of emails) expect(e[2].idempotencyKey).toMatch(/^guest-message-msg:/);

    // Who should get what, computed independently from the rules Gevorg set.
    const recipients = s.users.filter((u) => u.roles.includes("admin") || u.roles.includes("super_admin"));
    const on = (u: (typeof s.users)[number], setting: string) => !u.settings || u.settings[setting] !== false;
    const since = s.now - 24 * 3600_000;
    const expected = new Map<string, string>(); // `${token}|${source}:${id}` -> title
    const add = (source: string, id: string, setting: string, title: string, superOnly = false) => {
      for (const u of recipients) {
        if (superOnly && !u.roles.includes("super_admin")) continue;
        if (!on(u, setting)) continue;
        for (const t of u.devices) expected.set(`${t}|${source}:${id}`, title);
      }
    };
    for (const n of db.tables.notifications) {
      if (Date.parse(n.created_at) < since || !SETTING_BY_KIND[n.kind]) continue;
      const res = s.reservations.find((r) => r.id === n.reservation_id);
      const last = n.kind === "new" && !!res && res.check_in === dubai(new Date(n.created_at));
      add("notification", n.id, SETTING_BY_KIND[n.kind], `${last ? "Last Minute Reservation: " : ""}${n.title}`);
    }
    for (const i of db.tables.mobile_inspections) {
      if (Date.parse(i.created_at) >= since) add("inspection", i.id, "inspection_due", i.urgent ? "Urgent inspection" : "Inspection due");
      if (i.status === "completed" && i.damage_found && i.completed_at && Date.parse(i.completed_at) >= since) add("damage", i.id, "inspection_damage", "Damage found", true);
    }
    for (const x of s.syncLog) if (x.error && Date.parse(x.created_at) >= since) add("sync_failure", x.id, "sync_failure", "Channel sync failed");

    const key = (m: { to: string; data: any; title: string }) => {
      const source = m.data.type === "notification" ? "notification" : m.data.type === "sync_failure" ? "sync_failure" : m.title === "Damage found" ? "damage" : "inspection";
      const id = m.data.type === "notification" ? db.tables.notifications.find((n) => n.dedupe_key === m.data.dedupe_key && n.reservation_id === m.data.reservation_id && n.title === m.title.replace("Last Minute Reservation: ", ""))?.id : m.data.inspection_id ?? m.data.sync_log_id;
      return `${m.to}|${source}:${id}`;
    };
    const got = sent.map(key);
    // Nobody gets the same alert twice, even though the job ran twice.
    expect(new Set(got).size).toBe(got.length);
    // Exactly the expected alerts, with the expected titles.
    expect([...got].sort()).toEqual([...expected.keys()].sort());
    for (const m of sent) expect(m.title).toBe(expected.get(key(m)));
    // Owners and people without a role never get alerts.
    const ownerTokens = new Set(s.users.filter((u) => !recipients.includes(u)).flatMap((u) => u.devices));
    for (const m of sent) expect(ownerTokens.has(m.to)).toBe(false);
    // Expo accepts at most 100 messages per request.
    for (const b of batches) expect(b).toBeLessThanOrEqual(100);
    // Phones that uninstalled the app are forgotten.
    const left = new Set(db.tables.mobile_devices.map((d) => d.expo_push_token));
    for (const t of s.dead) if (sent.some((m) => m.to === t)) expect(left.has(t)).toBe(false);
  });
});
