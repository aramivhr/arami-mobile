import React from "react";
import { Image, Pressable, RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { router } from "expo-router";
import { Bell } from "lucide-react-native";
import { Text } from "@/components/ui";
import { useColors } from "@/lib/theme";
import { useNotifications } from "@/hooks/data";
import { useUserType } from "@/hooks/permissions";
import { canSeeScreen } from "@/lib/access";

/** Scrollable page body with pull-to-refresh. */
export function Screen({
  children,
  onRefresh,
  refreshing = false,
  contentStyle,
  scroll = true,
}: {
  children: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
}) {
  const c = useColors();
  const inner: StyleProp<ViewStyle> = [{ padding: 14, gap: 16, width: "100%", maxWidth: 900, alignSelf: "center" }, contentStyle];
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: c.background }, inner]}>{children}</View>;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={inner}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} /> : undefined}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

/** Left side of the top bar: the app mark and name, like the website's mobile header. */
export function HeaderBrand() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Image source={require("../../assets/icon.png")} style={{ width: 28, height: 28, borderRadius: 7 }} />
      <Text weight="bold" size={15} style={{ letterSpacing: -0.2 }}>
        Arami Portal
      </Text>
    </View>
  );
}

/** Notification bell with unread count; only for user types that have the Notifications page. */
export function HeaderBell() {
  const c = useColors();
  const { data: type } = useUserType();
  const allowed = canSeeScreen(type, "notifications");
  const { data = [] } = useNotifications();
  if (!allowed) return null;
  const unread = data.filter((n) => !n.read).length;
  return (
    <Pressable onPress={() => router.push("/notifications")} hitSlop={10} style={{ padding: 6, marginRight: 8 }} accessibilityLabel="Notifications">
      <Bell size={20} color={c.foreground} />
      {unread > 0 && (
        <View
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: c.destructive,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 3,
          }}
        >
          <Text weight="bold" size={9} style={{ color: "#fff" }}>
            {unread > 99 ? "99+" : unread}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
