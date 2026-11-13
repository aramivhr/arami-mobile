import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useUserType } from "@/hooks/permissions";
import { matchSenders, staffLabel, type SenderNote } from "@/lib/senders";
import type { ThreadMessage } from "@/lib/types";

// Who did what, shown to super admins only (Gevorg's decision): who submitted
// an inspection and which staff member sent each reply to a guest.

export function useIsSuperAdmin() {
  const { data: type } = useUserType();
  return type === "super_admin";
}

/**
 * Staff names by user id, for super admins. Read through the mobile-only
 * mobile_staff_names() function; until Lovable has added it, the website's
 * profiles table is tried instead (readable where the database allows it).
 */
export function useStaffNames(enabled: boolean) {
  return useQuery({
    queryKey: ["staff-names"],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      let rows: { id: string; username?: string | null; email?: string | null }[] | null = null;
      const rpc = await supabase.rpc("mobile_staff_names");
      if (!rpc.error) rows = rpc.data ?? [];
      else {
        const p = await supabase.from("profiles").select("id, username, email");
        rows = p.error ? [] : (p.data ?? []);
      }
      const out: Record<string, string> = {};
      for (const r of rows ?? []) {
        const name = staffLabel(r);
        if (r.id && name) out[r.id] = name;
      }
      return out;
    },
  });
}

/** A name for a user id: the staff name, else "You" for yourself, else a placeholder. */
export function nameOf(names: Record<string, string> | undefined, userId: string | null | undefined, me?: string | null) {
  if (!userId) return "Not recorded";
  return names?.[userId] ?? (userId === me ? "You" : "Unknown staff member");
}

const NOTES = "mobile_message_senders";

/** Notes of who sent each reply in a conversation, matched to its messages. Super admins only. */
export function useMessageSenders(threadId: string | undefined, messages: ThreadMessage[], enabled: boolean) {
  const q = useQuery({
    queryKey: ["msg-senders", threadId],
    enabled: enabled && !!threadId,
    refetchInterval: 15_000,
    queryFn: async (): Promise<SenderNote[]> => {
      const { data, error } = await supabase.from(NOTES).select("thread_id, body, user_id, sent_at").eq("thread_id", threadId!).order("sent_at", { ascending: true });
      // Before Lovable adds the table nothing is recorded yet; show no names rather than an error.
      return error ? [] : ((data ?? []) as SenderNote[]);
    },
  });
  return enabled ? matchSenders(messages, q.data ?? []) : {};
}

/**
 * Records that the signed-in staff member sent this reply, so super admins can
 * see who it was. Best effort: a reply is never held up or failed by this.
 */
export async function recordSender(threadId: string, text: string, userId: string | null | undefined) {
  if (!userId) return;
  try {
    await supabase.from(NOTES).insert({ thread_id: threadId, body: text, user_id: userId });
  } catch {
    // Not recorded; the reply itself was sent.
  }
}
