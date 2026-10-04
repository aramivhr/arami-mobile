import React, { useEffect, useState } from "react";
import { Alert, Pressable, Switch, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { Bell, BellRing, BookOpen, ChevronRight, DollarSign, Fingerprint, LogOut, User } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Card, Divider, PageHeader, Text } from "@/components/ui";
import { useAuth } from "@/hooks/auth";
import { useUserType } from "@/hooks/permissions";
import { biometricAvailable, biometricLabel, getBiometricEnabled, setBiometricEnabled } from "@/hooks/biometric";
import { MORE_BY_TYPE, type ScreenKey } from "@/lib/access";
import { useColors } from "@/lib/theme";

const SCREEN_META: Record<
  Exclude<ScreenKey, "messages" | "inspections">,
  { label: string; href: "/reservations" | "/notifications" | "/financial" | "/alert-settings"; Icon: typeof Bell }
> = {
  reservations: { label: "Reservations", href: "/reservations", Icon: BookOpen },
  notifications: { label: "Notifications", href: "/notifications", Icon: Bell },
  alert_settings: { label: "Phone alerts", href: "/alert-settings", Icon: BellRing },
  financial: { label: "Financial", href: "/financial", Icon: DollarSign },
};

const TYPE_LABEL = { super_admin: "Super admin", admin: "Admin", owner: "Owner" } as const;

export default function MoreScreen() {
  const c = useColors();
  const { user, logout } = useAuth();
  const { data: type } = useUserType();
  const [bioLabel, setBioLabel] = useState<string | null>(null);
  const [bioOn, setBioOn] = useState(false);

  useEffect(() => {
    (async () => {
      if (await biometricAvailable()) {
        setBioLabel(await biometricLabel());
        setBioOn(await getBiometricEnabled());
      }
    })();
  }, []);

  const items = (type ? MORE_BY_TYPE[type] : []).filter((k): k is keyof typeof SCREEN_META => k in SCREEN_META);

  const Row = ({ Icon, label, onPress, right, danger }: { Icon: typeof Bell; label: string; onPress?: () => void; right?: React.ReactNode; danger?: boolean }) => (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, opacity: pressed ? 0.6 : 1 })}>
      <Icon size={20} color={danger ? c.destructive : c.foreground} />
      <Text weight="medium" style={[{ flex: 1 }, danger ? { color: c.destructive } : null]}>
        {label}
      </Text>
      {right ?? (onPress ? <ChevronRight size={18} color={c.mutedForeground} /> : null)}
    </Pressable>
  );

  return (
    <Screen>
      <PageHeader title="More" />
      <Card>
        <Row Icon={User} label={`${user?.email ?? ""}${type ? `  ·  ${TYPE_LABEL[type]}` : ""}`} />
      </Card>
      {items.length > 0 && (
        <Card>
          {items.map((k, i) => (
            <View key={k}>
              {i > 0 && <Divider />}
              <Row Icon={SCREEN_META[k].Icon} label={SCREEN_META[k].label} onPress={() => router.push(SCREEN_META[k].href)} />
            </View>
          ))}
        </Card>
      )}
      <Card>
        {bioLabel && (
          <>
            <Row
              Icon={Fingerprint}
              label={`Unlock with ${bioLabel}`}
              right={
                <Switch
                  value={bioOn}
                  onValueChange={async (v) => {
                    setBioOn(v);
                    await setBiometricEnabled(v);
                  }}
                  trackColor={{ true: c.accent }}
                />
              }
            />
            <Divider />
          </>
        )}
        <Row
          Icon={LogOut}
          label="Sign Out"
          danger
          onPress={() =>
            Alert.alert("Sign out?", "", [
              { text: "Cancel", style: "cancel" },
              { text: "Sign Out", style: "destructive", onPress: logout },
            ])
          }
        />
      </Card>
      <Text muted size={11} style={{ textAlign: "center" }}>
        Arami Portal {Constants.expoConfig?.version ?? ""}
      </Text>
    </Screen>
  );
}
