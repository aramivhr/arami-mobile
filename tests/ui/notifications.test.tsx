import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import React from "react";
import NotificationsRoute from "@/app/notifications";
import { press, pressableWith, pushes, render, setup, textOf, hosts, type Role } from "./harness";
import { cases } from "../rand";
import { dubaiISO, timeAgo } from "@/lib/dates";
import { notificationTarget } from "@/lib/notify";

// The Notifications screen with random notification lists: who may open it,
// unread count, labels (Needs attention, Last Minute Reservation), icons,
// Mark all read, and where tapping a row goes (marking it read).

beforeAll(() => vi.useFakeTimers({ toFake: ["Date"] }));
afterAll(() => vi.useRealTimers());

const KINDS = ["new", "modified", "cancelled", "message", "alert"] as const;
const ICON: Record<string, string> = { new: "CalendarPlus", modified: "Pencil", cancelled: "CalendarX", message: "MessageSquare", alert: "AlertTriangle" };

const scen = cases(1500, 9401, (r) => {
  const now = Date.UTC(2026, r.int(0, 11), r.int(1, 28), r.int(0, 23), r.int(0, 59));
  const role = r.pick(["super_admin", "admin", "admin", "owner"] as const) as Role;
  const reservations = Array.from({ length: 3 }, (_, i) => ({
    id: `r${i}`, user_id: "x", apartment_id: "a1", guest_name: `G${i}`, guest_email: "", guest_phone: "",
    check_in: r.pick([dubaiISO(new Date(now)), dubaiISO(new Date(now - 86400000)), "2027-01-01"]), check_out: "2027-02-01",
    status: "confirmed", total_price: 1, source: "booking",
  }));
  const notifications = Array.from({ length: r.int(0, 8) }, (_, i) => {
    const kind = r.pick(KINDS);
    return {
      id: `n${i}`, kind, title: `${kind} title ${i}`, body: r.pick(["", "Guest: Ann\nSource: Airbnb", "Line"]),
      reservation_id: kind === "message" ? null : r.pick([null, "r0", "r1", "r2"]),
      dedupe_key: kind === "message" ? r.pick([`msg:th${i}:2026-01-01`, null]) : kind === "alert" ? `alert:no-unit:x${i}:2026-10-05` : null,
      read: r.bool(0.4),
      created_at: new Date(now - r.int(0, 3000) * 60_000 - i).toISOString(),
    };
  });
  return { now, role, reservations, notifications, tap: r.int(0, 7), markAll: r.bool(0.3) };
});

describe("Notifications screen", () => {
  it.each(scen)("%s", async (_l, c) => {
    vi.setSystemTime(c.now);
    const db = setup(c.role, {}, { notifications: c.notifications, reservations_safe: c.reservations });
    const { r, unmount } = await render(<NotificationsRoute />);
    const text = textOf(r);
    if (c.role === "owner") {
      // Owners get no notifications page, as decided for the app.
      expect(text).toContain("You don't have access to this page.");
      await unmount();
      return;
    }
    const sorted = [...c.notifications].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const unread = sorted.filter((n) => !n.read).length;
    expect(text).toContain(unread ? `${unread} unread` : "All caught up");
    expect(text.includes("Mark all read")).toBe(unread > 0);
    if (!sorted.length) expect(text).toContain("No notifications yet");

    // Order, titles, time and labels.
    let at = 0;
    for (const n of sorted) {
      const i = text.indexOf(n.title, at);
      expect(i).toBeGreaterThanOrEqual(at);
      at = i;
      expect(text).toContain(`${n.title} | ${timeAgo(n.created_at)}`);
    }
    expect(text.split("Needs attention").length - 1).toBe(sorted.filter((n) => n.kind === "alert").length);
    const lastMinute = sorted.filter(
      (n) => n.kind === "new" && n.reservation_id && c.reservations.find((x) => x.id === n.reservation_id)?.check_in === dubaiISO(new Date(n.created_at)),
    );
    expect(text.split("Last Minute Reservation").length - 1).toBe(lastMinute.length);
    const icons = hosts(r, "Icon").map((x) => x.props.name);
    for (const k of KINDS) expect(icons.filter((x) => x === ICON[k]).length).toBe(sorted.filter((n) => n.kind === k).length);

    if (c.markAll && unread) {
      await press(pressableWith(r, "Mark all read"));
      expect(db.tables.notifications.every((n) => n.read)).toBe(true);
      expect(textOf(r)).toContain("All caught up");
    } else if (sorted.length) {
      const n = sorted[c.tap % sorted.length];
      await press(pressableWith(r, n.title));
      expect(pushes().at(-1)).toEqual(notificationTarget(n));
      expect(db.tables.notifications.find((x) => x.id === n.id)!.read).toBe(true);
      // Others are untouched.
      for (const o of c.notifications) if (o.id !== n.id) expect(db.tables.notifications.find((x) => x.id === o.id)!.read).toBe(o.read);
    }
    await unmount();
  });
});
