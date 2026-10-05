// The website's new-booking pop-up rules (rent-halo-system
// src/lib/new-booking-alert.ts), without the browser sound code.
// tests/newBookingAlert.test.ts checks these against the live website code.
//
// New reservations already create a "new" notification. The pop-up watches for
// those and only those that came from a channel: a reservation staff created in
// the portal or the app says "Changed in app by:", and its author doesn't need
// an alarm.

export interface BookingNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  reservation_id: string | null;
  created_at: string;
}

export function isChannelBooking(n: BookingNotification): boolean {
  return n.kind === "new" && !n.body.includes("Changed in app by:");
}

/** The "Label: value" lines of a notification body, keyed by label. */
export function bodyFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of body.split("\n")) {
    const i = line.indexOf(":");
    if (i > 0 && !line.startsWith(" ")) fields[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return fields;
}

/**
 * Channel bookings in `latest` that aren't in `seen`, oldest first, and adds
 * them to `seen`. The first call (seen === null) only records what is already
 * there, so opening the app doesn't replay old bookings.
 */
export function takeNewBookings(
  seen: Set<string> | null,
  latest: BookingNotification[],
): { seen: Set<string>; fresh: BookingNotification[] } {
  const channel = latest.filter(isChannelBooking);
  if (seen === null) return { seen: new Set(channel.map((n) => n.id)), fresh: [] };
  const fresh = channel.filter((n) => !seen.has(n.id));
  const next = new Set(seen);
  for (const n of fresh) next.add(n.id);
  return { seen: next, fresh: fresh.sort((a, b) => a.created_at.localeCompare(b.created_at)) };
}

/** The rows the pop-up shows, from the notification body. */
export function bookingRows(body: string): [string, string][] {
  const f = bodyFields(body);
  const rows: [string, string | undefined][] = [
    ["Guest", f["Guest"]],
    ["Channel", f["Source"]],
    ["Apartment", [f["Building"], f["Apartment"]].filter((v) => v && v !== "—").join(" ") || undefined],
    ["Dates", f["Check-in"] && f["Check-out"] ? `${f["Check-in"]} → ${f["Check-out"]}` : undefined],
    ["Guests", f["Guests"]],
    ["Total", f["Total amount"]],
    ["Booking number", f["Booking number"]],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]);
}
