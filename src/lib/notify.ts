import { dubaiISO } from "@/lib/dates";
import type { AppNotification, Reservation } from "@/lib/types";

// Pure helpers for notifications and phone alerts, shared by the Notifications
// page and the alert-tap handler.

/**
 * A new booking whose check-in is the same day it was made, in Dubai time,
 * the same rule the backend uses for the "Last Minute Reservation: " alert title.
 */
export function isLastMinute(n: Pick<AppNotification, "kind" | "reservation_id" | "created_at">, reservations: Pick<Reservation, "id" | "check_in">[]) {
  if (n.kind !== "new" || !n.reservation_id) return false;
  const r = reservations.find((x) => x.id === n.reservation_id);
  return !!r && r.check_in === dubaiISO(new Date(n.created_at));
}

/** Guest-message notifications carry their thread in dedupe_key: "msg:{thread_id}:{last_message_at}". */
export function threadIdFromDedupe(key: string | null | undefined): string | null {
  if (!key?.startsWith("msg:")) return null;
  return key.split(":")[1] || null;
}

export type Target =
  | { pathname: "/thread/[id]"; params: { id: string } }
  | { pathname: "/reservation/[id]"; params: { id: string } }
  | { pathname: "/inspection/[id]"; params: { id: string } }
  | "/messages"
  | "/reservations"
  | "/notifications";

/** Where tapping a row on the Notifications page goes. */
export function notificationTarget(n: Pick<AppNotification, "kind" | "reservation_id" | "dedupe_key">): Target {
  if (n.kind === "message") {
    const id = threadIdFromDedupe(n.dedupe_key);
    return id ? { pathname: "/thread/[id]", params: { id } } : "/messages";
  }
  // Reservation changes and sync alerts ("alert") open the reservation they name, as on the website.
  return n.reservation_id ? { pathname: "/reservation/[id]", params: { id: n.reservation_id } } : "/reservations";
}

export type PushData = {
  type?: string;
  kind?: string;
  reservation_id?: string | null;
  dedupe_key?: string | null;
  inspection_id?: string | null;
};

const NOTIFICATION_KINDS: AppNotification["kind"][] = ["new", "modified", "cancelled", "message", "alert"];

/** Where tapping a phone alert goes (data is set by the mobile-push-dispatch function). */
export function pushTarget(data: PushData | null | undefined): Target {
  if (data?.type === "inspection") {
    return data.inspection_id ? { pathname: "/inspection/[id]", params: { id: data.inspection_id } } : "/notifications";
  }
  if (data?.type === "notification" && NOTIFICATION_KINDS.includes(data.kind as AppNotification["kind"])) {
    return notificationTarget({ kind: data.kind as AppNotification["kind"], reservation_id: data.reservation_id ?? null, dedupe_key: data.dedupe_key ?? null });
  }
  return "/notifications";
}
