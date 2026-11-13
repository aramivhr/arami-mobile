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

/**
 * Optional items: checked only when the unit has them (a TV in a bedroom). They
 * aren't counted as "not checked", "Mark the rest OK" leaves them alone, and the
 * report lists them only once someone has checked them.
 */
export const OPTIONAL_ITEMS: { room: RegExp; item: string }[] = [{ room: /bedroom/i, item: "TV" }];

export function isOptionalItem(room: string, item: string) {
  return OPTIONAL_ITEMS.some((o) => o.room.test(room) && o.item === item);
}

/** A room's items without the optional ones. */
export const requiredItems = (room: string, items: string[]) => items.filter((i) => !isOptionalItem(room, i));

/** Marks every unchecked required item in a room OK, leaving checked and optional ones alone. */
export function markRestOk(results: InspectionResult[], room: string, items: string[]): InspectionResult[] {
  const have = new Set(results.filter((r) => r.room === room).map((r) => r.item));
  const added = [...new Set(items)]
    .filter((i) => !have.has(i) && !isOptionalItem(room, i))
    .map((item) => ({ room, item, condition: "ok" as ItemCondition, note: "", photos: [] as string[] }));
  return [...results, ...added];
}

/** Checked / total required items for the template's rooms (optional items don't count). */
export function progress(rooms: { room: string; items: string[] }[], results: InspectionResult[]) {
  const have = new Set(results.map((r) => keyOf(r.room, r.item)));
  let total = 0;
  let checked = 0;
  for (const { room, items } of rooms) {
    for (const item of new Set(requiredItems(room, items))) {
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
 * under Entrance) move into it, so they are checked once. Bedrooms also get the
 * optional TV item.
 */
export function withKeysSection(rooms: { room: string; items: string[] }[]): { room: string; items: string[] }[] {
  const isKeysRoom = (r: { room: string }) => r.room.trim().toLowerCase() === KEYS_ROOM.toLowerCase();
  const existing = rooms.filter(isKeysRoom);
  const rest = rooms
    .filter((r) => !isKeysRoom(r))
    .map((r) => ({ room: r.room, items: r.items.filter((i) => !isKeyItem(i)) }))
    .filter((r) => r.items.length > 0);
  const items = [...new Set([...existing.flatMap((r) => r.items), ...KEYS_ITEMS])];
  return [{ room: KEYS_ROOM, items }, ...rest.map(withOptionalItems)];
}

/** Adds the optional items a room should offer (TV in every bedroom) if the template doesn't list them. */
function withOptionalItems(r: { room: string; items: string[] }) {
  const extra = OPTIONAL_ITEMS.filter((o) => o.room.test(r.room) && !r.items.includes(o.item)).map((o) => o.item);
  return extra.length ? { room: r.room, items: [...r.items, ...extra] } : r;
}
