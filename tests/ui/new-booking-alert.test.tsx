import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { Vibration } from "react-native";
import { NewBookingAlert } from "@/components/NewBookingAlert";
import { hosts, press, pressableWith, pushes, render, settle, setup, textOf } from "./harness";
import { cases } from "../rand";
import { bookingRows } from "@/lib/newBookingAlert";
import { act } from "react-test-renderer";

// The new-reservation pop-up: bookings already there when the app opens never
// pop up; channel bookings that arrive later do, oldest first, with a buzz;
// bookings staff made in the portal or app ("Changed in app by:") never do.
// Open goes to the reservation and marks the notification read; Dismiss/Next
// moves through the queue.

afterEach(() => vi.restoreAllMocks());

const body = (r: ReturnType<typeof import("../rand").rng>, i: number, staff: boolean) =>
  [
    `Guest: ${r.pick(["Ann Lee", "Bob Ray", "José"])} ${i}`,
    `Source: ${r.pick(["Booking.com", "Airbnb"])}`,
    `Building: ${r.pick(["Marina Gate", "—"])}`,
    `Apartment: ${r.pick(["1204", "B-302"])}`,
    `Check-in: 2026-10-0${r.int(5, 9)}`,
    `Check-out: 2026-10-1${r.int(0, 9)}`,
    ...(r.bool() ? [`Guests: ${r.int(1, 4)} adults`] : []),
    ...(r.bool() ? [`Total amount: ${r.int(300, 9000)} AED`] : []),
    ...(r.bool() ? [`Booking number: ${r.int(1e9, 2e9)}`] : []),
    ...(staff ? ["Changed in app by: staff@arami.app"] : []),
  ].join("\n");

const scen = cases(1000, 9601, (r) => {
  const mk = (i: number, minute: number) => {
    const staff = r.bool(0.25);
    return {
      id: `n${i}`, kind: r.pick(["new", "new", "new", "modified", "message"]), title: "New reservation",
      body: body(r, i, staff), reservation_id: r.bool(0.85) ? `r${i}` : null, read: false,
      created_at: new Date(Date.UTC(2026, 9, 5, 10, minute)).toISOString(),
    };
  };
  const before = Array.from({ length: r.int(0, 5) }, (_, i) => mk(i, i));
  const later = Array.from({ length: r.int(0, 4) }, (_, i) => mk(10 + i, 30 + r.int(0, 20)));
  return { before, later, actions: Array.from({ length: 6 }, () => r.pick(["open", "dismiss"] as const)) };
});

describe("New-reservation pop-up", () => {
  it.each(scen)("%s", async (_l, c) => {
    const db = setup("admin", {}, { notifications: c.before });
    const buzz = vi.spyOn(Vibration, "vibrate");
    const { r, qc, unmount } = await render(<NewBookingAlert />);
    // Nothing that was already there pops up.
    expect(textOf(r)).toBe("");
    expect(buzz).not.toHaveBeenCalled();

    db.tables.notifications.push(...c.later.map((n) => ({ ...n })));
    await act(async () => {
      await qc.refetchQueries({ queryKey: ["notifications", "new-bookings"] });
    });
    await settle();

    const latest20 = [...c.before, ...c.later].filter((n) => n.kind === "new").sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20);
    const fresh = latest20
      .filter((n) => c.later.includes(n) && !n.body.includes("Changed in app by:"))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    expect(buzz).toHaveBeenCalledTimes(fresh.length ? 1 : 0);

    const queue = [...fresh];
    for (const action of c.actions) {
      const t = textOf(r);
      if (!queue.length) {
        expect(t).toBe("");
        break;
      }
      const cur = queue[0];
      expect(t).toContain("New reservation");
      expect(t).toContain(queue.length > 1 ? `${queue.length} new reservations just arrived` : "Just arrived from the channel manager");
      for (const [label, value] of bookingRows(cur.body)) expect(t).toContain(`${label} | ${value}`);
      expect(t).toContain(queue.length > 1 ? "Next" : "Dismiss");
      if (action === "open") {
        await press(pressableWith(r, "Open reservation"));
        expect(db.tables.notifications.find((n) => n.id === cur.id)!.read).toBe(true);
        if (cur.reservation_id) expect(pushes().at(-1)).toEqual({ pathname: "/reservation/[id]", params: { id: cur.reservation_id } });
        else expect(pushes().filter((p) => JSON.stringify(p).includes(`"${cur.id}"`))).toHaveLength(0);
      } else {
        await press(pressableWith(r, queue.length > 1 ? "Next" : "Dismiss"));
        expect(db.tables.notifications.find((n) => n.id === cur.id)!.read).toBe(false);
      }
      queue.shift();
    }
    expect(hosts(r, "Modal").length).toBe(queue.length ? 1 : 0);
    await unmount();
  });
});
