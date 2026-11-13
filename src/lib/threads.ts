import type { Thread } from "@/lib/types";

const words = (s: string | null | undefined) =>
  String(s ?? "").toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length > 1);

/**
 * The conversation for a reservation, as the website's findThreadForReservation
 * picks it: the one the server linked to it, else one with the same stay dates
 * and a shared word in the guest name, else the same check-in and guest name.
 */
export function findThreadForReservation(
  threads: Thread[],
  r: { id: string; guest_name: string; check_in: string; check_out: string },
): Thread | null {
  const linked = threads.find((t) => t.reservation_id === r.id);
  if (linked) return linked;
  const name = words(r.guest_name);
  const sharesName = (t: Thread) => words(t.guest_name ?? t.title).some((w) => name.includes(w));
  return (
    threads.find((t) => t.check_in === r.check_in && t.check_out === r.check_out && sharesName(t)) ??
    threads.find((t) => t.check_in === r.check_in && sharesName(t)) ??
    null
  );
}
