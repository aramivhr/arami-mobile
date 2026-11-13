import React from "react";
import { Vibration, View } from "react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing } from "lucide-react-native";
import { Button, Sheet, Text } from "@/components/ui";
import { withAlpha } from "@/components/badges";
import { useMarkRead } from "@/hooks/data";
import { supabase } from "@/lib/supabase";
import { bookingRows, takeNewBookings, type BookingNotification } from "@/lib/newBookingAlert";
import { useColors } from "@/lib/theme";

// Checked more often than the bell's 60s so a new booking pops up quickly.
const POLL_MS = 15_000;

/**
 * The website's new-reservation pop-up: whenever a reservation arrives from a
 * channel while the app is open, it pops up and the phone buzzes (the website
 * plays a chime). Phone alerts cover the app being closed.
 */
export function NewBookingAlert() {
  const c = useColors();
  const qc = useQueryClient();
  const markRead = useMarkRead();
  const seen = React.useRef<Set<string> | null>(null);
  const [queue, setQueue] = React.useState<BookingNotification[]>([]);

  const { data: latest } = useQuery({
    queryKey: ["notifications", "new-bookings"],
    refetchInterval: POLL_MS,
    queryFn: async (): Promise<BookingNotification[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, kind, title, body, reservation_id, created_at")
        .eq("kind", "new")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as BookingNotification[];
    },
  });

  React.useEffect(() => {
    if (!latest) return;
    const { seen: next, fresh } = takeNewBookings(seen.current, latest);
    seen.current = next;
    if (fresh.length === 0) return;
    setQueue((q) => [...q, ...fresh]);
    Vibration.vibrate([0, 300, 150, 300]);
    qc.invalidateQueries({ queryKey: ["notifications"], exact: false });
    qc.invalidateQueries({ queryKey: ["reservations"] });
  }, [latest, qc]);

  const current = queue[0];
  if (!current) return null;

  const dismiss = () => setQueue((q) => q.slice(1));
  const open = () => {
    markRead.mutate(current.id);
    dismiss();
    if (current.reservation_id) router.push({ pathname: "/reservation/[id]", params: { id: current.reservation_id } });
  };

  return (
    <Sheet
      open
      onClose={dismiss}
      footer={
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button title={queue.length > 1 ? "Next" : "Dismiss"} variant="outline" style={{ flex: 1 }} onPress={dismiss} />
          <Button title="Open reservation" style={{ flex: 1 }} onPress={open} />
        </View>
      }
    >
      <View style={{ alignItems: "center", gap: 6 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: withAlpha(c.accent, 0.15), alignItems: "center", justifyContent: "center" }}>
          <BellRing size={28} color={c.accent} />
        </View>
        <Text weight="bold" size={22}>
          New reservation
        </Text>
        <Text muted>{queue.length > 1 ? `${queue.length} new reservations just arrived` : "Just arrived from the channel manager"}</Text>
      </View>
      {bookingRows(current.body).map(([label, value]) => (
        <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
          <Text muted>{label}</Text>
          <Text weight="medium" style={{ flexShrink: 1, textAlign: "right" }}>
            {value}
          </Text>
        </View>
      ))}
    </Sheet>
  );
}
