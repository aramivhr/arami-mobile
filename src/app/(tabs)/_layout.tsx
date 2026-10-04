import React from "react";
import { View } from "react-native";
import { Tabs } from "expo-router";
import { BookOpen, CalendarDays, ClipboardCheck, LayoutDashboard, Menu, MessageSquare } from "lucide-react-native";
import { HeaderBell, HeaderBrand } from "@/components/Screen";
import { Text } from "@/components/ui";
import { fonts, useColors } from "@/lib/theme";
import { useUserType } from "@/hooks/permissions";
import { TABS_BY_TYPE, type TabKey } from "@/lib/access";

const TAB_META: Record<TabKey, { route: string; title: string; Icon: typeof LayoutDashboard }> = {
  dashboard: { route: "index", title: "Dashboard", Icon: LayoutDashboard },
  calendar: { route: "calendar", title: "Calendar", Icon: CalendarDays },
  reservations: { route: "reservations-tab", title: "Reservations", Icon: BookOpen },
  messages: { route: "messages", title: "Messages", Icon: MessageSquare },
  inspections: { route: "inspections", title: "Inspections", Icon: ClipboardCheck },
  more: { route: "more", title: "More", Icon: Menu },
};

const ALL_TABS = Object.keys(TAB_META) as TabKey[];

export default function TabsLayout() {
  const c = useColors();
  const { data: type, isLoading } = useUserType();

  if (isLoading || !type) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: "center", justifyContent: "center" }}>
        <Text muted>Loading...</Text>
      </View>
    );
  }

  const visible = TABS_BY_TYPE[type];
  // Render tabs in the order the access table gives for this user type.
  const ordered = [...visible, ...ALL_TABS.filter((t) => !visible.includes(t))];

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.card },
        headerShadowVisible: false,
        headerTitle: () => null,
        headerLeft: () => (
          <View style={{ paddingLeft: 16 }}>
            <HeaderBrand />
          </View>
        ),
        headerRight: () => <HeaderBell />,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.mutedForeground,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 10 },
        sceneStyle: { backgroundColor: c.background },
      }}
    >
      {ordered.map((key) => {
        const { route, title, Icon } = TAB_META[key];
        return (
          <Tabs.Screen
            key={key}
            name={route}
            options={{
              title,
              href: visible.includes(key) ? undefined : null,
              tabBarIcon: ({ color, size }) => <Icon color={color} size={size - 2} />,
            }}
          />
        );
      })}
    </Tabs>
  );
}
