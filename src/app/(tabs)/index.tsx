import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { ArrowRight, Building2, CalendarDays, Home, LogIn, LogOut } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Card, Empty, Divider, PageHeader, Sheet, Text } from "@/components/ui";
import { StatusBadge, withAlpha } from "@/components/badges";
import { useApartments, useBlockedDates, useBuildings, useReservations } from "@/hooks/data";
import { useMyPermissions } from "@/hooks/permissions";
import { addDays, toISO } from "@/lib/dates";
import { useColors } from "@/lib/theme";
import type { Reservation } from "@/lib/types";

// Same numbers and lists as the website's Dashboard page.

type ActivityType = "today-checkin" | "today-checkout" | "tomorrow-checkin" | "tomorrow-checkout";

const TITLES: Record<ActivityType, string> = {
  "today-checkin": "Today's Check-ins",
  "today-checkout": "Today's Check-outs",
  "tomorrow-checkin": "Tomorrow's Check-ins",
  "tomorrow-checkout": "Tomorrow's Check-outs",
};

export default function Dashboard() {
  const c = useColors();
  const buildingsQ = useBuildings();
  const apartmentsQ = useApartments();
  const reservationsQ = useReservations();
  const blockedQ = useBlockedDates();
  const { data: perms } = useMyPermissions();
  const buildings = buildingsQ.data ?? [];
  const apartments = apartmentsQ.data ?? [];
  const reservations = reservationsQ.data ?? [];
  const blockedDates = blockedQ.data ?? [];
  const [active, setActive] = useState<ActivityType | null>(null);
  const showFinancial = perms?.show_financial ?? false;
  const showContacts = perms?.show_contacts ?? false;

  const today = toISO(new Date());
  const tomorrow = toISO(addDays(new Date(), 1));

  const activeApartments = useMemo(() => {
    const inactive = new Set(
      blockedDates
        .filter((b) => b.reason === "Out of management" && b.start_date <= today && b.end_date >= today)
        .map((b) => b.apartment_id),
    );
    return apartments.filter((a) => !inactive.has(a.id));
  }, [apartments, blockedDates, today]);

  const activeBookings = reservations.filter((r) => r.status === "confirmed" || r.status === "checked-in").length;

  const activity = useMemo(() => {
    const f = (date: string, field: "check_in" | "check_out") => reservations.filter((r) => r[field] === date && r.status !== "cancelled");
    return {
      "today-checkin": f(today, "check_in"),
      "today-checkout": f(today, "check_out"),
      "tomorrow-checkin": f(tomorrow, "check_in"),
      "tomorrow-checkout": f(tomorrow, "check_out"),
    } as Record<ActivityType, Reservation[]>;
  }, [reservations, today, tomorrow]);

  const upcoming = useMemo(
    () =>
      reservations
        .filter((r) => r.status === "confirmed" || r.status === "pending")
        .sort((a, b) => a.check_in.localeCompare(b.check_in))
        .slice(0, 5),
    [reservations],
  );

  const available = useMemo(
    () =>
      activeApartments.filter(
        (apt) => !reservations.some((r) => r.apartment_id === apt.id && today >= r.check_in && today < r.check_out && r.status !== "cancelled"),
      ),
    [activeApartments, reservations, today],
  );

  const aptInfo = (id: string) => {
    const apt = apartments.find((a) => a.id === id);
    const bld = apt ? buildings.find((b) => b.id === apt.building_id) : null;
    return { apt, bld };
  };

  const refreshing = reservationsQ.isRefetching;
  const refresh = () => {
    buildingsQ.refetch();
    apartmentsQ.refetch();
    reservationsQ.refetch();
    blockedQ.refetch();
  };

  const activityCards: { key: ActivityType; label: string; Icon: typeof LogIn; color: string }[] = [
    { key: "today-checkin", label: "Today's Check-ins", Icon: LogIn, color: "#059669" },
    { key: "today-checkout", label: "Today's Check-outs", Icon: LogOut, color: "#ea580c" },
    { key: "tomorrow-checkin", label: "Tomorrow's Check-ins", Icon: LogIn, color: "#2563eb" },
    { key: "tomorrow-checkout", label: "Tomorrow's Check-outs", Icon: LogOut, color: "#e11d48" },
  ];

  const ReservationRow = ({ r }: { r: Reservation }) => {
    const { apt, bld } = aptInfo(r.apartment_id);
    return (
      <View style={{ paddingHorizontal: 14, paddingVertical: 12, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Text weight="medium" style={{ flex: 1 }} numberOfLines={1}>
            {r.guest_name}
          </Text>
          <StatusBadge status={r.status} />
        </View>
        <Text muted size={12}>
          {apt?.name} · {bld?.name}
          {showContacts && r.guest_phone ? ` · ${r.guest_phone}` : ""}
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text size={12}>
            {r.check_in} → {r.check_out}
          </Text>
          {showFinancial && (
            <Text size={12} weight="medium">
              AED {r.total_price}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <PageHeader title="Dashboard" subtitle="Overview of your property portfolio" />

      <View style={{ flexDirection: "row", gap: 8 }}>
        <StatCard title="Buildings" value={buildings.length} subtitle={`${activeApartments.length} apartments`} Icon={Building2} />
        <StatCard title="Active Bookings" value={activeBookings} Icon={CalendarDays} />
        <StatCard title="Available Units" value={available.length} Icon={Home} />
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {activityCards.map(({ key, label, Icon, color }) => (
          <Card key={key} onPress={() => setActive(key)} style={{ width: "48.8%", padding: 12, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
              <Text muted weight="medium" size={11} style={{ flex: 1 }}>
                {label}
              </Text>
              <View style={{ width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: withAlpha(color, 0.15) }}>
                <Icon size={15} color={color} />
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text weight="bold" size={20}>
                {activity[key].length}
              </Text>
              <ArrowRight size={16} color={c.mutedForeground} />
            </View>
          </Card>
        ))}
      </View>

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 14 }}>
          <Home size={18} color={c.accent} />
          <Text weight="semibold" size={16} style={{ flex: 1 }}>
            Today's Available Units
          </Text>
          <Text weight="bold" style={{ color: c.accent }}>
            {available.length}
          </Text>
        </View>
        <Divider />
        {available.length > 0 ? (
          available.map((apt, i) => {
            const bld = buildings.find((b) => b.id === apt.building_id);
            return (
              <View key={apt.id}>
                {i > 0 && <Divider />}
                <View style={{ paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View>
                    <Text weight="medium">{apt.name}</Text>
                    <Text muted size={12}>
                      {bld?.name}
                    </Text>
                  </View>
                  <Text muted size={12}>
                    {apt.type} · {apt.max_guests} guests
                  </Text>
                </View>
              </View>
            );
          })
        ) : (
          <Empty>All units are occupied today</Empty>
        )}
      </Card>

      <Card>
        <Text weight="semibold" size={16} style={{ padding: 14 }}>
          Upcoming Reservations
        </Text>
        <Divider />
        {upcoming.map((r, i) => (
          <View key={r.id}>
            {i > 0 && <Divider />}
            <ReservationRow r={r} />
          </View>
        ))}
        {upcoming.length === 0 && <Empty>No upcoming reservations</Empty>}
      </Card>

      <Sheet open={!!active} onClose={() => setActive(null)} title={active ? TITLES[active] : ""}>
        <Card>
          {active &&
            activity[active].map((r, i) => (
              <View key={r.id}>
                {i > 0 && <Divider />}
                <ReservationRow r={r} />
              </View>
            ))}
          {active && activity[active].length === 0 && <Empty>No reservations</Empty>}
        </Card>
      </Sheet>
    </Screen>
  );
}

function StatCard({ title, value, subtitle, Icon }: { title: string; value: number; subtitle?: string; Icon: typeof Home }) {
  const c = useColors();
  return (
    <Card style={{ flex: 1, padding: 10, gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
        <Text muted weight="medium" size={10} style={{ flex: 1 }} numberOfLines={2}>
          {title}
        </Text>
        <View style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: withAlpha(c.accent, 0.15), alignItems: "center", justifyContent: "center" }}>
          <Icon size={13} color={c.accent} />
        </View>
      </View>
      <Text weight="bold" size={20}>
        {value}
      </Text>
      {!!subtitle && (
        <Text muted size={10}>
          {subtitle}
        </Text>
      )}
    </Card>
  );
}
