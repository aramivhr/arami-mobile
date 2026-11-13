// Same rules as the website calendar (rent-halo-system src/lib/calendar-overlaps.ts).
// Overlapping stays in the calendar.
//
// Each apartment has ONE row. A night with more than one stay on it (an
// overbooking, or a double booking made by hand) is drawn as a red
// "overbooking" cell on that row instead of on an extra row, and clicking it
// opens every stay involved as tabs. The overbooking is always the stay that
// came in last, so it is shown on the cell and is the last tab.

export interface OverlapStay {
  id: string;
  apartment_id: string;
  check_in: string;
  /** Exclusive. */
  check_out: string;
  status: string;
  created_at?: string | null;
  is_overbooking?: boolean | null;
}

/**
 * Oldest booking first, the overbooking last: flagged stays go after
 * unflagged ones, and within each, by when the booking was created.
 */
export function orderOverlap<T extends OverlapStay>(stays: readonly T[]): T[] {
  return [...stays].sort(
    (a, b) =>
      Number(!!a.is_overbooking) - Number(!!b.is_overbooking) ||
      (a.created_at ?? "").localeCompare(b.created_at ?? "") ||
      a.id.localeCompare(b.id),
  );
}

export type DayCell<T extends OverlapStay> =
  | { type: "free" }
  | { type: "reserved"; stay: T }
  /** One guest leaves and another arrives that day. */
  | { type: "split"; checkout: T; checkin: T }
  /** More than one stay that night; `stays` ordered by orderOverlap, the last is shown. */
  | { type: "overlap"; stays: T[] };

/** What one apartment's row shows on `date`, from that apartment's stays. */
export function dayCell<T extends OverlapStay>(row: readonly T[], date: string): DayCell<T> {
  const live = row.filter((r) => r.status !== "cancelled");
  const covering = live.filter((r) => date >= r.check_in && date < r.check_out);
  if (covering.length > 1) return { type: "overlap", stays: orderOverlap(covering) };
  const checkout = live.find((r) => r.check_out === date);
  if (covering.length === 1) {
    const stay = covering[0];
    if (checkout && stay.check_in === date && checkout.id !== stay.id) return { type: "split", checkout, checkin: stay };
    return { type: "reserved", stay };
  }
  return { type: "free" };
}

/**
 * Every stay on the same apartment that overlaps `stay`, including itself,
 * ordered by orderOverlap. A single element means it overlaps nothing.
 */
export function overlapGroup<T extends OverlapStay>(all: readonly T[], stay: T): T[] {
  const group = all.filter(
    (r) =>
      r.id === stay.id ||
      (r.status !== "cancelled" &&
        r.apartment_id === stay.apartment_id &&
        r.check_in < stay.check_out &&
        stay.check_in < r.check_out),
  );
  return orderOverlap(group);
}
