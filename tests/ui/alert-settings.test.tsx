import { describe, expect, it } from "vitest";
import React from "react";
import AlertSettingsRoute from "@/app/alert-settings";
import { hosts, render, settle, setup, textOf, type Role } from "./harness";
import { act } from "react-test-renderer";
import { cases } from "../rand";

// Phone alerts settings: every alert type with its switch (Damage found only
// for super admins), switches reflect the saved row (no row = all on), and
// flipping one saves just that change, keeping the others.

const TYPES = [
  ["reservation_new", "New reservations"],
  ["reservation_modified", "Changed reservations"],
  ["reservation_cancelled", "Cancelled reservations"],
  ["guest_message", "Guest messages"],
  ["inspection_due", "Inspections due"],
  ["inspection_damage", "Damage found"],
  ["sync_failure", "Channel sync failures"],
] as const;

const scen = cases(600, 9801, (r) => ({
  role: r.pick(["admin", "super_admin"] as const) as Role,
  saved: r.bool(0.6) ? Object.fromEntries(TYPES.map(([k]) => [k, r.bool(0.7)])) : null,
  flips: Array.from({ length: r.int(1, 3) }, () => r.int(0, 6)),
}));

describe("Phone alerts settings", () => {
  it.each(scen)("%s", async (_l, c) => {
    const db = setup(c.role, {}, { mobile_notification_settings: c.saved ? [{ user_id: "me", ...c.saved }] : [] });
    const { r, unmount } = await render(<AlertSettingsRoute />);
    const visible = TYPES.filter(([k]) => k !== "inspection_damage" || c.role === "super_admin");
    const t = textOf(r);
    for (const [, label] of TYPES) expect(t.includes(label)).toBe(visible.some(([, l]) => l === label));
    const state: Record<string, boolean> = Object.fromEntries(TYPES.map(([k]) => [k, c.saved ? c.saved[k] : true]));
    const switches = () => hosts(r, "Switch");
    expect(switches().map((s) => s.props.accessibilityLabel)).toEqual(visible.map(([, l]) => l));
    switches().forEach((s, i) => expect(s.props.value).toBe(state[visible[i][0]]));

    for (const f of c.flips) {
      const i = f % visible.length;
      const key = visible[i][0];
      state[key] = !state[key];
      await act(async () => {
        switches()[i].props.onValueChange(state[key]);
      });
      await settle();
      const row = db.tables.mobile_notification_settings.find((x) => x.user_id === "me")!;
      for (const [k] of TYPES) expect(row[k]).toBe(state[k]);
      expect(db.tables.mobile_notification_settings).toHaveLength(1);
      expect(switches()[i].props.value).toBe(state[key]);
    }
    await unmount();
  });
});
