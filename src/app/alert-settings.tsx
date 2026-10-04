import React from "react";
import { Switch, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card, Divider, Text } from "@/components/ui";
import { RequireScreen } from "@/components/RequireScreen";
import { ALERT_TYPES, useAlertSettings, useSaveAlertSetting } from "@/hooks/push";
import { useUserType } from "@/hooks/permissions";
import { useColors } from "@/lib/theme";

// Each admin chooses which phone alerts they get (mobile_notification_settings).
export default function AlertSettingsRoute() {
  return (
    <RequireScreen screen="alert_settings">
      <AlertSettingsScreen />
    </RequireScreen>
  );
}

function AlertSettingsScreen() {
  const c = useColors();
  const { data: type } = useUserType();
  const q = useAlertSettings();
  const save = useSaveAlertSetting();
  const types = ALERT_TYPES.filter((t) => !t.superOnly || type === "super_admin");

  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Text muted size={13}>
        Choose which alerts this account gets on its phones. The Notifications page still lists everything.
      </Text>
      <Card>
        {types.map((t, i) => (
          <View key={t.key}>
            {i > 0 && <Divider />}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text weight="medium">{t.label}</Text>
                {!!t.hint && (
                  <Text muted size={12}>
                    {t.hint}
                  </Text>
                )}
              </View>
              <Switch
                value={q.data?.[t.key] ?? true}
                disabled={!q.data}
                onValueChange={(v) => save.mutate({ [t.key]: v })}
                trackColor={{ true: c.accent }}
                accessibilityLabel={t.label}
              />
            </View>
          </View>
        ))}
      </Card>
      {save.isError && (
        <Text size={13} style={{ color: c.destructive }}>
          Couldn't save that change. Check the connection and try again.
        </Text>
      )}
    </Screen>
  );
}
