import { beforeAll, describe, expect, it } from "vitest";
import { applyResult, hasDamage, issuesOf, keyOf, markRestOk, progress } from "@/lib/inspectionDraft";
import type { InspectionResult, ItemCondition } from "@/lib/types";
import { FakeSupabase } from "./fakeSupabase";
import { loadFunction, post, useFake } from "./deno";
import { cases } from "./rand";

// The seeded "Standard checkout inspection" template.
const ROOMS = [
  { room: "Entrance", items: ["Door and lock", "Keys / access cards", "Lights"] },
  { room: "Living room", items: ["Sofa and cushions", "TV and remote", "Air conditioning and remote", "Curtains / blinds", "Floor", "Walls"] },
  { room: "Kitchen", items: ["Fridge", "Oven / stove", "Microwave", "Dishwasher", "Kettle and coffee machine", "Cutlery and dishes", "Sink and taps", "Cabinets"] },
  { room: "Bedroom", items: ["Bed and linen", "Wardrobe and hangers", "Air conditioning", "Curtains / blinds"] },
  { room: "Bathroom", items: ["Toilet", "Shower / bathtub", "Sink and taps", "Towels", "Toiletries"] },
  { room: "Balcony", items: ["Furniture", "Floor", "Door lock"] },
  { room: "Utilities", items: ["Washing machine", "Iron and ironing board", "Hair dryer", "Wi-Fi router"] },
];
const TOTAL = ROOMS.reduce((n, r) => n + r.items.length, 0);
const CONDS: ItemCondition[] = ["ok", "dirty", "damaged", "missing"];

type Op =
  | { t: "set"; room: string; item: string; condition?: ItemCondition; note?: string; photos?: string[] }
  | { t: "rest"; room: string };

let complete: (req: Request) => Promise<Response>;
beforeAll(async () => {
  complete = await loadFunction("mobile-inspection-complete");
});

describe("checklist edits keep one entry per item, count correctly, and agree with the backend's damage rule", () => {
  const opCases = cases(1000, 41, (r) => {
    const ops: Op[] = Array.from({ length: r.int(1, 25) }, () => {
      const room = r.pick(ROOMS);
      if (r.bool(0.15)) return { t: "rest", room: room.room } as Op;
      const op: Op = { t: "set", room: room.room, item: r.pick(room.items) };
      if (r.bool(0.8)) op.condition = r.pick(CONDS);
      if (r.bool(0.3)) op.note = r.str(15);
      if (r.bool(0.2)) op.photos = Array.from({ length: r.int(0, 3) }, (_, i) => `p${i}-${r.int(1, 999)}.jpg`);
      return op;
    });
    return ops;
  });

  it.each(opCases)("%s", async (_l, ops) => {
    let results: InspectionResult[] = [];
    const model = new Map<string, InspectionResult>();
    for (const op of ops) {
      if (op.t === "rest") {
        const items = ROOMS.find((x) => x.room === op.room)!.items;
        results = markRestOk(results, op.room, items);
        for (const item of items) if (!model.has(keyOf(op.room, item))) model.set(keyOf(op.room, item), { room: op.room, item, condition: "ok", note: "", photos: [] });
      } else {
        const { t: _t, room, item, ...patch } = op;
        results = applyResult(results, room, item, patch);
        const k = keyOf(room, item);
        model.set(k, { ...(model.get(k) ?? { room, item, condition: "ok", note: "", photos: [] }), ...patch, room, item });
      }
    }
    // One entry per item, matching an independent model of the edits.
    const keys = results.map((r) => keyOf(r.room, r.item));
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Map(results.map((r) => [keyOf(r.room, r.item), r]))).toEqual(model);
    // Progress.
    const p = progress(ROOMS, results);
    expect(p.total).toBe(TOTAL);
    expect(p.checked).toBe(results.length);
    expect(p.missing).toBe(TOTAL - results.length);
    expect(issuesOf(results).every((r) => r.condition !== "ok")).toBe(true);

    // The backend's mobile-inspection-complete agrees on damage and creates a task only then.
    const db = new FakeSupabase();
    db.tables.user_roles = [{ user_id: "u1", role: "admin" }];
    db.tables.mobile_inspections = [{ id: "i1", apartment_id: "a1", status: "in_progress", results }];
    db.tables.tasks = [];
    useFake(db, { id: "u1" });
    const res = await complete(post({ inspection_id: "i1" }));
    expect(res.status).toBe(200);
    const row = db.tables.mobile_inspections[0];
    expect(row.status).toBe("completed");
    expect(row.damage_found).toBe(hasDamage(results));
    expect(db.tables.tasks.length).toBe(hasDamage(results) ? 1 : 0);
    if (db.tables.tasks.length) {
      const desc: string = db.tables.tasks[0].description;
      for (const r of results.filter((x) => x.condition === "damaged" || x.condition === "missing")) expect(desc).toContain(`${r.room} – ${r.item}`);
      expect(db.tables.tasks[0]).toMatchObject({ user_id: "u1", apartment_id: "a1", status: "pending" });
    }
  });
});

describe("finish-inspection permissions", () => {
  const permCases = cases(60, 42, (r) => ({ roles: Array.from({ length: r.int(0, 2) }, () => r.pick(["admin", "super_admin", "user", "owner"])), signedIn: r.bool(0.85), body: r.pick([{ inspection_id: "i1" }, {}, { inspection_id: 5 }, { inspection_id: "nope" }]) }));
  it.each(permCases)("%s", async (_l, c) => {
    const db = new FakeSupabase();
    db.tables.user_roles = c.roles.map((role) => ({ user_id: "u1", role }));
    db.tables.mobile_inspections = [{ id: "i1", apartment_id: "a1", status: "pending", results: [] }];
    useFake(db, c.signedIn ? { id: "u1" } : null);
    const res = await complete(post(c.body));
    const staff = c.roles.includes("admin") || c.roles.includes("super_admin");
    const expected = !c.signedIn ? 401 : !staff ? 403 : typeof (c.body as any).inspection_id !== "string" ? 400 : (c.body as any).inspection_id === "i1" ? 200 : 404;
    expect(res.status).toBe(expected);
    expect(db.tables.mobile_inspections[0].status).toBe(expected === 200 ? "completed" : "pending");
  });
});
