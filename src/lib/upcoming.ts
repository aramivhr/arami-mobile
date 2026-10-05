import type { Reservation } from "@/lib/types";

/** Days after today that "Upcoming Reservations" covers. */
export const UPCOMING_DAYS = 2;

/**
 * The Dashboard's upcoming list: reservations checking in from today through
 * the next two days, soonest first. Past and cancelled stays are left out.
 * `today` and `last` are "YYYY-MM-DD" (last = today + UPCOMING_DAYS).
 */
export function upcomingReservations<R extends Pick<Reservation, "check_in" | "status" | "guest_name">>(reservations: R[], today: string, last: string): R[] {
  return reservations
    .filter((r) => r.status !== "cancelled" && r.check_in >= today && r.check_in <= last)
    .sort((a, b) => a.check_in.localeCompare(b.check_in) || (a.guest_name ?? "").localeCompare(b.guest_name ?? ""));
}
