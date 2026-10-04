import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invokeFunction } from "@/lib/supabase";
import type { Thread, ThreadMessage } from "@/lib/types";

// Guest messaging through the website's existing channex-messages function
// (Airbnb + Booking.com via Channex). Same polling intervals as the website.

export function useThreads() {
  return useQuery({
    queryKey: ["msg-threads"],
    queryFn: () => invokeFunction<{ threads: Thread[] }>("channex-messages", { action: "threads" }),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

export function useThreadMessages(threadId: string | undefined) {
  return useQuery({
    queryKey: ["msg-thread", threadId],
    queryFn: () => invokeFunction<{ messages: ThreadMessage[] }>("channex-messages", { action: "messages", thread_id: threadId }),
    enabled: !!threadId,
    refetchInterval: 5_000,
    staleTime: 4_000,
  });
}

export function useSendMessage(threadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => invokeFunction("channex-messages", { action: "send", thread_id: threadId, text }),
    onMutate: (text: string) => {
      // Show the reply instantly; the next refresh replaces it with the real one.
      qc.setQueryData<{ messages: ThreadMessage[] }>(["msg-thread", threadId], (old) => ({
        messages: [...(old?.messages ?? []), { id: `tmp-${Date.now()}`, text, sender: "property", at: new Date().toISOString() }],
      }));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["msg-thread", threadId] });
      qc.invalidateQueries({ queryKey: ["msg-threads"] });
    },
  });
}

// Which conversations this phone has already read (kept on the device, like
// the website keeps it in the browser).
const SEEN_KEY = "messages-seen";

export function useSeen() {
  const [seen, setSeen] = useState<Record<string, string>>({});
  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY)
      .then((v) => setSeen(v ? JSON.parse(v) : {}))
      .catch(() => {});
  }, []);
  const markSeen = useCallback(async (threadId: string, at: string) => {
    const raw = await AsyncStorage.getItem(SEEN_KEY).catch(() => null);
    const next = { ...(raw ? JSON.parse(raw) : {}), [threadId]: at };
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(next)).catch(() => {});
    setSeen(next);
  }, []);
  return { seen, markSeen };
}

export const threadName = (t: Thread) => t.guest_name || t.title || "Guest";

export const providerSource = (p: string | null) => {
  const v = (p ?? "").toLowerCase();
  if (v.includes("airbnb")) return "airbnb" as const;
  if (v.includes("booking")) return "booking" as const;
  return null;
};

export const kindLabel = (t: Thread) =>
  t.thread_kind === "enquiry" ? "Enquiry" : t.thread_kind === "booking_request" ? "Booking request" : null;

export function guestSummary(t: Thread) {
  const parts: string[] = [];
  if (t.adults != null) parts.push(`${t.adults} adult${t.adults === 1 ? "" : "s"}`);
  if (t.children != null && t.children > 0) parts.push(`${t.children} child${t.children === 1 ? "" : "ren"}`);
  if (t.infants != null && t.infants > 0) parts.push(`${t.infants} infant${t.infants === 1 ? "" : "s"}`);
  const ages = Array.isArray(t.guest_ages) ? (t.guest_ages as unknown[]).filter((a) => a != null) : [];
  return parts.length ? parts.join(", ") + (ages.length ? ` (ages: ${ages.join(", ")})` : "") : null;
}

/** Image URLs in a message's attachments, whatever shape Channex sends them in. */
export function attachmentUrls(attachments: unknown[] | undefined): string[] {
  return (attachments ?? [])
    .map((a) => (typeof a === "string" ? a : (a as { url?: string; file_url?: string })?.url ?? (a as { file_url?: string })?.file_url))
    .filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u));
}
