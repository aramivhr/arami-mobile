import { describe, expect, it } from "vitest";
import React from "react";
import ReservationsRoute from "@/app/reservations";
import NotificationsRoute from "@/app/notifications";
import AlertSettingsRoute from "@/app/alert-settings";
import FinancialRoute from "@/app/financial";
import MoreScreen from "@/app/(tabs)/more";
import { HeaderBell } from "@/components/Screen";
import { byLabel, press, pressableWith, pushes, render, setup, textOf, APARTMENTS, BUILDINGS, type Role } from "./harness";
import { cases } from "../rand";

// Who can open what, checked on the real screens against the access table
// Gevorg set (written out here independently of src/lib/access.ts):
// admins: Reservations, Notifications, Phone alerts (no Financial);
// super admins: the same plus Financial; owners: Reservations and Financial.
// Also the More menu, the header bell and its unread badge.

const ALLOWED: Record<Role, string[]> = {
  admin: ["reservations", "notifications", "alert_settings"],
  super_admin: ["reservations", "notifications", "alert_settings", "financial"],
  owner: ["reservations", "financial"],
};
const MORE: Record<Role, string[]> = {
  admin: ["Reservations", "Notifications", "Phone alerts"],
  super_admin: ["Reservations", "Notifications", "Phone alerts", "Financial"],
  owner: ["Financial"],
};
const HREF: Record<string, string> = { Reservations: "/reservations", Notifications: "/notifications", "Phone alerts": "/alert-settings", Financial: "/financial" };
const SCREENS = { reservations: ReservationsRoute, notifications: NotificationsRoute, alert_settings: AlertSettingsRoute, financial: FinancialRoute } as const;

const scen = cases(1000, 9701, (r) => ({
  role: r.pick(["admin", "super_admin", "owner"] as const) as Role,
  screen: r.pick(Object.keys(SCREENS) as (keyof typeof SCREENS)[]),
  unread: r.int(0, 120),
  pick: r.int(0, 3),
  perms: { show_financial: r.bool(), access_all_units: r.bool() },
}));

describe("Access by user type", () => {
  it.each(scen)("%s", async (_l, c) => {
    const notifications = Array.from({ length: c.unread + 2 }, (_, i) => ({ id: `n${i}`, kind: "new", title: `t${i}`, body: "", reservation_id: null, dedupe_key: null, read: i >= c.unread, created_at: `2026-10-05T10:${String(i % 60).padStart(2, "0")}:00Z` }));
    setup(c.role, c.perms, { buildings: BUILDINGS, apartments: APARTMENTS, reservations_safe: [], blocked_dates: [], notifications, apartment_finance: [], mobile_notification_settings: [] });

    // The screen itself.
    const Screen = SCREENS[c.screen];
    const s = await render(<Screen />);
    expect(textOf(s.r).includes("You don't have access to this page.")).toBe(!ALLOWED[c.role].includes(c.screen));
    await s.unmount();

    // The More menu lists exactly the allowed pages, in order, and each opens its page.
    const m = await render(<MoreScreen />);
    const t = textOf(m.r);
    expect(t).toContain({ admin: "Admin", super_admin: "Super admin", owner: "Owner" }[c.role]);
    const shown = ["Reservations", "Notifications", "Phone alerts", "Financial"].filter((l) => t.includes(`| ${l} |`) || t.endsWith(`| ${l}`));
    expect(shown).toEqual(MORE[c.role]);
    const label = MORE[c.role][c.pick % MORE[c.role].length];
    await press(pressableWith(m.r, label));
    expect(pushes().at(-1)).toBe(HREF[label]);
    await m.unmount();

    // The bell: hidden for owners; otherwise shows the unread count, capped at 99+.
    const b = await render(<HeaderBell />);
    const bell = byLabel(b.r, "Notifications");
    if (c.role === "owner") expect(bell).toHaveLength(0);
    else {
      expect(bell).toHaveLength(1);
      expect(textOf(b.r)).toBe(c.unread === 0 ? "" : c.unread > 99 ? "99+" : String(c.unread));
      await press(bell[0]);
      expect(pushes().at(-1)).toBe("/notifications");
    }
    await b.unmount();
  });
});
