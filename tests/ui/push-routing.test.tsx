import { describe, expect, it } from "vitest";
import React from "react";
import { act } from "react-test-renderer";
import { usePushRouting } from "@/hooks/push";
import { pushes, render, setup } from "./harness";

// Tapping a reservation alert must open the reservation on top of the
// Dashboard, so Back leads somewhere. An alert tapped while the app is still
// starting (or locked by Face ID) waits until the screens are showing.

let setReady: (v: boolean) => void = () => {};
function Probe({ ready: initial }: { ready: boolean }) {
  const [ready, set] = React.useState(initial);
  setReady = set;
  usePushRouting(ready);
  return null;
}

const alert = { type: "notification", kind: "new", reservation_id: "r1" };
const target = { pathname: "/reservation/[id]", params: { id: "r1" } };

describe("Phone alert taps", () => {
  it("holds the alert that launched the app until the screens are ready", async () => {
    setup("admin");
    (globalThis as any).__notif = { last: alert };
    await render(<Probe ready={false} />);
    expect(pushes()).toHaveLength(0);
    await act(async () => setReady(true));
    expect(pushes()).toEqual([target]);
    expect((globalThis as any).__notif.last).toBeNull();
  });

  it("holds a tap made while locked, then opens it once", async () => {
    setup("admin");
    (globalThis as any).__notif = {};
    await render(<Probe ready={false} />);
    await act(async () => (globalThis as any).__notif.tap(alert));
    expect(pushes()).toHaveLength(0);
    await act(async () => setReady(true));
    await act(async () => setReady(true));
    expect(pushes()).toEqual([target]);
  });

  it("opens a tap right away when the app is already showing", async () => {
    setup("admin");
    (globalThis as any).__notif = {};
    await render(<Probe ready />);
    await act(async () => (globalThis as any).__notif.tap(alert));
    expect(pushes()).toEqual([target]);
  });
});
