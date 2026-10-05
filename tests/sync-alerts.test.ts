import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./fakeSupabase";
import { alertDedupeKey, dubaiDay, recordSyncAlert } from "./web/sync-alert-core";
import { loadFunction, post, useFake } from "./deno";
import { cases } from "./rand";
import { notificationTarget, pushTarget } from "@/lib/notify";
import { dubaiISO } from "@/lib/dates";

vi.mock("@/lib/supabase", () => ({ supabase: {}, invokeFunction: vi.fn() }));

// The website's Channex sync alerts (supabase/functions/_shared/sync-alert-core.ts,
// run read-only from tests/web), which create the "alert" notifications the app
// shows as "Needs attention": one per issue per Dubai day, emailed once, never
// breaking the sync that raised them. Then the real mobile-push-dispatch runs on
// the result: until the Lovable prompt (map alert -> sync_failure) is applied,
// these alerts reach the Notifications page but not phones.

let dispatch: (req: Request) => Promise<Response>;
beforeAll(async () => {
  dispatch = await loadFunction("mobile-push-dispatch");
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterAll(() => vi.useRealTimers());

const KEYS = ["no-unit:BookingCom:5228929505", "no-unit:Airbnb:HM1", "import:BookingCom:77", "push:availability:a1", "ack:bk9", "feed"];

const scen = cases(2000, 9901, (r) => {
  const start = Date.UTC(2026, r.int(0, 11), r.int(1, 27), r.int(0, 23), r.int(0, 59));
  const events = Array.from({ length: r.int(1, 12) }, () => ({
    at: start + r.int(0, 40) * 3600_000 + r.int(0, 59) * 60_000,
    key: r.pick(KEYS),
    reservationId: r.pick([null, null, "r1"]),
    emailFails: r.bool(0.15),
    dbDown: r.bool(0.08),
  }));
  events.sort((a, b) => a.at - b.at);
  return { events, admins: r.int(0, 3), settingOff: r.bool(0.3) };
});

describe("Channex sync alerts", () => {
  it.each(scen)("%s", async (_l, c) => {
    const db = new FakeSupabase({ unique: { notifications: [["dedupe_key"]], mobile_push_log: [["source", "source_id"]] } });
    const emails: string[] = [];
    const firstOfDay = new Set<string>();
    for (const e of c.events) {
      vi.setSystemTime(e.at);
      db.offline = e.dbDown ? "connection lost" : null;
      const sent = await recordSyncAlert(
        db,
        { key: e.key, title: `Problem ${e.key}`, lines: ["line 1", `line 2 <${e.key}>`], reservationId: e.reservationId },
        async (_a, dedupe) => {
          if (e.emailFails) throw new Error("email service down");
          emails.push(dedupe);
        },
        new Date(e.at),
      );
      const dk = `alert:${e.key}:${dubaiISO(new Date(e.at))}`;
      expect(alertDedupeKey(e.key, new Date(e.at))).toBe(dk);
      expect(dubaiDay(new Date(e.at))).toBe(dubaiISO(new Date(e.at)));
      const fresh = !e.dbDown && !firstOfDay.has(dk);
      expect(sent).toBe(fresh);
      if (fresh) firstOfDay.add(dk);
    }
    db.offline = null;

    // Exactly one notification per issue per Dubai day, shaped as the app expects.
    const rows = db.tables.notifications ?? [];
    expect(rows.map((n) => n.dedupe_key).sort()).toEqual([...firstOfDay].sort());
    for (const n of rows) {
      expect(n.kind).toBe("alert");
      expect(n.body).toContain("\n");
      // Tapping it in the app opens its reservation, or the reservations list.
      expect(notificationTarget(n as any)).toEqual(n.reservation_id ? { pathname: "/reservation/[id]", params: { id: n.reservation_id } } : "/reservations");
      expect(pushTarget({ type: "notification", kind: "alert", reservation_id: n.reservation_id })).toEqual(notificationTarget(n as any));
    }
    // Emailed at most once each (an email failure still keeps the notification).
    expect(new Set(emails).size).toBe(emails.length);
    for (const k of emails) expect(firstOfDay.has(k)).toBe(true);

    // The real phone-alert job, run twice like the cron.
    const last = c.events.at(-1)!.at + 60_000;
    vi.setSystemTime(last);
    db.tables.user_roles = Array.from({ length: c.admins }, (_, i) => ({ user_id: `u${i}`, role: "admin" }));
    db.tables.mobile_devices = Array.from({ length: c.admins }, (_, i) => ({ user_id: `u${i}`, expo_push_token: `ExponentPushToken[u${i}]` }));
    db.tables.mobile_notification_settings = c.settingOff ? [{ user_id: "u0", sync_failure: false }] : [];
    for (const t of ["reservations", "mobile_inspections", "channex_sync_log", "channex_mapping", "channex_booking_intake", "apartments", "mobile_inspection_templates"]) db.tables[t] ??= [];
    useFake(db);
    (globalThis as any).__channexFetch = async () => ({ ok: true, status: 200, body: { data: [] } });
    (globalThis as any).__sendEmail = async () => {};
    const pushed: any[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: any) => {
      const msgs = JSON.parse(init.body);
      pushed.push(...msgs);
      return new Response(JSON.stringify({ data: msgs.map(() => ({ status: "ok" })) }));
    });
    for (let i = 0; i < 2; i++) {
      const res = await (await dispatch(post({}))).json();
      for (const k of Object.keys(res)) expect(k.endsWith("_error"), JSON.stringify(res)).toBe(false);
    }
    vi.unstubAllGlobals();
    // Today's dispatcher has no setting for "alert", so none of these go to phones yet.
    expect(pushed.filter((m) => m.data?.kind === "alert")).toEqual([]);
  });
});
