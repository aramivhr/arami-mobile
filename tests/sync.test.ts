import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./fakeSupabase";
import { cases } from "./rand";
import { store } from "./stubs/async-storage";
import { files } from "./stubs/expo-file-system";
import type { InspectionResult, ItemCondition } from "@/lib/types";

// Offline inspections: random sequences of edits, photos, lost connections,
// failed uploads and Finish, checked against what must end up in Supabase.

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return (globalThis as any).__db;
  },
  invokeFunction: async (name: string, body: Record<string, unknown>) => {
    const { data, error } = await (globalThis as any).__db.functions.invoke(name, { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  },
}));
vi.mock("@/hooks/auth", () => ({ useAuth: () => ({}) }));

import { PHOTO_BUCKET, isLocalPhoto, keepPhoto, loadDraft, onInspectionSynced, pendingDraftIds, saveDraft, syncInspections, type Draft } from "@/hooks/inspections";
import { applyResult, hasDamage } from "@/lib/inspectionDraft";

const ITEMS = [
  ["Kitchen", "Fridge"],
  ["Kitchen", "Microwave"],
  ["Bathroom", "Towels"],
  ["Bedroom", "Bed and linen"],
  ["Balcony", "Door lock"],
] as const;
const CONDS: ItemCondition[] = ["ok", "dirty", "damaged", "missing"];

type Action =
  | { a: "edit"; i: number; cond?: ItemCondition; note?: string; photo?: boolean }
  | { a: "unphoto"; i: number }
  | { a: "offline" }
  | { a: "online" }
  | { a: "fail"; what: "upload" | "update" | "function" | "select" }
  | { a: "sync" }
  | { a: "editDuringSync"; i: number; cond: ItemCondition; photo: boolean }
  | { a: "finish" }
  | { a: "reopen" };

let db: FakeSupabase;
let shot = 0;

beforeEach(() => {
  store.clear();
  files.clear();
  db = new FakeSupabase();
  (globalThis as any).__db = db;
  db.tables.mobile_inspections = [{ id: "i1", apartment_id: "a1", status: "pending", results: [], general_notes: null, summary: null, damage_found: false }];
  db.functionHandler = async (name, body) => {
    if (name !== "mobile-inspection-complete") throw new Error("unexpected function " + name);
    const row = db.tables.mobile_inspections.find((r) => r.id === body.inspection_id)!;
    row.status = "completed";
    row.damage_found = hasDamage(row.results);
    return row;
  };
});

/** Takes a "photo": a camera file the app then shrinks and keeps. */
async function photo() {
  const cam = `file:///camera/${shot++}.jpg`;
  files.set(cam, new Uint8Array([shot % 256]));
  return keepPhoto("i1", cam);
}

describe("offline inspection drafts always reach Supabase intact", () => {
  const scenarios = cases(1000, 61, (r) => {
    const acts: Action[] = [];
    let finished = false;
    for (let k = r.int(1, 18); k > 0; k--) {
      const roll = r.next();
      if (finished) {
        acts.push(r.pick<Action>([{ a: "sync" }, { a: "offline" }, { a: "online" }, { a: "fail", what: r.pick(["upload", "update", "function", "select"] as const) }, { a: "reopen" }]));
        continue;
      }
      if (roll < 0.35) acts.push({ a: "edit", i: r.int(0, 4), cond: r.bool(0.8) ? r.pick(CONDS) : undefined, note: r.bool(0.3) ? r.str(8) : undefined, photo: r.bool(0.3) });
      else if (roll < 0.42) acts.push({ a: "unphoto", i: r.int(0, 4) });
      else if (roll < 0.52) acts.push({ a: "offline" });
      else if (roll < 0.62) acts.push({ a: "online" });
      else if (roll < 0.72) acts.push({ a: "fail", what: r.pick(["upload", "update", "function", "select"] as const) });
      else if (roll < 0.84) acts.push({ a: "sync" });
      else if (roll < 0.92) acts.push({ a: "editDuringSync", i: r.int(0, 4), cond: r.pick(CONDS), photo: r.bool(0.4) });
      else if (roll < 0.97) acts.push({ a: "reopen" });
      else {
        acts.push({ a: "finish" });
        finished = true;
      }
    }
    return acts;
  });

  it.each(scenarios)("%s", async (_l, acts) => {
    // The screen's state, as the inspection screen keeps it.
    let state: Draft = { results: [], general_notes: null, summary: null, complete: false, started_at: "2026-10-04T08:00:00Z", inspector_id: "u1" };
    const stop = onInspectionSynced((id) => {
      if (id !== "i1") return;
      const row = db.tables.mobile_inspections[0];
      state = { ...state, results: row.results, complete: false };
    });
    const save = async (next: Draft) => {
      state = next;
      await saveDraft("i1", next);
    };
    const edit = async (i: number, patch: Partial<InspectionResult>, withPhoto: boolean) => {
      const [room, item] = ITEMS[i];
      if (withPhoto) {
        const cur = state.results.find((x) => x.room === room && x.item === item);
        patch = { ...patch, photos: [...(cur?.photos ?? []), await photo()] };
      }
      await save({ ...state, results: applyResult(state.results, room, item, patch) });
    };

    let finished = false;
    for (const act of acts) {
      switch (act.a) {
        case "edit":
          await edit(act.i, { ...(act.cond ? { condition: act.cond } : {}), ...(act.note != null ? { note: act.note } : {}) }, !!act.photo);
          break;
        case "unphoto": {
          const [room, item] = ITEMS[act.i];
          const cur = state.results.find((x) => x.room === room && x.item === item);
          if (cur?.photos.length) await save({ ...state, results: applyResult(state.results, room, item, { photos: cur.photos.slice(1) }) });
          break;
        }
        case "offline":
          db.offline = "Network request failed";
          break;
        case "online":
          db.offline = null;
          break;
        case "fail":
          db.failNext[act.what] = (db.failNext[act.what] ?? 0) + 1;
          break;
        case "sync":
          await syncInspections();
          break;
        case "editDuringSync": {
          const running = syncInspections();
          await edit(act.i, { condition: act.cond }, act.photo);
          await running;
          break;
        }
        case "finish":
          finished = true;
          await save({ ...state, complete: true });
          await syncInspections();
          break;
        case "reopen": {
          // Leaving and reopening the screen: it starts from the phone's draft, else from Supabase.
          const d = await loadDraft("i1");
          const row = db.tables.mobile_inspections[0];
          state = d ?? { ...state, results: row.results, complete: false };
          break;
        }
      }
    }

    // Back online for good: everything must upload.
    db.offline = null;
    db.failNext = {};
    for (let k = 0; k < 4 && (await pendingDraftIds()).length; k++) await syncInspections();
    stop();

    expect(await pendingDraftIds()).toEqual([]);
    const row = db.tables.mobile_inspections[0];
    // Supabase has exactly the screen's final checklist, with photos as stored files.
    expect(row.results.map((x: InspectionResult) => [x.room, x.item, x.condition, x.note, x.photos.length])).toEqual(
      state.results.map((x) => [x.room, x.item, x.condition, x.note, x.photos.length]),
    );
    for (const x of row.results as InspectionResult[]) {
      for (const p of x.photos) {
        expect(isLocalPhoto(p), `phone path leaked to Supabase: ${p}`).toBe(false);
        expect(db.storageObjects.has(`${PHOTO_BUCKET}/${p}`), `missing upload ${p}`).toBe(true);
        expect(p.startsWith("i1/")).toBe(true);
      }
    }
    const allPaths = (row.results as InspectionResult[]).flatMap((x) => x.photos);
    expect(new Set(allPaths).size).toBe(allPaths.length);
    // Photos are uploaded once each: nothing in storage beyond what was ever attached.
    expect(db.storageObjects.size).toBeLessThanOrEqual(shot);
    // Finished inspections are completed, with the backend's damage verdict.
    if (finished) {
      expect(row.status).toBe("completed");
      expect(row.damage_found).toBe(hasDamage(row.results));
    } else {
      expect(row.status === "in_progress" || (row.status === "pending" && !acts.some((x) => x.a === "edit" || x.a === "editDuringSync"))).toBe(true);
      expect(db.functionCalls.length).toBe(0);
    }
    // Phone copies of uploaded photos are cleaned up.
    const leftover = [...files.keys()].filter((f) => f.startsWith("file:///docs/"));
    expect(leftover).toEqual([]);
  });
});

describe("a screen still showing phone photo paths after upload doesn't lose them", () => {
  it("maps the old phone path to the uploaded file", async () => {
    const p = await photo();
    const stale: Draft = { results: [{ room: "Kitchen", item: "Fridge", condition: "damaged", note: "dent", photos: [p] }], general_notes: null, summary: null, complete: false, started_at: "x", inspector_id: "u1" };
    await saveDraft("i1", stale);
    await syncInspections();
    const uploaded = db.tables.mobile_inspections[0].results[0].photos[0];
    expect(uploaded.startsWith("i1/")).toBe(true);
    // The screen edits the note before it noticed the upload; its draft still has the phone path.
    await saveDraft("i1", { ...stale, results: [{ ...stale.results[0], note: "dent, door" }] });
    await syncInspections();
    expect(db.tables.mobile_inspections[0].results[0]).toMatchObject({ note: "dent, door", photos: [uploaded] });
    expect(db.storageObjects.size).toBe(1);
  });
});
