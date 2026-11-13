import type { ThreadMessage } from "@/lib/types";

// Which staff member sent each reply to a guest. Channex doesn't record who
// sent a message, and neither does the website, so the app writes its own note
// (mobile_message_senders) each time someone replies from the app. A Channex
// message is matched to a note by conversation, text and time.

export interface SenderNote {
  thread_id: string;
  body: string;
  user_id: string;
  sent_at: string;
}

/** How far apart Channex's time and the app's note may be and still match. */
export const MATCH_WINDOW_MS = 15 * 60_000;

const norm = (s: string | null | undefined) => String(s ?? "").replace(/\s+/g, " ").trim();

/**
 * Message id -> user id for every reply sent from the app. Each note matches at
 * most one message (the closest in time with the same text), so the same reply
 * sent twice is credited to whoever sent each one.
 */
export function matchSenders(messages: ThreadMessage[], notes: SenderNote[]): Record<string, string> {
  const out: Record<string, string> = {};
  const free = notes.map((n) => ({ ...n, text: norm(n.body), t: Date.parse(n.sent_at) }));
  const used = new Set<number>();
  for (const m of messages) {
    if (m.sender !== "property") continue;
    const text = norm(m.text);
    if (!text) continue;
    const at = m.at ? Date.parse(m.at) : NaN;
    let best = -1;
    let bestGap = Infinity;
    free.forEach((n, i) => {
      if (used.has(i) || n.text !== text) return;
      const gap = Number.isNaN(at) || Number.isNaN(n.t) ? MATCH_WINDOW_MS : Math.abs(at - n.t);
      if (gap <= MATCH_WINDOW_MS && gap < bestGap) {
        best = i;
        bestGap = gap;
      }
    });
    if (best >= 0) {
      used.add(best);
      out[m.id] = free[best].user_id;
    }
  }
  return out;
}

/** A staff member's display name: username, else the part of the email before @. */
export function staffLabel(p: { username?: string | null; email?: string | null }): string | null {
  const u = norm(p.username);
  if (u) return u;
  const e = norm(p.email);
  return e ? e.split("@")[0] : null;
}
