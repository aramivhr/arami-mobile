import { dubaiISO } from "@/lib/dates";
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

/**
 * Reservations received today, by the Dubai calendar day of created_at: the
 * website Dashboard's "Today's Reservations" card.
 */
export function receivedToday<R extends Pick<Reservation, "created_at">>(reservations: R[], now: Date = new Date()): R[] {
  const day = dubaiISO(now);
  return reservations.filter((r) => !!r.created_at && dubaiISO(new Date(r.created_at)) === day);
}

/** When a reservation was received, in Dubai time, as the website shows it (e.g. "05 Oct, 14:30"). */
export function receivedAt(createdAt: string | null | undefined): string {
  if (!createdAt) return "—";
  // Dubai is UTC+4 all year; shifting and reading the UTC fields avoids
  // depending on the phone's time-zone data.
  const d = new Date(new Date(createdAt).getTime() + 4 * 3600_000);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${pad(d.getUTCDate())} ${mon}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
