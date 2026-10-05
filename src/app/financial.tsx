import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Check, LogIn, Percent } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Card, Divider, Empty, Label, PageHeader, Select, Sheet, Text } from "@/components/ui";
import { SourceBadge, directPaymentLabel, withAlpha } from "@/components/badges";
import { RangePicker } from "@/components/RangePicker";
import { RequireScreen } from "@/components/RequireScreen";
import { useApartmentFinance, useApartments, useBuildings, useReservations } from "@/hooks/data";
import { useMyPermissions } from "@/hooks/permissions";
import { computeFinancial, presets, type ManageFilter } from "@/lib/financial";
import { parseISO } from "@/lib/dates";
import { useColors } from "@/lib/theme";

// The website's Financial page (owners and super admins with "show financial"):
// revenue pro-rated to the period, check-ins, occupancy, totals by channel and
// direct payment method, and each reservation's share.

export default function FinancialRoute() {
  return (
    <RequireScreen screen="financial">
      <FinancialScreen />
    </RequireScreen>
  );
}

const aed = (n: number) => `${n.toLocaleString("en-US")} AED`;
const dotted = (iso: string) => {
  const d = parseISO(iso);
  return d ? `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}` : iso;
};

function FinancialScreen() {
  const c = useColors();
  const { data: perms, isLoading: permsLoading } = useMyPermissions();
  const resQ = useReservations();
  const { data: apartments = [] } = useApartments();
  const { data: buildings = [] } = useBuildings();
  const { data: financeRows = [] } = useApartmentFinance();
  const thisMonth = presets()[0];
  const [range, setRange] = useState({ start: thisMonth.from, end: thisMonth.to });
  const [manage, setManage] = useState<ManageFilter>("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [pickUnits, setPickUnits] = useState(false);

  const label = useMemo(() => {
    const b = Object.fromEntries(buildings.map((x) => [x.id, x.name]));
    return (id: string) => {
      const a = apartments.find((x) => x.id === id);
      if (!a) return "Unknown";
      return b[a.building_id] ? `${b[a.building_id]} – ${a.name}` : a.name;
    };
  }, [apartments, buildings]);
  const scoped = manage === "all" ? apartments : apartments.filter((a) => a.manage_type === manage);

  const results = useMemo(
    () =>
      range.start && range.end
        ? computeFinancial({ reservations: resQ.data ?? [], apartments, financeRows, selected, manage, start: range.start, end: range.end })
        : null,
    [resQ.data, apartments, financeRows, selected, manage, range],
  );

  if (permsLoading) return null;
  if (!perms?.show_financial) {
    return (
      <Screen>
        <PageHeader title="Financial" />
        <Card style={{ padding: 24 }}>
          <Text muted style={{ textAlign: "center" }}>
            You do not have permission to view financial data.
          </Text>
        </Card>
      </Screen>
    );
  }

  const unitsLabel = selected.length === 0 ? "All Listings" : selected.length === 1 ? label(selected[0]) : `${selected.length} listings selected`;

  return (
    <Screen onRefresh={() => resQ.refetch()} refreshing={resQ.isRefetching}>
      <PageHeader title="Financial" />

      <Card style={{ padding: 14, gap: 12 }}>
        <View>
          <Label>Listings</Label>
          <Pressable
            onPress={() => setPickUnits(true)}
            style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, backgroundColor: c.card, minHeight: 40, paddingHorizontal: 12, justifyContent: "center" }}
          >
            <Text numberOfLines={1}>{unitsLabel}</Text>
          </Pressable>
        </View>
        <View>
          <Label>Unit type</Label>
          <Select
            title="Unit type"
            value={manage}
            onChange={(v) => {
              setManage(v);
              setSelected([]);
            }}
            options={[
              { value: "all", label: "All units" },
              { value: "sublease", label: "Rented (sublease)" },
              { value: "revenue_share", label: "Revenue sharing" },
            ]}
          />
        </View>
        <RangePicker label="Period" start={range.start} end={range.end} onChange={(start, end) => setRange({ start, end })} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {presets().map((p) => {
            const on = p.from === range.start && p.to === range.end;
            return (
              <Pressable
                key={p.label}
                onPress={() => setRange({ start: p.from, end: p.to })}
                style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: on ? c.accent : c.border, backgroundColor: on ? withAlpha(c.accent, 0.12) : c.card }}
              >
                <Text size={12} weight={on ? "semibold" : "regular"}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Card>

      {!results ? (
        <Card style={{ padding: 24 }}>
          <Text muted style={{ textAlign: "center" }}>
            Select a date range to view financial data.
          </Text>
        </Card>
      ) : (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Stat title="Total Revenue" value={aed(results.totalAmount)} subtitle={`${results.breakdown.length} reservation(s)`} icon={<Text weight="bold" size={10} style={{ color: c.accent }}>AED</Text>} />
            <Stat title="Check-ins" value={String(results.totalCheckIns)} subtitle="In selected period" icon={<LogIn size={14} color={c.accent} />} />
            <Stat title="Occupancy" value={`${results.occupancy.toFixed(1)}%`} subtitle={`${results.bookedNights}/${results.capacity} nights`} icon={<Percent size={14} color={c.accent} />} />
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {(
              [
                { key: "booking", label: "Booking.com" },
                { key: "airbnb", label: "Airbnb" },
                { key: "direct", label: "Direct" },
              ] as const
            ).map(({ key, label: l }) => (
              <Card key={key} style={{ padding: 12, flexDirection: "row", alignItems: "center", gap: 10, flexGrow: 1, flexBasis: "45%" }}>
                <SourceBadge source={key} />
                <View style={{ flex: 1 }}>
                  <Text muted size={11}>
                    {l}
                  </Text>
                  <Text weight="bold" numberOfLines={1}>
                    {aed(results.bySource[key] || 0)}
                  </Text>
                </View>
              </Card>
            ))}
          </View>

          {(results.bySource.direct || 0) > 0 && (
            <Card style={{ padding: 14, gap: 10 }}>
              <Text weight="semibold">Direct — Payment Method</Text>
              {(
                [
                  { key: "cash", label: "Cash" },
                  { key: "payment_link", label: "Payment Link" },
                  { key: "bank_transfer", label: "Bank Transfer" },
                ] as const
              ).map(({ key, label: l }) => (
                <View key={key} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text muted>{l}</Text>
                  <Text weight="semibold">{aed(results.byDirectPayment[key] || 0)}</Text>
                </View>
              ))}
            </Card>
          )}

          <Card>
            <Text weight="semibold" style={{ padding: 14 }}>
              Reservation Breakdown
            </Text>
            {results.breakdown.length === 0 ? (
              <Empty>No reservations found in this period.</Empty>
            ) : (
              results.breakdown.map(({ reservation: r, proRatedAmount, proRatedDays }) => (
                <View key={r.id}>
                  <Divider />
                  <View style={{ padding: 14, gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <SourceBadge source={r.source || "direct"} size="sm" />
                      <Text weight="medium" style={{ flex: 1 }} numberOfLines={1}>
                        {r.guest_name}
                      </Text>
                      <Text weight="bold">{aed(proRatedAmount)}</Text>
                    </View>
                    <Text muted size={12}>
                      {label(r.apartment_id)}
                      {r.source === "direct" && r.direct_payment_method ? ` · ${directPaymentLabel(r.direct_payment_method)}` : ""}
                    </Text>
                    <Text muted size={12}>
                      {dotted(r.check_in)} – {dotted(r.check_out)} · {proRatedDays} day(s) in period · full price {aed(r.total_price)}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </Card>
        </>
      )}

      <Sheet open={pickUnits} onClose={() => setPickUnits(false)} title="Listings">
        <View>
          <UnitRow label="All Listings" on={selected.length === 0} onPress={() => setSelected([])} />
          {scoped.map((a) => (
            <UnitRow
              key={a.id}
              label={label(a.id)}
              on={selected.includes(a.id)}
              onPress={() => setSelected((s) => (s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id]))}
            />
          ))}
        </View>
      </Sheet>
    </Screen>
  );
}

function UnitRow({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 1, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
        {on && <Check size={14} color={c.primaryForeground} />}
      </View>
      <Text style={{ flex: 1 }} weight={on ? "medium" : "regular"} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Stat({ title, value, subtitle, icon }: { title: string; value: string; subtitle: string; icon: React.ReactNode }) {
  const c = useColors();
  return (
    <Card style={{ padding: 12, gap: 4, flexGrow: 1, flexBasis: "45%" }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text muted size={11} style={{ flex: 1 }}>
          {title}
        </Text>
        <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: withAlpha(c.accent, 0.15), alignItems: "center", justifyContent: "center" }}>{icon}</View>
      </View>
      <Text weight="bold" size={18} numberOfLines={1}>
        {value}
      </Text>
      <Text muted size={11}>
        {subtitle}
      </Text>
    </Card>
  );
}
