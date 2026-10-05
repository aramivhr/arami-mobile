import React, { useEffect, useMemo, useState } from "react";
import { Alert, View } from "react-native";
import { AlertTriangle } from "lucide-react-native";
import { Button, Field, Input, Select, Sheet, Text } from "@/components/ui";
import { DirectPaymentSelect, StatusBadge } from "@/components/badges";
import { RangePicker } from "@/components/RangePicker";
import { useColors } from "@/lib/theme";
import { guestCounts } from "@/lib/guests";
import {
  getOverlappingReservations,
  useAddReservation,
  useApartments,
  useBuildings,
  useReservations,
  useUpdateReservation,
} from "@/hooks/data";
import type { DirectPaymentMethod, Reservation, ReservationStatus } from "@/lib/types";

// Create or edit a reservation. Per Gevorg's rule the app only creates and
// edits DIRECT reservations; channel bookings (Airbnb, Booking.com) are
// read-only here and are managed through Channex as before.

const STATUS_OPTIONS: { value: ReservationStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "checked-in", label: "Checked In" },
  { value: "checked-out", label: "Checked Out" },
  { value: "cancelled", label: "Cancelled" },
];

interface FormState {
  apartment_id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  total_price: string;
  notes: string;
  status: ReservationStatus;
  direct_payment_method: DirectPaymentMethod;
  adults: string;
  children: string;
  infants: string;
}

const empty: FormState = {
  apartment_id: "",
  guest_name: "",
  guest_email: "",
  guest_phone: "",
  check_in: "",
  check_out: "",
  total_price: "",
  notes: "",
  status: "pending",
  direct_payment_method: "cash",
  adults: "1",
  children: "0",
  infants: "0",
};

export function ReservationForm({
  open,
  onClose,
  editing,
  preset,
  newStatus = "pending",
  showContacts,
  showFinancial,
}: {
  open: boolean;
  onClose: () => void;
  /** The reservation being edited, or null to create a new one. */
  editing: Reservation | null;
  /** Prefill for a new reservation, e.g. from a tapped calendar cell. */
  preset?: { apartment_id: string; check_in: string };
  /** The website saves new bookings as "pending" from Reservations and "confirmed" from Calendar. */
  newStatus?: ReservationStatus;
  showContacts: boolean;
  showFinancial: boolean;
}) {
  const c = useColors();
  const { data: apartments = [] } = useApartments();
  const { data: buildings = [] } = useBuildings();
  const { data: reservations = [] } = useReservations();
  const addMut = useAddReservation();
  const updateMut = useUpdateReservation();
  const [form, setForm] = useState<FormState>(empty);
  const [overlaps, setOverlaps] = useState<Reservation[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setOverlaps(null);
    if (editing) {
      setForm({
        apartment_id: editing.apartment_id,
        guest_name: editing.guest_name,
        guest_email: editing.guest_email ?? "",
        guest_phone: editing.guest_phone ?? "",
        check_in: editing.check_in,
        check_out: editing.check_out,
        total_price: String(editing.total_price ?? ""),
        notes: editing.notes ?? "",
        status: editing.status,
        direct_payment_method: (editing.direct_payment_method as DirectPaymentMethod) || "cash",
        adults: String(editing.adults ?? 1),
        children: String(editing.children ?? 0),
        infants: String(editing.infants ?? 0),
      });
    } else {
      setForm({ ...empty, apartment_id: preset?.apartment_id ?? "", check_in: preset?.check_in ?? "" });
    }
  }, [open, editing?.id, preset?.apartment_id, preset?.check_in]);

  const apartmentOptions = useMemo(
    () =>
      apartments.map((a) => {
        const b = buildings.find((bl) => bl.id === a.building_id);
        return { value: a.id, label: b ? `${a.name} — ${b.name}` : a.name };
      }),
    [apartments, buildings],
  );

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    const payload = {
      apartment_id: form.apartment_id,
      guest_name: form.guest_name,
      guest_email: form.guest_email,
      guest_phone: form.guest_phone,
      check_in: form.check_in,
      check_out: form.check_out,
      total_price: Number(form.total_price) || 0,
      source: "direct" as const,
      direct_payment_method: form.direct_payment_method,
      notes: form.notes,
    };
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, ...payload, status: form.status });
        Alert.alert("Reservation updated", `Booking for ${form.guest_name} has been modified.`);
      } else {
        // Like the website, guest counts are set when a booking is created.
        await addMut.mutateAsync({ ...payload, ...guestCounts(form), status: newStatus });
        Alert.alert("Reservation created", `Booking for ${form.guest_name} has been added.`);
      }
      setOverlaps(null);
      onClose();
    } catch (e) {
      Alert.alert(editing ? "Could not update reservation" : "Could not create reservation", (e as Error)?.message ?? "Unknown error");
    }
  };

  const submit = () => {
    const missingPhone = showContacts && !(form.guest_phone ?? "").trim();
    if (!form.apartment_id || !(form.guest_name ?? "").trim() || !form.check_in || !form.check_out || missingPhone) {
      Alert.alert("Missing fields", "Please fill in all required fields including phone number.");
      return;
    }
    const found = getOverlappingReservations(reservations, form.apartment_id, form.check_in, form.check_out, editing?.id);
    if (found.length > 0) {
      setOverlaps(found);
      return;
    }
    save();
  };

  const busy = addMut.isPending || updateMut.isPending;

  return (
    <>
      <Sheet
        open={open && !overlaps}
        onClose={onClose}
        title={editing ? "Edit Reservation" : "New Direct Reservation"}
        footer={<Button title={editing ? "Save Changes" : "Create Reservation"} onPress={submit} loading={busy} />}
      >
        <Field label="Apartment *">
          <Select
            value={form.apartment_id}
            options={apartmentOptions}
            onChange={(v) => set({ apartment_id: v })}
            placeholder="Select apartment"
          />
        </Field>
        <Field label="Guest Name *">
          <Input value={form.guest_name} onChangeText={(v) => set({ guest_name: v })} autoCapitalize="words" />
        </Field>
        {showContacts && (
          <>
            <Field label="Phone Number *">
              <Input value={form.guest_phone} onChangeText={(v) => set({ guest_phone: v })} keyboardType="phone-pad" placeholder="+971…" />
            </Field>
            <Field label="Email">
              <Input
                value={form.guest_email}
                onChangeText={(v) => set({ guest_email: v })}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </Field>
          </>
        )}
        <RangePicker
          label="Check-in – Check-out *"
          start={form.check_in}
          end={form.check_out}
          onChange={(s, e) => set({ check_in: s, check_out: e })}
        />
        {showFinancial && (
          <Field label="Total Price (AED)">
            <Input value={form.total_price} onChangeText={(v) => set({ total_price: v })} keyboardType="decimal-pad" />
          </Field>
        )}
        {editing && (
          <Field label="Status">
            <Select value={form.status} options={STATUS_OPTIONS} onChange={(v) => set({ status: v })} />
          </Field>
        )}
        {!editing && (
          <Field label="Number of guests *">
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(
                [
                  ["adults", "Adults"],
                  ["children", "Children"],
                  ["infants", "Infants"],
                ] as const
              ).map(([k, label]) => (
                <View key={k} style={{ flex: 1, gap: 4 }}>
                  <Text muted size={12}>
                    {label}
                  </Text>
                  <Input value={form[k]} onChangeText={(v) => set({ [k]: v.replace(/[^0-9]/g, "") })} keyboardType="number-pad" />
                </View>
              ))}
            </View>
          </Field>
        )}
        <Field label="Notes">
          <Input value={form.notes} onChangeText={(v) => set({ notes: v })} />
        </Field>
        <Field label="Payment Method *">
          <DirectPaymentSelect value={form.direct_payment_method} onChange={(v) => set({ direct_payment_method: v })} />
        </Field>
      </Sheet>

      <Sheet
        open={open && !!overlaps}
        onClose={() => setOverlaps(null)}
        title={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={20} color={c.warning} />
            <Text weight="semibold" size={17} style={{ color: c.warning }}>
              Overlapping Reservation
            </Text>
          </View>
        }
        footer={
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={() => setOverlaps(null)} />
            <Button title="Proceed Anyway" variant="destructive" style={{ flex: 1 }} onPress={save} loading={busy} />
          </View>
        }
      >
        <Text muted>This reservation overlaps with existing booking(s):</Text>
        {(overlaps ?? []).map((o) => (
          <View
            key={o.id}
            style={{ padding: 12, borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.muted, gap: 6 }}
          >
            <Text weight="medium">{o.guest_name}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text muted size={13}>
                {o.check_in} → {o.check_out}
              </Text>
              <StatusBadge status={o.status} />
            </View>
          </View>
        ))}
        <Text weight="medium">Do you still want to proceed?</Text>
      </Sheet>
    </>
  );
}
