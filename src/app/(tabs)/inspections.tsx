import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { AlertTriangle, ChevronRight, CloudUpload, X } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Badge, Card, Empty, PageHeader, Select, Text } from "@/components/ui";
import { withAlpha } from "@/components/badges";
import { RangePicker } from "@/components/RangePicker";
import { RequireScreen } from "@/components/RequireScreen";
import { useAuth } from "@/hooks/auth";
import { nameOf, useIsSuperAdmin, useStaffNames } from "@/hooks/staff";
import { useInspections, usePendingCount, useUnitLabel, type InspectionFilters } from "@/hooks/inspections";
import { prettyDate, toISO, todayISO } from "@/lib/dates";
import { useColors } from "@/lib/theme";
import type { Inspection } from "@/lib/types";

// Inspections tab (admins and super admins). "To do" lists every checkout
// inspection not finished yet; "Previous inspections" lists saved reports,
// filterable by unit and dates.

export default function InspectionsRoute() {
  return (
    <RequireScreen screen="inspections">
      <InspectionsScreen />
    </RequireScreen>
  );
}

function InspectionsScreen() {
  const c = useColors();
  const [tab, setTab] = useState<"open" | "completed">("open");
  const [unit, setUnit] = useState("all");
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const filters: InspectionFilters =
    tab === "open" ? { status: "open" } : { status: "completed", apartmentId: unit === "all" ? undefined : unit, from: range?.from, to: range?.to };
  const q = useInspections(filters);
  const pending = usePendingCount();
  const units = useUnitLabel();
  const items = q.data ?? [];
  const today = todayISO();
  // Super admins see who submitted each inspection.
  const { user } = useAuth();
  const superAdmin = useIsSuperAdmin();
  const names = useStaffNames(superAdmin).data;

  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <PageHeader title="Inspections" subtitle="Check every apartment after checkout" />

      {pending > 0 && (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center", padding: 10, borderRadius: 10, backgroundColor: withAlpha(c.accent, 0.12) }}>
          <CloudUpload size={16} color={c.accent} />
          <Text size={13} style={{ flex: 1 }}>
            {pending === 1 ? "1 inspection is" : `${pending} inspections are`} saved on this phone and will upload when you're online.
          </Text>
        </View>
      )}

      <View style={{ flexDirection: "row", backgroundColor: c.muted, borderRadius: 10, padding: 3 }}>
        {(["open", "completed"] as const).map((k) => (
          <Pressable
            key={k}
            onPress={() => setTab(k)}
            style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: tab === k ? c.card : "transparent" }}
          >
            <Text weight={tab === k ? "semibold" : "medium"} size={13} muted={tab !== k}>
              {k === "open" ? "To do" : "Previous inspections"}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "completed" && (
        <View style={{ gap: 10 }}>
          <Select title="Unit" value={unit} onChange={setUnit} options={[{ value: "all", label: "All units" }, ...units.options]} />
          <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
            <View style={{ flex: 1 }}>
              <RangePicker
                label="Dates"
                start={range?.from ?? ""}
                end={range?.to ?? ""}
                nightsMode={false}
                onChange={(from, to) => setRange({ from, to })}
              />
            </View>
            {range && (
              <Pressable onPress={() => setRange(null)} hitSlop={8} style={{ padding: 10 }} accessibilityLabel="Clear dates">
                <X size={18} color={c.mutedForeground} />
              </Pressable>
            )}
          </View>
        </View>
      )}

      {items.length === 0 ? (
        <Empty>
          {q.isLoading
            ? "Loading..."
            : q.isError
              ? "Couldn't load inspections."
              : tab === "open"
                ? "No inspections to do. One is added for every checkout."
                : "No previous inspections match."}
        </Empty>
      ) : (
        <View style={{ gap: 10 }}>
          {items.map((i) => (
            <InspectionCard key={i.id} insp={i} unit={units.label(i.apartment_id)} today={today} by={superAdmin ? nameOf(names, i.inspector_id, user?.id) : null} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function InspectionCard({ insp, unit, today, by }: { insp: Inspection; unit: string; today: string; by: string | null }) {
  const c = useColors();
  const done = insp.status === "completed";
  const overdue = !done && insp.due_date < today;
  const issues = insp.results.filter((r) => r.condition !== "ok").length;
  return (
    <Card onPress={() => router.push({ pathname: "/inspection/[id]", params: { id: insp.id } })} style={{ padding: 14, gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
          {unit}
        </Text>
        <ChevronRight size={18} color={c.mutedForeground} />
      </View>
      <Text muted size={13}>
        {insp.guest_name ?? "Guest"} · checkout {prettyDate(insp.due_date)}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {insp.urgent && !done && <Badge label="Urgent: guest arriving today" color={c.destructive} bg={withAlpha(c.destructive, 0.12)} />}
        {overdue && <Badge label="Overdue" color={c.destructive} bg={withAlpha(c.destructive, 0.12)} />}
        {!done && (
          <Badge
            label={insp.status === "in_progress" ? "In progress" : "Not started"}
            color={insp.status === "in_progress" ? c.accent : c.mutedForeground}
            bg={insp.status === "in_progress" ? withAlpha(c.accent, 0.12) : c.muted}
          />
        )}
        {done && insp.damage_found && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <AlertTriangle size={13} color={c.destructive} />
            <Text size={12} style={{ color: c.destructive }}>
              Damage or missing items
            </Text>
          </View>
        )}
        {done && !insp.damage_found && (
          <Text size={12} style={{ color: c.success }}>
            {issues > 0 ? `${issues} item${issues === 1 ? "" : "s"} to clean` : "All OK"}
          </Text>
        )}
        {done && insp.completed_at && (
          <Text muted size={12}>
            · completed {prettyDate(toISO(new Date(insp.completed_at)))}
          </Text>
        )}
        {by && !!insp.inspector_id && (
          <Text muted size={12}>
            · {done ? "submitted" : "started"} by {by}
          </Text>
        )}
      </View>
    </Card>
  );
}
