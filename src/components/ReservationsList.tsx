import React, { memo, useCallback, useMemo, useState } from "react";
import { Alert, FlatList, RefreshControl, Share, View } from "react-native";
import { router } from "expo-router";
import { Download, Pencil, Plus, Search, Trash2 } from "lucide-react-native";
import { Button, Card, Empty, Input, PageHeader, Select, Text } from "@/components/ui";
import { SourceBadge, StatusBadge, directPaymentLabel, withAlpha } from "@/components/badges";
import { ReservationForm } from "@/components/ReservationForm";
import { useApartments, useBuildings, useDeleteReservation, useReservations } from "@/hooks/data";
import { useMyPermissions } from "@/hooks/permissions";
import { useColors } from "@/lib/theme";
import type { Apartment, Building, Reservation } from "@/lib/types";

// The website's Reservations page: search, the same filters and the card list it
// shows on phones. Tapping a card opens the reservation page. Only direct
// reservations can be created, edited or deleted from the app. The list is
// virtualised so hundreds of reservations stay fast.

const openReservation = (id: string) => router.push({ pathname: "/reservation/[id]", params: { id } });

export function ReservationsList() {
  const c = useColors();
  const reservationsQ = useReservations();
  const reservations = reservationsQ.data ?? [];
  const { data: apartments = [] } = useApartments();
  const { data: buildings = [] } = useBuildings();
  const { data: perms } = useMyPermissions();
  const deleteMut = useDeleteReservation();
  const canAdd = !!(perms?.can_add_reservations || perms?.isAdmin);
  const canEditAny = !!(perms?.can_edit_reservations || perms?.isAdmin);
  const showFinancial = perms?.show_financial ?? false;
  const showContacts = perms?.show_contacts ?? false;

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [directPayment, setDirectPayment] = useState("all");
  const [manage, setManage] = useState<"all" | "sublease" | "revenue_share">("all");
  const [apartment, setApartment] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Reservation | null>(null);

  const aptById = useMemo(() => new Map(apartments.map((a) => [a.id, a])), [apartments]);
  const bldById = useMemo(() => new Map(buildings.map((b) => [b.id, b])), [buildings]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return reservations.filter((r) => {
      const apt = aptById.get(r.apartment_id);
      return (
        ((r.guest_name ?? "").toLowerCase().includes(q) || (r.guest_email ?? "").toLowerCase().includes(q)) &&
        (status === "all" || r.status === status) &&
        (source === "all" || r.source === source) &&
        (source !== "direct" || directPayment === "all" || r.direct_payment_method === directPayment) &&
        (manage === "all" || apt?.manage_type === manage) &&
        (apartment === "all" || r.apartment_id === apartment)
      );
    });
  }, [reservations, aptById, search, status, source, directPayment, manage, apartment]);

  const info = (r: Reservation) => {
    const apt = aptById.get(r.apartment_id);
    const bld = apt ? bldById.get(apt.building_id) : undefined;
    return { apt, bld };
  };

  const confirmDelete = useCallback((r: Reservation) =>
    Alert.alert("Delete Reservation", `Are you sure you want to delete the reservation for ${r.guest_name}? This action cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMut.mutateAsync(r.id).catch((e) => Alert.alert("Could not delete", e.message)) },
    ]), [deleteMut]);
  const startEdit = useCallback((r: Reservation) => {
    setEditing(r);
    setFormOpen(true);
  }, []);

  const exportCsv = () => {
    const headers = [
      "Guest name",
      ...(showContacts ? ["Email", "Phone"] : []),
      "Apartment",
      "Building",
      "Check-in",
      "Check-out",
      "Status",
      "Source",
      "Payment method",
      ...(showFinancial ? ["Total price (AED)"] : []),
      "Notes",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = filtered.map((r) => {
      const { apt, bld } = info(r);
      return [
        r.guest_name,
        ...(showContacts ? [r.guest_email, r.guest_phone] : []),
        apt?.name ?? "",
        bld?.name ?? "",
        r.check_in,
        r.check_out,
        r.status,
        r.source ?? "direct",
        r.source === "direct" ? directPaymentLabel(r.direct_payment_method || "cash") : "",
        ...(showFinancial ? [r.total_price] : []),
        r.notes ?? "",
      ];
    });
    Share.share({ message: [headers, ...rows].map((row) => row.map(esc).join(",")).join("\n"), title: "Reservations CSV" });
  };

  const aptOptions = [
    { value: "all", label: "All Listings" },
    ...apartments
      .filter((a) => manage === "all" || a.manage_type === manage)
      .map((a) => {
        const b = buildings.find((x) => x.id === a.building_id);
        return { value: a.id, label: b ? `${b.name} – ${a.name}` : a.name };
      }),
  ];

  const header = (
    <View style={{ gap: 16, paddingBottom: 8 }}>
      <PageHeader
        title="Reservations"
        subtitle="Manage all bookings"
        right={
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button variant="outline" size="sm" icon={<Download size={16} color={c.foreground} />} onPress={exportCsv} disabled={filtered.length === 0} />
            {canAdd && (
              <Button
                size="sm"
                title="New"
                icon={<Plus size={16} color={c.primaryForeground} />}
                onPress={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              />
            )}
          </View>
        }
      />

      <View style={{ gap: 8 }}>
        <View style={{ justifyContent: "center" }}>
          <View style={{ position: "absolute", left: 12, zIndex: 1 }}>
            <Search size={16} color={c.mutedForeground} />
          </View>
          <Input placeholder="Search guests..." value={search} onChangeText={setSearch} style={{ paddingLeft: 36, minHeight: 40 }} />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Select
            style={{ flex: 1 }}
            value={status}
            onChange={setStatus}
            title="Status"
            options={[
              { value: "all", label: "All Status" },
              { value: "confirmed", label: "Confirmed" },
              { value: "pending", label: "Pending" },
              { value: "checked-in", label: "Checked In" },
              { value: "checked-out", label: "Checked Out" },
              { value: "cancelled", label: "Cancelled" },
            ]}
          />
          <Select
            style={{ flex: 1 }}
            value={source}
            onChange={(v) => {
              setSource(v);
              setDirectPayment("all");
            }}
            title="Source"
            options={[
              { value: "all", label: "All Sources" },
              { value: "booking", label: "Booking.com" },
              { value: "airbnb", label: "Airbnb" },
              { value: "direct", label: "Direct" },
            ]}
          />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Select
            style={{ flex: 1 }}
            value={manage}
            onChange={setManage}
            title="Unit type"
            options={[
              { value: "all", label: "All Unit Types" },
              { value: "sublease", label: "Rented / Sublease" },
              { value: "revenue_share", label: "Revenue Sharing" },
            ]}
          />
          <Select style={{ flex: 1 }} value={apartment} onChange={setApartment} title="Listing" options={aptOptions} />
        </View>
        {source === "direct" && (
          <Select
            value={directPayment}
            onChange={setDirectPayment}
            title="Payment method"
            options={[
              { value: "all", label: "All Direct Methods" },
              { value: "payment_link", label: "Payment Link" },
              { value: "cash", label: "Cash" },
              { value: "bank_transfer", label: "Bank Transfer" },
            ]}
          />
        )}
      </View>

    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <FlatList
        data={filtered}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 14, gap: 8, width: "100%", maxWidth: 900, alignSelf: "center" }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        windowSize={7}
        removeClippedSubviews
        refreshControl={<RefreshControl refreshing={reservationsQ.isRefetching} onRefresh={() => reservationsQ.refetch()} tintColor={c.accent} />}
        ListEmptyComponent={<Empty>{reservationsQ.isLoading ? "Loading..." : "No reservations found"}</Empty>}
        renderItem={({ item: r }) => {
          const { apt, bld } = info(r);
          return (
            <ReservationCard
              r={r}
              apt={apt}
              bld={bld}
              showFinancial={showFinancial}
              showContacts={showContacts}
              canEdit={canEditAny && (r.source ?? "direct") === "direct"}
              onEdit={startEdit}
              onDelete={confirmDelete}
            />
          );
        }}
      />

      <ReservationForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        editing={editing}
        newStatus="pending"
        showContacts={showContacts}
        showFinancial={showFinancial}
      />
    </View>
  );
}

const ReservationCard = memo(function ReservationCard({
  r,
  apt,
  bld,
  showFinancial,
  showContacts,
  canEdit,
  onEdit,
  onDelete,
}: {
  r: Reservation;
  apt?: Apartment;
  bld?: Building;
  showFinancial: boolean;
  showContacts: boolean;
  canEdit: boolean;
  onEdit: (r: Reservation) => void;
  onDelete: (r: Reservation) => void;
}) {
  const c = useColors();
  return (
    <Card onPress={() => openReservation(r.id)} style={{ padding: 12, gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <SourceBadge source={r.source || "direct"} size="sm" />
          <View style={{ flex: 1 }}>
            <Text weight="medium" numberOfLines={1}>
              {r.guest_name || "Guest"}
            </Text>
            {r.source === "direct" && !!r.direct_payment_method && (
              <Text muted size={10}>
                {directPaymentLabel(r.direct_payment_method)}
              </Text>
            )}
            {showContacts && !!r.guest_phone && (
              <Text muted size={10}>
                {r.guest_phone}
              </Text>
            )}
          </View>
        </View>
        <StatusBadge status={r.status} />
      </View>
      <Text muted size={12}>
        {apt?.name} · {bld?.name}
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text size={12}>
          {r.check_in} → {r.check_out}
        </Text>
        {showFinancial && (
          <Text size={12} weight="semibold">
            AED {r.total_price}
          </Text>
        )}
      </View>
      {canEdit && (
        <View style={{ flexDirection: "row", gap: 4, paddingTop: 2 }}>
          <Button variant="ghost" size="sm" title="Edit" icon={<Pencil size={13} color={c.foreground} />} style={{ flex: 1 }} onPress={() => onEdit(r)} />
          <Button variant="ghost" size="sm" title="Delete" icon={<Trash2 size={13} color={c.destructive} />} style={{ flex: 1 }} onPress={() => onDelete(r)} />
        </View>
      )}
    </Card>
  );
});
