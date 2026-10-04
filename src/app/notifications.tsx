import React from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { router } from "expo-router";
import { CalendarPlus, CalendarX, MessageSquare, Pencil } from "lucide-react-native";
import { Button, Text } from "@/components/ui";
import { withAlpha } from "@/components/badges";
import { useMarkAllRead, useMarkRead, useNotifications, useReservations } from "@/hooks/data";
import { RequireScreen } from "@/components/RequireScreen";
import { timeAgo, toISO } from "@/lib/dates";
import { useColors } from "@/lib/theme";
import type { AppNotification, Reservation } from "@/lib/types";

// The website's notification list (new, changed and cancelled reservations and
// guest messages). Same-day bookings are labelled "Last Minute Reservation".

export function isLastMinute(n: AppNotification, reservations: Reservation[]) {
  if (n.kind !== "new" || !n.reservation_id) return false;
  const r = reservations.find((x) => x.id === n.reservation_id);
  // Booked for the same day it was made.
  return !!r && r.check_in === toISO(new Date(n.created_at));
}

export default function NotificationsRoute() {
  return (
    <RequireScreen screen="notifications">
      <NotificationsScreen />
    </RequireScreen>
  );
}

function NotificationsScreen() {
  const c = useColors();
  const q = useNotifications();
  const { data: reservations = [] } = useReservations();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const items = q.data ?? [];
  const unread = items.filter((n) => !n.read).length;

  const open = (n: AppNotification) => {
    if (!n.read) markRead.mutate(n.id);
    if (n.kind === "message") {
      const threadId = n.dedupe_key?.startsWith("msg:") ? n.dedupe_key.split(":")[1] : null;
      if (threadId) router.push({ pathname: "/thread/[id]", params: { id: threadId } });
      else router.push("/messages");
    } else {
      router.push(n.reservation_id ? { pathname: "/reservations", params: { id: n.reservation_id } } : "/reservations");
    }
  };

  const meta = {
    new: { Icon: CalendarPlus, color: c.success },
    modified: { Icon: Pencil, color: c.accent },
    cancelled: { Icon: CalendarX, color: c.destructive },
    message: { Icon: MessageSquare, color: c.emerald },
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 8 }}>
        <Text muted style={{ flex: 1 }}>
          {unread > 0 ? `${unread} unread` : "All caught up"}
        </Text>
        {unread > 0 && <Button title="Mark all read" variant="outline" size="sm" onPress={() => markAll.mutate()} loading={markAll.isPending} />}
      </View>
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={c.accent} />}
        ListEmptyComponent={
          <Text muted style={{ textAlign: "center", padding: 24 }}>
            {q.isLoading ? "Loading..." : "No notifications yet"}
          </Text>
        }
        renderItem={({ item: n }) => {
          const { Icon, color } = meta[n.kind] ?? meta.new;
          const lastMinute = isLastMinute(n, reservations);
          return (
            <Pressable
              onPress={() => open(n)}
              style={({ pressed }) => ({
                flexDirection: "row",
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: c.border,
                backgroundColor: !n.read ? withAlpha(c.accent, 0.06) : pressed ? c.muted : "transparent",
              })}
            >
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: withAlpha(color, 0.15), alignItems: "center", justifyContent: "center" }}>
                <Icon size={17} color={color} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                {lastMinute && (
                  <Text weight="bold" size={11} style={{ color: c.destructive, letterSpacing: 0.5, textTransform: "uppercase" }}>
                    Last Minute Reservation
                  </Text>
                )}
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Text weight={n.read ? "medium" : "bold"} style={{ flex: 1 }}>
                    {n.title}
                  </Text>
                  <Text muted size={11}>
                    {timeAgo(n.created_at)}
                  </Text>
                </View>
                <Text muted size={12} numberOfLines={4}>
                  {n.body}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
