import { describe, expect, it } from "vitest";
import { isLastMinute, notificationTarget, pushTarget, threadIdFromDedupe } from "@/lib/notify";
import { dubaiISO } from "@/lib/dates";
import { cases } from "./rand";

// The backend's rule (mobile-push-dispatch): Intl date in Asia/Dubai.
const backendDubai = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

describe("Dubai date matches the backend's Asia/Dubai date at any moment", () => {
  it.each(cases(300, 31, (r) => Date.UTC(r.int(2024, 2030), r.int(0, 11), r.int(1, 28), r.int(0, 23), r.int(0, 59), r.int(0, 59))))("%s", (_l, ms) => {
    expect(dubaiISO(new Date(ms))).toBe(backendDubai(new Date(ms)));
  });
});

describe("Last Minute label matches the backend's alert prefix rule", () => {
  const lmCases = cases(500, 32, (r) => {
    const created = Date.UTC(2026, r.int(0, 11), r.int(1, 28), r.int(0, 23), r.int(0, 59));
    const day = backendDubai(new Date(created));
    const shift = r.pick([0, 0, 0, 1, -1, 2]);
    const d = new Date(Date.parse(day));
    d.setUTCDate(d.getUTCDate() + shift);
    return {
      kind: r.pick(["new", "new", "modified", "cancelled", "message"] as const),
      hasRes: r.bool(0.9),
      found: r.bool(0.9),
      created: new Date(created).toISOString(),
      check_in: d.toISOString().slice(0, 10),
    };
  });
  it.each(lmCases)("%s", (_l, c) => {
    const n = { kind: c.kind, reservation_id: c.hasRes ? "r1" : null, created_at: c.created };
    const list = c.found ? [{ id: "r1", check_in: c.check_in }] : [{ id: "r2", check_in: c.check_in }];
    const backend = c.kind === "new" && c.hasRes && c.found && c.check_in === backendDubai(new Date(c.created));
    expect(isLastMinute(n, list)).toBe(backend);
  });
});

describe("tapping a notification or alert opens the right screen", () => {
  const ROUTES = ["notification", "inspection", "sync_failure", undefined, "other"] as const;
  const tapCases = cases(700, 33, (r) => ({
    type: r.pick(ROUTES),
    kind: r.pick(["new", "modified", "cancelled", "message", undefined, "weird"]),
    reservation_id: r.pick([null, undefined, "res-1", ""]),
    dedupe_key: r.pick([null, undefined, "msg:th-9:2026-10-04T10:00:00Z", "msg::x", "msg:th-2", "res:1", ""]),
    inspection_id: r.pick([null, undefined, "insp-7", ""]),
  }));
  it.each(tapCases)("%s", (_l, d) => {
    const t = pushTarget(d);
    if (d.type === "inspection") {
      expect(t).toEqual(d.inspection_id ? { pathname: "/inspection/[id]", params: { id: d.inspection_id } } : "/notifications");
    } else if (d.type === "notification" && d.kind === "message") {
      const id = d.dedupe_key?.startsWith("msg:") ? d.dedupe_key.split(":")[1] : "";
      expect(t).toEqual(id ? { pathname: "/thread/[id]", params: { id } } : "/messages");
    } else if (d.type === "notification" && ["new", "modified", "cancelled"].includes(d.kind as string)) {
      expect(t).toEqual(d.reservation_id ? { pathname: "/reservations", params: { id: d.reservation_id } } : "/reservations");
    } else {
      expect(t).toBe("/notifications");
    }
    // Never navigates to an empty id.
    if (typeof t === "object") expect(t.params.id).toBeTruthy();
  });
  it("handles a missing payload", () => expect(pushTarget(undefined)).toBe("/notifications"));
});

describe("notification rows and alerts for the same event open the same screen", () => {
  const sameCases = cases(500, 34, (r) => ({
    kind: r.pick(["new", "modified", "cancelled", "message"] as const),
    reservation_id: r.pick([null, "res-" + r.int(1, 99)]),
    dedupe_key: r.pick([null, `msg:t${r.int(1, 99)}:2026-10-0${r.int(1, 9)}`, `res:${r.int(1, 99)}`]),
  }));
  it.each(sameCases)("%s", (_l, n) => {
    // The alert's data, exactly as mobile-push-dispatch builds it from the notification row.
    const data = { type: "notification", kind: n.kind, reservation_id: n.reservation_id, dedupe_key: n.dedupe_key };
    expect(pushTarget(data)).toEqual(notificationTarget(n));
    expect(threadIdFromDedupe(n.dedupe_key)).toBe(n.dedupe_key?.startsWith("msg:") ? n.dedupe_key.split(":")[1] : null);
  });
});
