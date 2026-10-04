import React from "react";
import { View } from "react-native";
import { ClipboardCheck } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Card, PageHeader, Text } from "@/components/ui";
import { useColors } from "@/lib/theme";

// Placeholder until the inspection backend (the app's own Supabase project) is set up.
export default function InspectionsScreen() {
  const c = useColors();
  return (
    <Screen>
      <PageHeader title="Inspections" subtitle="Check every apartment after checkout" />
      <Card style={{ padding: 24, alignItems: "center", gap: 10 }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: c.muted, alignItems: "center", justifyContent: "center" }}>
          <ClipboardCheck size={26} color={c.accent} />
        </View>
        <Text weight="semibold" size={16}>
          Coming next
        </Text>
        <Text muted style={{ textAlign: "center" }}>
          Inspections for every checkout, with room-by-room checklists, photos and auto-written reports, will appear here.
        </Text>
      </Card>
    </Screen>
  );
}
