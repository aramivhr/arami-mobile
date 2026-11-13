import React, { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Card, Divider, Empty, Input, Label, Text } from "@/components/ui";
import { RequireScreen } from "@/components/RequireScreen";
import { BuildingEmailSheet, buildingEmailTo } from "@/components/BuildingEmailSheet";
import { useApartments, useBuildings } from "@/hooks/data";
import { useColors } from "@/lib/theme";
import type { Apartment } from "@/lib/types";

// Email a building without a reservation, e.g. for a cleaning, maintenance or
// inspection visit (the website does this from a unit on its Buildings page).
// Pick the unit; the form is the same one the reservation page opens.

export default function BuildingEmailRoute() {
  return (
    <RequireScreen screen="building_email">
      <BuildingEmailScreen />
    </RequireScreen>
  );
}

function BuildingEmailScreen() {
  const c = useColors();
  const buildingsQ = useBuildings();
  const apartmentsQ = useApartments();
  const buildings = buildingsQ.data ?? [];
  const apartments = apartmentsQ.data ?? [];
  const [search, setSearch] = useState("");
  const [unit, setUnit] = useState<Apartment | null>(null);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return buildings
      .map((b) => ({
        building: b,
        units: apartments
          .filter((a) => a.building_id === b.id)
          .filter((a) => !q || a.name.toLowerCase().includes(q) || b.name.toLowerCase().includes(q))
          .sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true })),
      }))
      .filter((g) => g.units.length > 0)
      .sort((x, y) => x.building.name.localeCompare(y.building.name));
  }, [buildings, apartments, search]);

  const unitBuilding = unit ? buildings.find((b) => b.id === unit.building_id) : undefined;

  return (
    <Screen
      onRefresh={() => {
        buildingsQ.refetch();
        apartmentsQ.refetch();
      }}
      refreshing={buildingsQ.isRefetching || apartmentsQ.isRefetching}
    >
      <Text muted size={13}>
        Tell a building about a cleaning, maintenance or inspection visit. For a guest check-in, open the reservation and tap Email building.
      </Text>
      <Input value={search} onChangeText={setSearch} placeholder="Search unit or building" autoCapitalize="none" />
      {groups.map((g) => (
        <View key={g.building.id} style={{ gap: 6 }}>
          <Label style={{ marginBottom: 0 }}>{g.building.name}</Label>
          <Card>
            {g.units.map((a, i) => {
              const to = buildingEmailTo(a, g.building);
              return (
                <View key={a.id}>
                  {i > 0 && <Divider />}
                  <Pressable
                    onPress={() => setUnit(a)}
                    style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", padding: 14, gap: 10, opacity: pressed ? 0.6 : 1 })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text weight="medium">{a.name}</Text>
                      <Text muted size={12} numberOfLines={1}>
                        {to || "No building email yet"}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={c.mutedForeground} />
                  </Pressable>
                </View>
              );
            })}
          </Card>
        </View>
      ))}
      {groups.length === 0 && <Empty>{apartmentsQ.isLoading ? "Loading..." : "No units found"}</Empty>}

      {unit && unitBuilding && (
        <BuildingEmailSheet open={!!unit} onClose={() => setUnit(null)} apartment={unit} building={unitBuilding} />
      )}
    </Screen>
  );
}
