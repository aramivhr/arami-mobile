import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./fakeSupabase";
import { cases } from "./rand";
import { store } from "./stubs/async-storage";
import { files } from "./stubs/expo-file-system";
import { UPCOMING_DAYS, upcomingReservations } from "@/lib/upcoming";
import { KEYS_ITEMS, KEYS_ROOM, progress, withKeysSection } from "@/lib/inspectionDraft";
import { conditionText } from "@/lib/inspectionReport";
import { confirmationHtml } from "@/lib/confirmation";
import { guestCounts } from "@/lib/guests";
import { guestCountsPayload } from "./web/guests";
import type { Reservation, ReservationStatus } from "@/lib/types";

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return (globalThis as any).__db;
  },
  invokeFunction: async () => ({}),
}));
vi.mock("@/hooks/auth", () => ({ useAuth: () => ({}) }));

import { photoDataUris, toBase64 } from "@/hooks/inspections";

const iso = (d: number) => new Date(Date.UTC(2026, 0, 1) + d * 86400000).toISOString().slice(0, 10);
const STATUSES: ReservationStatus[] = ["confirmed", "pending", "checked-in", "checked-out", "cancelled"];

describe("Upcoming Reservations: check-ins today and the next 2 days only", () => {
  const sets = cases(1000, 71, (r) => {
    const today = r.int(0, 700);
    const list = Array.from({ length: r.int(0, 30) }, (_, i) => {
      const ci = today + r.int(-40, 10);
      return { id: `r${i}`, guest_name: r.bool(0.1) ? (null as unknown as string) : r.str(5), check_in: iso(ci), check_out: iso(ci + r.int(1, 20)), status: r.pick(STATUSES) };
    });
    return { today, list };
  });
  it.each(sets)("%s", (_l, { today, list }) => {
    const out = upcomingReservations(list, iso(today), iso(today + UPCOMING_DAYS));
    const want = list.filter((x) => x.status !== "cancelled" && x.check_in >= iso(today) && x.check_in <= iso(today + 2));
    expect(new Set(out.map((x) => x.id))).toEqual(new Set(want.map((x) => x.id)));
    // Nothing from the past, nothing beyond two days, soonest first.
    for (const x of out) {
      expect(x.check_in >= iso(today)).toBe(true);
      expect(x.check_in <= iso(today + 2)).toBe(true);
    }
    for (let i = 1; i < out.length; i++) expect(out[i - 1].check_in <= out[i].check_in).toBe(true);
  });
});

describe("Keys and access cards section", () => {
  const templates = cases(500, 72, (r) => {
    const pool = ["Door", "Fridge", "Keys / access cards", "Key box", "Access card", "Towels", "Keyboard", "Monkey bars", "Spare keys"];
    return Array.from({ length: r.int(0, 6) }, (_, i) => ({
      room: r.bool(0.1) ? KEYS_ROOM : r.bool(0.1) ? "keys and access cards" : `Room ${i}`,
      items: Array.from({ length: r.int(0, 4) }, () => r.pick(pool)),
    }));
  });
  it.each(templates)("%s", (_l, rooms) => {
    const out = withKeysSection(rooms);
    // Exactly one keys section, first, with every key item.
    expect(out.filter((x) => x.room.toLowerCase() === KEYS_ROOM.toLowerCase()).length).toBe(1);
    expect(out[0].room.toLowerCase()).toBe(KEYS_ROOM.toLowerCase());
    for (const k of KEYS_ITEMS) expect(out[0].items).toContain(k);
    // Key items aren't checked twice; everything else stays where it was.
    for (const x of out.slice(1)) {
      for (const i of x.items) expect(/\bkeys?\b|access card/i.test(i)).toBe(false);
      expect(x.items.length).toBeGreaterThan(0);
    }
    for (const x of rooms.filter((x) => x.room.toLowerCase() !== KEYS_ROOM.toLowerCase())) {
      const kept = x.items.filter((i) => !/\bkeys?\b|access card/i.test(i));
      if (kept.length) expect(out.find((o) => o.room === x.room)?.items).toEqual(kept);
    }
    // "Keyboard" and "Monkey bars" aren't keys.
    for (const x of rooms)
      for (const i of x.items)
        if (i === "Keyboard" || i === "Monkey bars") {
          const where = x.room.toLowerCase() === KEYS_ROOM.toLowerCase() ? out[0] : out.find((o) => o.room === x.room);
          expect(where?.items).toContain(i);
        }
    expect(progress(out, []).total).toBe(out.reduce((n, x) => n + new Set(x.items).size, 0));
  });

  it("labels keys with how many were handed back", () => {
    expect(conditionText({ room: KEYS_ROOM, condition: "ok", count: 2 })).toBe("Returned (2 handed back)");
    expect(conditionText({ room: KEYS_ROOM, condition: "ok", count: 0 })).toBe("None for this unit");
    expect(conditionText({ room: KEYS_ROOM, condition: "ok" })).toBe("Returned");
    expect(conditionText({ room: KEYS_ROOM, condition: "missing", count: 1 })).toBe("Missing (1 handed back)");
    expect(conditionText({ room: "Kitchen", condition: "damaged", count: 3 })).toBe("Damaged");
  });
});

describe("damage photos are embedded in the PDF", () => {
  let db: FakeSupabase;
  beforeEach(() => {
    store.clear();
    files.clear();
    db = new FakeSupabase();
    (globalThis as any).__db = db;
  });
  afterEach(() => vi.unstubAllGlobals());

  const encodes = cases(500, 73, (r) => Array.from({ length: r.int(0, 70) }, () => r.int(0, 255)));
  it.each(encodes)("base64 %s", (_l, bytes) => {
    expect(toBase64(new Uint8Array(bytes))).toBe(Buffer.from(bytes).toString("base64"));
  });

  const scenarios = cases(300, 74, (r) =>
    Array.from({ length: r.int(1, 6) }, (_, i) => ({ kind: r.pick(["phone", "uploadedGone", "remote", "lost", "remoteFails"] as const), i, bytes: Array.from({ length: r.int(1, 20) }, () => r.int(0, 255)) })),
  );
  it.each(scenarios)("%s", async (_l, photos) => {
    const uploaded: Record<string, string> = {};
    const remote = new Map<string, Uint8Array>();
    const paths = photos.map((p) => {
      const local = `file:///docs/p${p.i}.jpg`;
      const stored = `i1/p${p.i}.jpg`;
      const b = new Uint8Array(p.bytes);
      if (p.kind === "phone") files.set(local, b);
      if (p.kind === "uploadedGone") {
        uploaded[local] = stored;
        remote.set(stored, b);
      }
      if (p.kind === "remote") remote.set(stored, b);
      return p.kind === "remote" || p.kind === "remoteFails" ? stored : local;
    });
    store.set("insp-uploaded", JSON.stringify(uploaded));
    vi.stubGlobal("fetch", async (url: string) => {
      const path = url.replace(/^https:\/\/signed\/mobile-inspection-photos\//, "");
      const b = remote.get(path);
      return { ok: !!b, arrayBuffer: async () => (b ?? new Uint8Array()).buffer };
    });

    const out = await photoDataUris(paths);
    photos.forEach((p, k) => {
      if (p.kind === "lost" || p.kind === "remoteFails") expect(out[paths[k]]).toBeUndefined();
      else expect(out[paths[k]]).toBe(`data:image/jpeg;base64,${Buffer.from(p.bytes).toString("base64")}`);
    });
  });
});

describe("reservation confirmation PDF", () => {
  const NASTY = ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "Tom & Jerry", "O'Brien", "Привет", "a\nb", ""];
  const list = cases(500, 75, (r) => ({
    guest: r.pick(NASTY) + r.str(3),
    id: r.pick(NASTY) + r.str(6),
    others: r.bool() ? r.pick(NASTY) + "\n" + r.str(5) : "",
    notes: r.bool() ? r.pick(NASTY) : null,
    adults: r.bool(0.9) ? r.int(1, 6) : null,
    children: r.int(0, 3),
    infants: r.int(0, 2),
    fin: r.bool(),
    price: r.int(0, 9000),
  }));
  it.each(list)("%s", (_l, c) => {
    const r = {
      id: "0c9a2f4e-1111-2222-3333-444455556666", apartment_id: "a1", guest_name: c.guest, guest_email: "", guest_phone: "", check_in: "2026-10-05",
      check_out: "2026-10-08", total_price: c.price, status: "confirmed", source: "direct", direct_payment_method: "cash", notes: c.notes,
      adults: c.adults, children: c.children, infants: c.infants,
    } as unknown as Reservation;
    const html = confirmationHtml({ r, showFinancial: c.fin, showContacts: false, idNumber: c.id, additionalGuests: c.others, issued: "2026-10-05" });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("Passport / ID no.");
    expect(html).toContain("Nights</td><td class=\"v\">3<");
    expect(html.includes("Total amount")).toBe(c.fin);
    if (c.children) expect(html).toContain(`${c.children} ${c.children === 1 ? "child" : "children"}`);
    expect(html.includes("Additional guests")).toBe(!!c.others.trim());
  });
});

describe("guest counts on new reservations match the website", () => {
  const list = cases(300, 76, (r) => ({ adults: r.pick(["", "0", "1", "3", "-2", "2.7", "abc", String(r.int(0, 20))]), children: r.pick(["", "0", "2", "-1", "1.5"]), infants: r.pick(["", "0", "1", "x"]) }));
  it.each(list)("%s", (_l, f) => {
    expect(guestCounts(f)).toEqual(guestCountsPayload(f));
  });
});
