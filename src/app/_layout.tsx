import React, { useEffect } from "react";
import { Pressable, View } from "react-native";
import { router, Stack, useRootNavigationState } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_500Medium } from "@expo-google-fonts/dm-sans/500Medium";
import { DMSans_600SemiBold } from "@expo-google-fonts/dm-sans/600SemiBold";
import { DMSans_700Bold } from "@expo-google-fonts/dm-sans/700Bold";
import { AuthProvider, useAuth } from "@/hooks/auth";
import { BiometricGate } from "@/hooks/biometric";
import { usePushRegistration, usePushRouting } from "@/hooks/push";
import { useInspectionSync } from "@/hooks/inspections";
import { useMessagesWarmup } from "@/hooks/messages";
import { useUserType } from "@/hooks/permissions";
import { NewBookingAlert } from "@/components/NewBookingAlert";
import { Login } from "@/components/Login";
import { fonts, useColors } from "@/lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

// A screen opened straight from a phone alert or a link still has the tabs
// underneath it, so Back returns to the Dashboard.
export const unstable_settings = { initialRouteName: "(tabs)" };

/** Back button for a screen with nothing behind it (opened from an alert): goes to the Dashboard. */
function DashboardBack({ color }: { color: string }) {
  return (
    <Pressable
      onPress={() => router.replace("/")}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Back to Dashboard"
      style={{ flexDirection: "row", alignItems: "center", paddingRight: 8 }}
    >
      <ChevronLeft size={26} color={color} />
    </Pressable>
  );
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

function Root() {
  const c = useColors();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);

  if (loading) return <View style={{ flex: 1, backgroundColor: c.background }} />;
  if (!session) return <Login />;
  return <SignedIn />;
}

/** Opens tapped alerts once the screens are showing (after start-up and Face ID). */
function PushRouting() {
  const nav = useRootNavigationState();
  usePushRouting(!!nav?.key);
  return null;
}

/** Everything that needs a signed-in person: alerts, background upload of inspections, the new-booking pop-up, and the screens. */
function SignedIn() {
  const c = useColors();
  usePushRegistration();
  useInspectionSync();
  const { data: type } = useUserType();
  const isAdmin = type === "admin" || type === "super_admin";
  useMessagesWarmup(isAdmin);

  return (
    <BiometricGate>
      <Stack
        screenOptions={({ navigation }) => ({
          headerStyle: { backgroundColor: c.card },
          headerTintColor: c.foreground,
          headerTitleStyle: { fontFamily: fonts.semibold },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.background },
          headerBackTitle: "Back",
          // Opened from an alert with nothing behind it: show a Back to the Dashboard anyway.
          headerLeft: navigation.canGoBack() ? undefined : () => <DashboardBack color={c.foreground} />,
        })}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="thread/[id]" options={{ title: "Conversation" }} />
        <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
        <Stack.Screen name="reservations" options={{ title: "" }} />
        <Stack.Screen name="reservation/[id]" options={{ title: "Reservation" }} />
        <Stack.Screen name="financial" options={{ title: "" }} />
        <Stack.Screen name="inspection/[id]" options={{ title: "Inspection" }} />
        <Stack.Screen name="alert-settings" options={{ title: "Phone alerts" }} />
        <Stack.Screen name="building-email" options={{ title: "Email a building" }} />
      </Stack>
      <PushRouting />
      {isAdmin && <NewBookingAlert />}
    </BiometricGate>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold });
  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="auto" />
          <Root />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
