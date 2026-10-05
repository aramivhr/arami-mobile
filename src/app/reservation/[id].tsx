import React, { useLayoutEffect, useMemo, useState } from "react";
import { Alert, View } from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { FileText, IdCard, Users } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Button, Card, Divider, Input, Label, Sheet, Text } from "@/components/ui";
import { SourceBadge, StatusBadge } from "@/components/badges";
import { RequireScreen } from "@/components/RequireScreen";
import { useApartments, useBuildings, useReservations, useSaveGuestDetails } from "@/hooks/data";
import { useMyPermissions } from "@/hooks/permissions";
import { confirmationHtml } from "@/lib/confirmation";
import { reservationNumber } from "@/lib/company";
import { money, nightsBetween, prettyDate } from "@/lib/dates";
import { useColors } from "@/lib/theme";
import type { Apartment, Building, Reservation } from "@/lib/types";

// One reservation: just the guest and stay details, and Create PDF, which asks
// for the passport / ID numbers and issues the confirmation.

export default function ReservationRoute() {
  return (
    <RequireScreen screen="reservations">
      <ReservationScreen />
    </RequireScreen>
  );
}

function ReservationScreen() {
  const c = useColors();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const resQ = useReservations();
  const { data: apartments = [] } = useApartments();
  const { data: buildings = [] } = useBuildings();
  const { data: perms } = useMyPermissions();
  const r = useMemo(() => resQ.data?.find((x) => x.id === id), [resQ.data, id]);
  const apt = r ? apartments.find((a) => a.id === r.apartment_id) : undefined;
  const bld = apt ? buildings.find((b) => b.id === apt.building_id) : undefined;

  useLayoutEffect(() => {
    navigation.setOptions({ title: r ? reservationNumber(r.id) : "Reservation" });
  }, [navigation, r?.id]);

  if (!r) {
    return (
      <Screen>
        <Text muted>{resQ.isLoading ? "Loading..." : "This reservation could not be found."}</Text>
      </Screen>
    );
  }

  const nights = nightsBetween(r.check_in, r.check_out);
  const notes = (r.notes ?? "").trim();

  return (
    <Screen onRefresh={() => resQ.refetch()} refreshing={resQ.isRefetching}>
      <Card style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <SourceBadge source={r.source || "direct"} />
          <Text weight="bold" size={18} style={{ flex: 1 }} numberOfLines={2}>
            {r.guest_name || "Guest"}
          </Text>
          <StatusBadge status={r.status} />
        </View>
        <Divider />
        <Row label="Guests" value={r.adults != null ? String(r.adults) : "—"} />
        <Row label="Children" value={String(r.children ?? 0)} />
        {!!r.infants && <Row label="Infants" value={String(r.infants)} />}
        {perms?.show_financial && <Row label="Price" value={money(Number(r.total_price ?? 0))} bold />}
        <Divider />
        <Row label="Apartment" value={apt?.name ?? "—"} />
        <Row label="Building" value={bld?.name ?? "—"} />
        <Divider />
        <Row label="Check-in" value={prettyDate(r.check_in)} />
        <Row label="Check-out" value={prettyDate(r.check_out)} />
        <Row label="Nights" value={String(nights)} />
      </Card>

      <Card style={{ padding: 16, gap: 6 }}>
        <Label style={{ marginBottom: 0 }}>Notes from the guest</Label>
        <Text muted={!notes}>{notes || "No notes"}</Text>
      </Card>

      <CreatePdf key={r.id} r={r} apt={apt} bld={bld} showFinancial={!!perms?.show_financial} showContacts={!!perms?.show_contacts} />
    </Screen>
  );

}

function CreatePdf({
  r,
  apt,
  bld,
  showFinancial,
  showContacts,
}: {
  r: Reservation;
  apt?: Apartment;
  bld?: Building;
  showFinancial: boolean;
  showContacts: boolean;
}) {
  const c = useColors();
  const reservationId = r.id;
  const [open, setOpen] = useState(false);
  const [idNumber, setIdNumber] = useState(r.guest_id_number ?? "");
  const [others, setOthers] = useState(r.additional_guests ?? "");
  const [busy, setBusy] = useState(false);
  const save = useSaveGuestDetails();

  const issue = async () => {
    if (!idNumber.trim()) {
      Alert.alert("Passport / ID number needed", "Enter the main guest's passport or ID number.");
      return;
    }
    setBusy(true);
    try {
      // Keep the numbers on the reservation, as the website does; the PDF is issued even if saving fails.
      save.mutate({ id: reservationId, guest_id_number: idNumber.trim(), additional_guests: others.trim() || null });
      const html = confirmationHtml({
        r,
        apartment: apt,
        building: bld,
        showFinancial: showFinancial,
        showContacts: showContacts,
        idNumber: idNumber.trim(),
        additionalGuests: others,
      });
      const { uri } = await Print.printToFileAsync({ html });
      setOpen(false);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: reservationNumber(reservationId), UTI: "com.adobe.pdf" });
      } else {
        Alert.alert("PDF saved", uri);
      }
    } catch (e) {
      Alert.alert("Could not create the PDF", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button title="Create PDF" variant="accent" icon={<FileText size={16} color={c.slate900} />} onPress={() => setOpen(true)} />
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Reservation confirmation"
        footer={<Button title="Issue confirmation" onPress={issue} loading={busy} icon={<FileText size={16} color={c.primaryForeground} />} />}
      >
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <IdCard size={14} color={c.mutedForeground} />
            <Label style={{ marginBottom: 0 }}>{r.guest_name || "Guest"}: passport / ID number</Label>
          </View>
          <Input value={idNumber} onChangeText={setIdNumber} placeholder="e.g. P1234567" autoCapitalize="characters" />
        </View>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Users size={14} color={c.mutedForeground} />
            <Label style={{ marginBottom: 0 }}>Other guests (name and ID, one per line)</Label>
          </View>
          <Input value={others} onChangeText={setOthers} multiline placeholder={"Jane Doe — P7654321"} style={{ minHeight: 80, textAlignVertical: "top" }} />
        </View>
      </Sheet>
    </>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text muted>{label}</Text>
      <Text weight={bold ? "semibold" : "medium"} style={{ flexShrink: 1, textAlign: "right" }}>
        {value}
      </Text>
    </View>
  );
}
