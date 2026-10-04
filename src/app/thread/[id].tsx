import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Info, Send } from "lucide-react-native";
import { Input, Sheet, Text } from "@/components/ui";
import { KindBadge } from "@/components/badges";
import { RequireScreen } from "@/components/RequireScreen";
import { attachmentUrls, guestSummary, kindLabel, threadName, useSeen, useSendMessage, useThreadMessages, useThreads } from "@/hooks/messages";
import { dateTime, shortDate, prettyDate } from "@/lib/dates";
import { useColors } from "@/lib/theme";

// One guest conversation. Replies are text only (Gevorg's decision).
export default function ThreadRoute() {
  return (
    <RequireScreen screen="messages">
      <ThreadScreen />
    </RequireScreen>
  );
}

function ThreadScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const threadsQ = useThreads();
  const msgsQ = useThreadMessages(id);
  const send = useSendMessage(id);
  const { markSeen } = useSeen();
  const [draft, setDraft] = useState("");
  const [details, setDetails] = useState(false);
  const listRef = useRef<FlatList>(null);
  const thread = threadsQ.data?.threads.find((t) => t.id === id);
  const messages = msgsQ.data?.messages ?? [];

  useLayoutEffect(() => {
    navigation.setOptions({
      title: thread ? threadName(thread) : "Conversation",
      headerRight: () => (
        <Pressable onPress={() => setDetails(true)} hitSlop={10} accessibilityLabel="Details">
          <Info size={20} color={c.foreground} />
        </Pressable>
      ),
    });
  }, [navigation, thread?.id, thread?.guest_name, c.foreground]);

  useEffect(() => {
    if (thread?.last_message_at) markSeen(thread.id, thread.last_message_at);
  }, [thread?.id, thread?.last_message_at, markSeen]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    send.mutate(text, {
      onError: (e) => {
        setDraft(text);
        Alert.alert("Message not sent", (e as Error).message);
      },
    });
  };

  const subtitle = thread
    ? [thread.unit, thread.check_in && thread.check_out ? `${shortDate(thread.check_in)} – ${prettyDate(thread.check_out)}` : null, thread.provider]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0} style={{ flex: 1, backgroundColor: c.background }}>
      {!!subtitle && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text muted size={12} numberOfLines={1} style={{ flex: 1 }}>
            {subtitle}
          </Text>
          {thread && kindLabel(thread) && <KindBadge kind={thread.thread_kind} label={kindLabel(thread)!} />}
        </View>
      )}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <Text muted size={13}>
            {msgsQ.isLoading ? "Loading messages…" : msgsQ.isError ? "Couldn't load messages." : ""}
          </Text>
        }
        renderItem={({ item: m }) => {
          const mine = m.sender === "property";
          const system = m.sender === "system";
          const images = attachmentUrls(m.attachments);
          return (
            <View style={{ alignItems: mine ? "flex-end" : system ? "center" : "flex-start" }}>
              <View
                style={{
                  maxWidth: "82%",
                  borderRadius: 16,
                  borderBottomRightRadius: mine ? 4 : 16,
                  borderBottomLeftRadius: !mine && !system ? 4 : 16,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: mine ? c.primary : system ? c.muted : c.secondary,
                  gap: 6,
                }}
              >
                {images.map((u) => (
                  <Image key={u} source={{ uri: u }} style={{ width: 200, height: 200, borderRadius: 10 }} resizeMode="cover" />
                ))}
                {!!m.text && (
                  <Text size={system ? 12 : 14} muted={system} style={mine ? { color: c.primaryForeground } : undefined}>
                    {m.text}
                  </Text>
                )}
                {!!m.at && (
                  <Text size={10} style={{ opacity: 0.7, textAlign: mine ? "right" : "left", color: mine ? c.primaryForeground : c.mutedForeground }}>
                    {dateTime(m.at)}
                  </Text>
                )}
              </View>
            </View>
          );
        }}
      />
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 8,
          paddingHorizontal: 12,
          paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 10),
          borderTopWidth: 1,
          borderTopColor: c.border,
          backgroundColor: c.card,
        }}
      >
        <Input value={draft} onChangeText={setDraft} placeholder="Write a reply…" multiline style={{ flex: 1, maxHeight: 120 }} />
        <Pressable
          onPress={submit}
          disabled={!draft.trim() || send.isPending}
          accessibilityLabel="Send"
          style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: c.primary, alignItems: "center", justifyContent: "center", opacity: !draft.trim() ? 0.5 : 1 }}
        >
          <Send size={18} color={c.primaryForeground} />
        </Pressable>
      </View>

      <Sheet open={details} onClose={() => setDetails(false)} title={thread ? threadName(thread) : "Details"}>
        {thread && (
          <View style={{ gap: 8 }}>
            {kindLabel(thread) && <KindBadge kind={thread.thread_kind} label={kindLabel(thread)!} />}
            <DetailRow label="Apartment" value={thread.building ? `${thread.building} – ${thread.unit ?? "—"}` : thread.unit ?? "—"} />
            <DetailRow label="Phone" value={thread.guest_phone ?? "—"} />
            <DetailRow
              label="Dates"
              value={thread.check_in && thread.check_out ? `${prettyDate(thread.check_in)} – ${prettyDate(thread.check_out)}` : "—"}
            />
            <DetailRow label="Guests" value={guestSummary(thread) ?? "—"} />
            {!!thread.status && (
              <Text>
                <Text weight="medium">Status: </Text>
                <Text weight="medium" style={{ color: thread.status === "cancelled" ? c.destructive : c.emerald }}>
                  {thread.status === "cancelled" ? "Cancelled" : "Confirmed"}
                </Text>
              </Text>
            )}
            <DetailRow
              label="Price"
              value={thread.total_price != null ? `${thread.currency ?? "AED"} ${Number(thread.total_price).toLocaleString()}` : "—"}
            />
          </View>
        )}
      </Sheet>
    </KeyboardAvoidingView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Text muted>
      <Text weight="medium">{label}: </Text>
      {value}
    </Text>
  );
}
