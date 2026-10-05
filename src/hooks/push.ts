import { useEffect } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/auth";
import { useUserType } from "@/hooks/permissions";
import { getsPushAlerts } from "@/lib/access";
import { pushTarget, type PushData } from "@/lib/notify";
import type { NotificationSettings } from "@/lib/types";

// Phone alerts. The backend function mobile-push-dispatch sends them through
// Expo to every token in mobile_devices that belongs to an admin or super admin,
// respecting each person's mobile_notification_settings.

const TOKEN_KEY = "push-token";

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

function projectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/** Expo Go (the test app from the store) can't receive remote alerts; only real builds can. */
const inExpoGo = Constants.executionEnvironment === "storeClient";

async function getToken(): Promise<string | null> {
  if (Platform.OS === "web" || !Device.isDevice || inExpoGo) return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Alerts",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return null;
  const id = projectId();
  if (!id) {
    console.warn("Push: no EAS projectId in app.json, run `eas init` first.");
    return null;
  }
  return (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
}

/** Saves this phone's push token for admins and super admins after sign-in. */
export function usePushRegistration() {
  const { user } = useAuth();
  const { data: type } = useUserType();

  useEffect(() => {
    if (!user || !type || !getsPushAlerts(type)) return;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        await supabase.from("mobile_devices").upsert(
          {
            user_id: user.id,
            expo_push_token: token,
            platform: Platform.OS === "ios" ? "ios" : "android",
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "expo_push_token" },
        );
        await AsyncStorage.setItem(TOKEN_KEY, token);
      } catch (e) {
        console.warn("Push registration failed", e);
      }
    })();
  }, [user?.id, type]);
}

/** Removes this phone's token so the next person to sign in doesn't get the previous person's alerts. */
export async function unregisterPush() {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) await supabase.from("mobile_devices").delete().eq("expo_push_token", token);
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch (e) {
    console.warn("Push unregister failed", e);
  }
}

/** Opens the screen a tapped alert points to. */
export function openFromPush(data: PushData) {
  router.push(pushTarget(data));
}

/** Opens the right screen when someone taps an alert, including the one that launched the app. */
export function usePushRouting() {
  const qc = useQueryClient();
  useEffect(() => {
    if (Platform.OS === "web") return;
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      openFromPush(last.notification.request.content.data as PushData);
      Notifications.clearLastNotificationResponse();
    }
    const tap = Notifications.addNotificationResponseReceivedListener((r) => {
      openFromPush(r.notification.request.content.data as PushData);
    });
    // An alert while the app is open means new data: refresh the lists.
    const received = Notifications.addNotificationReceivedListener(() => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["inspections"] });
      qc.invalidateQueries({ queryKey: ["reservations"] });
    });
    return () => {
      tap.remove();
      received.remove();
    };
  }, [qc]);
}

export const ALERT_TYPES: { key: keyof Omit<NotificationSettings, "user_id">; label: string; hint: string; superOnly?: boolean }[] = [
  { key: "reservation_new", label: "New reservations", hint: "Including Last Minute Reservations" },
  { key: "reservation_modified", label: "Changed reservations", hint: "Dates, guests or price changed" },
  { key: "reservation_cancelled", label: "Cancelled reservations", hint: "" },
  { key: "guest_message", label: "Guest messages", hint: "Airbnb, Booking.com and other channels" },
  { key: "inspection_due", label: "Inspections due", hint: "When a guest checks out" },
  { key: "inspection_damage", label: "Damage found", hint: "Super admins only", superOnly: true },
  { key: "sync_failure", label: "Channel sync failures", hint: "When an update to Channex fails" },
];

const DEFAULTS: Omit<NotificationSettings, "user_id"> = {
  reservation_new: true,
  reservation_modified: true,
  reservation_cancelled: true,
  guest_message: true,
  inspection_due: true,
  inspection_damage: true,
  sync_failure: true,
};

export function useAlertSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["alert-settings", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<NotificationSettings> => {
      const { data, error } = await supabase.from("mobile_notification_settings").select("*").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      // No row means every alert is on.
      return (data as NotificationSettings) ?? { user_id: user!.id, ...DEFAULTS };
    },
  });
}

export function useSaveAlertSetting() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<NotificationSettings, "user_id">>) => {
      const current = qc.getQueryData<NotificationSettings>(["alert-settings", user?.id]) ?? { user_id: user!.id, ...DEFAULTS };
      const { error } = await supabase
        .from("mobile_notification_settings")
        .upsert({ ...current, ...patch, user_id: user!.id }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onMutate: async (patch) => {
      const key = ["alert-settings", user?.id];
      const prev = qc.getQueryData<NotificationSettings>(key);
      if (prev) qc.setQueryData(key, { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.prev) qc.setQueryData(["alert-settings", user?.id], ctx.prev);
    },
  });
}
