import type { InspectionResult, ItemCondition } from "@/lib/types";

// Pure checklist logic for an inspection, used by the inspection screen.

export const keyOf = (room: string, item: string) => `${room}|${item}`;

/** Sets one item's condition, note or photos, adding the item (as OK) if it wasn't checked yet. */
export function applyResult(results: InspectionResult[], room: string, item: string, patch: Partial<InspectionResult>): InspectionResult[] {
  const k = keyOf(room, item);
  const exists = results.some((r) => keyOf(r.room, r.item) === k);
  if (exists) return results.map((r) => (keyOf(r.room, r.item) === k ? { ...r, ...patch, room, item } : r));
  return [...results, { condition: "ok" as ItemCondition, note: "", photos: [], ...patch, room, item }];
}

/** Marks every unchecked item in a room OK, leaving checked ones alone. */
export function markRestOk(results: InspectionResult[], room: string, items: string[]): InspectionResult[] {
  const have = new Set(results.filter((r) => r.room === room).map((r) => r.item));
  const added = [...new Set(items)]
    .filter((i) => !have.has(i))
    .map((item) => ({ room, item, condition: "ok" as ItemCondition, note: "", photos: [] as string[] }));
  return [...results, ...added];
}

/** Checked / total items for the template's rooms. */
export function progress(rooms: { room: string; items: string[] }[], results: InspectionResult[]) {
  const have = new Set(results.map((r) => keyOf(r.room, r.item)));
  let total = 0;
  let checked = 0;
  for (const { room, items } of rooms) {
    for (const item of new Set(items)) {
      total++;
      if (have.has(keyOf(room, item))) checked++;
    }
  }
  return { total, checked, missing: total - checked };
}

/** Same rule as the mobile-inspection-complete function: damaged or missing items mean damage. */
export const hasDamage = (results: InspectionResult[]) => results.some((r) => r.condition === "damaged" || r.condition === "missing");

/** Items marked damaged, missing or dirty. */
export const issuesOf = (results: InspectionResult[]) => results.filter((r) => r.condition !== "ok");

/** The keys and access cards handed back at checkout, checked as their own section. */
export const KEYS_ROOM = "Keys and access cards";
export const KEYS_ITEMS = ["Apartment keys", "Access cards", "Parking card / remote", "Mailbox key"];

const isKeyItem = (item: string) => /\bkeys?\b|access card/i.test(item);

/**
 * The checklist rooms with the keys and access cards section first. Key items the
 * template lists in other rooms (the default template has "Keys / access cards"
 * under Entrance) move into it, so they are checked once.
 */
export function withKeysSection(rooms: { room: string; items: string[] }[]): { room: string; items: string[] }[] {
  const isKeysRoom = (r: { room: string }) => r.room.trim().toLowerCase() === KEYS_ROOM.toLowerCase();
  const existing = rooms.filter(isKeysRoom);
  const rest = rooms
    .filter((r) => !isKeysRoom(r))
    .map((r) => ({ room: r.room, items: r.items.filter((i) => !isKeyItem(i)) }))
    .filter((r) => r.items.length > 0);
  const items = [...new Set([...existing.flatMap((r) => r.items), ...KEYS_ITEMS])];
  return [{ room: KEYS_ROOM, items }, ...rest];
}
