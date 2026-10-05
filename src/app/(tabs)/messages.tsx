import React, { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { router } from "expo-router";
import { MessageSquare, Search } from "lucide-react-native";
import { Input, Text } from "@/components/ui";
import { KindBadge, SourceBadge, withAlpha } from "@/components/badges";
import { kindLabel, preloadRecentThreads, providerSource, threadName, useSeen, useThreads } from "@/hooks/messages";
import { timeAgo } from "@/lib/dates";
import { useColors } from "@/lib/theme";
import type { Thread } from "@/lib/types";

// Guest conversations from Airbnb and Booking.com, as on the website's Messages page.
export default function MessagesScreen() {
  const c = useColors();
  const threadsQ = useThreads();
  const { seen } = useSeen();
  const [search, setSearch] = useState("");
  const threads = threadsQ.data?.threads ?? [];
  const qc = useQueryClient();

  // Preload the newest conversations, a few at a time, so opening one is instant.
  const recentKey = threads.slice(0, 8).map((t) => t.id + t.last_message_at).join();
  useEffect(() => {
    if (threads.length) void preloadRecentThreads(qc, threads);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentKey, qc]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => [t.title, t.guest_name, t.unit, t.last_message].some((v) => v?.toLowerCase().includes(q)));
  }, [threads, search]);

  const isUnread = (t: Thread) => !!t.last_message_at && (!seen[t.id] || seen[t.id] < t.last_message_at);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <MessageSquare size={20} color={c.emerald} />
          <Text weight="bold" size={22}>
            Messages
          </Text>
        </View>
        <View style={{ justifyContent: "center" }}>
          <View style={{ position: "absolute", left: 12, zIndex: 1 }}>
            <Search size={16} color={c.mutedForeground} />
          </View>
          <Input value={search} onChangeText={setSearch} placeholder="Search guest or unit" style={{ paddingLeft: 36, minHeight: 40 }} />
        </View>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(t) => t.id}
        refreshControl={<RefreshControl refreshing={threadsQ.isRefetching} onRefresh={() => threadsQ.refetch()} tintColor={c.accent} />}
        ListEmptyComponent={
          <Text muted style={{ padding: 16 }}>
            {threadsQ.isLoading
              ? "Loading conversations…"
              : threadsQ.isError
                ? `Couldn't load conversations. ${(threadsQ.error as Error).message}`
                : "No conversations yet."}
          </Text>
        }
        renderItem={({ item: t }) => {
          const src = providerSource(t.provider);
          const unread = isUnread(t);
          const kind = kindLabel(t);
          return (
            <Pressable
              onPress={() => router.push({ pathname: "/thread/[id]", params: { id: t.id } })}
              style={({ pressed }) => ({
                flexDirection: "row",
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: c.border,
                backgroundColor: pressed ? withAlpha(c.emerald, 0.06) : "transparent",
              })}
            >
              <View>
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: withAlpha(c.emerald, 0.15), alignItems: "center", justifyContent: "center" }}>
                  <Text weight="bold" style={{ color: "#059669" }}>
                    {(threadName(t).trim()[0] || "G").toUpperCase()}
                  </Text>
                </View>
                {unread && (
                  <View
                    style={{ position: "absolute", top: -1, right: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: c.emerald, borderWidth: 2, borderColor: c.background }}
                  />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                  <Text weight={unread ? "bold" : "semibold"} numberOfLines={1} style={{ flex: 1 }}>
                    {threadName(t)}
                  </Text>
                  {!!t.last_message_at && (
                    <Text muted size={11}>
                      {timeAgo(t.last_message_at)}
                    </Text>
                  )}
                </View>
                {!!t.last_message && (
                  <Text size={12} numberOfLines={1} muted={!unread} style={{ marginTop: 2 }}>
                    {t.last_message}
                  </Text>
                )}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                  {src && <SourceBadge source={src} size="sm" />}
                  {kind && <KindBadge kind={t.thread_kind} label={kind} />}
                  {!!t.unit && (
                    <Text muted size={12} numberOfLines={1} style={{ flexShrink: 1 }}>
                      {t.unit}
                    </Text>
                  )}
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
