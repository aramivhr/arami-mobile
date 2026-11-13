import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Camera, ImagePlus, Mail, Pencil, X } from "lucide-react-native";
import { Button, Field, Input, Select, Sheet, Text } from "@/components/ui";
import { RangePicker } from "@/components/RangePicker";
import { photoAttachment, useSendBuildingEmail } from "@/hooks/buildingEmail";
import {
  BUILDING_EMAIL_PURPOSES,
  CONTACT,
  PURPOSE_LABEL,
  buildBuildingEmail,
  isStayPurpose,
  missingFields,
  newRequestId,
  type BuildingEmailPurpose,
} from "@/lib/buildingEmail";
import { todayISO } from "@/lib/dates";
import { useColors } from "@/lib/theme";
import type { Apartment, Building, Reservation } from "@/lib/types";

// "Email building", as on the website (rent-halo-system
// src/components/BuildingEmailStep.tsx): tells a building's management about a
// guest check-in, a change to a stay, or a cleaning, maintenance or inspection
// visit, with passport or ID photos attached. Unit, guest and dates are filled
// in from the reservation, so usually only the photos are left to add.

type Photo = { uri: string; width: number; height: number };

const MAX_PHOTOS = 10;
const PURPOSE_OPTIONS = BUILDING_EMAIL_PURPOSES.map((p) => ({ value: p, label: PURPOSE_LABEL[p] }));

/** The address the website sends to: the unit's own building email, else the building's. */
export function buildingEmailTo(apartment?: Apartment | null, building?: Building | null) {
  return (apartment?.building_email || building?.email || "").trim();
}

export function BuildingEmailSheet({
  open,
  onClose,
  apartment,
  building,
  reservation,
}: {
  open: boolean;
  onClose: () => void;
  apartment: Apartment;
  building: Building;
  /** Fills in the guest and dates for a check-in or modification. */
  reservation?: Reservation | null;
}) {
  const c = useColors();
  const send = useSendBuildingEmail();
  const [requestId, setRequestId] = useState(newRequestId);
  const [purpose, setPurpose] = useState<BuildingEmailPurpose>(reservation ? "check_in" : "cleaning");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [visitDate, setVisitDate] = useState(todayISO());
  const [visitors, setVisitors] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [editing, setEditing] = useState(false);

  // A fresh form (and a fresh request id) each time it opens.
  useEffect(() => {
    if (!open) return;
    setRequestId(newRequestId());
    setPurpose(reservation ? "check_in" : "cleaning");
    setGuestName(reservation?.guest_name ?? "");
    setGuestPhone(reservation?.guest_phone ?? "");
    setCheckIn(reservation?.check_in ?? "");
    setCheckOut(reservation?.check_out ?? "");
    setVisitDate(todayISO());
    setVisitors("");
    setNotes("");
    setPhotos([]);
    setEditing(false);
  }, [open, reservation?.id, apartment.id]);

  const to = buildingEmailTo(apartment, building);
  const stay = isStayPurpose(purpose);
  const input = {
    purpose,
    buildingName: building.name,
    unit: apartment.name,
    guestName,
    guestPhone,
    checkIn,
    checkOut,
    visitDate,
    visitors,
    notes,
    idCount: photos.length,
  };
  const missing = missingFields(input);
  // Anything but the photos missing (e.g. no phone on the booking) opens the details.
  const showDetails = editing || missing.some((m) => m !== "passport or ID pictures");
  const email = useMemo(() => (missing.length ? null : buildBuildingEmail(input)), [JSON.stringify(input)]); // eslint-disable-line react-hooks/exhaustive-deps

  const addPhotos = async (source: "camera" | "library") => {
    try {
      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return Alert.alert("Camera access is off", "Allow camera access for Arami Portal in Settings.");
      }
      const left = MAX_PHOTOS - photos.length;
      const res =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9, allowsMultipleSelection: true, selectionLimit: left });
      if (res.canceled || !res.assets?.length) return;
      const picked = res.assets.map((a) => ({ uri: a.uri, width: a.width, height: a.height }));
      setPhotos((prev) => [...prev, ...picked].slice(0, MAX_PHOTOS));
    } catch (e) {
      Alert.alert("Couldn't add the photo", (e as Error).message);
    }
  };

  const submit = async () => {
    try {
      const attachments = await Promise.all(photos.map((p, i) => photoAttachment(p.uri, p.width, p.height, i)));
      const res = await send.mutateAsync({
        apartment_id: apartment.id,
        reservation_id: reservation?.id,
        purpose,
        ...(stay
          ? { guest_name: guestName, guest_phone: guestPhone, check_in: checkIn, check_out: checkOut }
          : { visit_date: visitDate, visitors: visitors || undefined }),
        notes: notes || undefined,
        attachments,
        request_id: requestId,
      });
      Alert.alert("Email sent", `Sent to ${res.sent_to}`);
      onClose();
    } catch (e) {
      Alert.alert("Email not sent", (e as Error).message);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        <View>
          <Text weight="semibold" size={17}>
            Email building
          </Text>
          <Text muted size={12}>
            Unit {apartment.name} · {building.name}
          </Text>
        </View>
      }
      footer={
        <Button
          title={send.isPending ? "Sending…" : "Send to building"}
          icon={<Mail size={16} color={c.primaryForeground} />}
          disabled={!email || !to}
          loading={send.isPending}
          onPress={() => void submit()}
        />
      }
    >
      {!to && (
        <View style={{ borderWidth: 1, borderColor: c.destructive, borderRadius: 8, padding: 10 }}>
          <Text size={13}>Unit {apartment.name} has no building email yet. Add it on the website's Buildings page first.</Text>
        </View>
      )}

      <Field label="Purpose">
        <Select value={purpose} options={PURPOSE_OPTIONS} onChange={setPurpose} title="Purpose" />
      </Field>

      {!showDetails && (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: c.muted, borderRadius: 8, padding: 10 }}>
          <Text size={12} style={{ flex: 1 }}>
            {stay ? `${guestName} · ${guestPhone} · ${checkIn} to ${checkOut}` : `${visitDate}${visitors ? ` · ${visitors}` : ""}`}
          </Text>
          <Pressable onPress={() => setEditing(true)} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Pencil size={12} color={c.mutedForeground} />
            <Text muted size={12}>
              Edit details
            </Text>
          </Pressable>
        </View>
      )}

      {showDetails &&
        (stay ? (
          <>
            <Field label="Guest name">
              <Input value={guestName} onChangeText={setGuestName} autoCapitalize="words" />
            </Field>
            <Field label="Guest phone">
              <Input value={guestPhone} onChangeText={setGuestPhone} keyboardType="phone-pad" placeholder="+971…" />
            </Field>
            <RangePicker
              label="Dates of stay"
              start={checkIn}
              end={checkOut}
              onChange={(a, b) => {
                setCheckIn(a);
                setCheckOut(b);
              }}
            />
          </>
        ) : (
          <>
            <Field label="Date (YYYY-MM-DD)">
              <Input value={visitDate} onChangeText={setVisitDate} placeholder="2026-11-06" autoCapitalize="none" />
            </Field>
            <Field label="Visitors (optional)">
              <Input value={visitors} onChangeText={setVisitors} placeholder="e.g. cleaners' names" />
            </Field>
          </>
        ))}

      {showDetails && (
        <Field label="Notes (optional)">
          <Input
            value={notes}
            onChangeText={setNotes}
            multiline
            style={{ minHeight: 60, textAlignVertical: "top" }}
            placeholder={purpose === "modification" ? "What changed, e.g. check-out moved from 12 Oct" : "e.g. arriving around 11am"}
          />
        </Field>
      )}

      <Field label="Passport or ID photos">
        {photos.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {photos.map((p, i) => (
              <View key={`${p.uri}-${i}`}>
                <Image source={{ uri: p.uri }} style={{ width: 64, height: 64, borderRadius: 6, backgroundColor: c.muted }} />
                <Pressable
                  accessibilityLabel={`Remove photo ${i + 1}`}
                  onPress={() => setPhotos(photos.filter((_, j) => j !== i))}
                  hitSlop={6}
                  style={{ position: "absolute", top: -6, right: -6, backgroundColor: c.card, borderRadius: 10, borderWidth: 1, borderColor: c.border, padding: 2 }}
                >
                  <X size={12} color={c.foreground} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
        {photos.length < MAX_PHOTOS && (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button title="Take photo" variant="outline" size="sm" style={{ flex: 1 }} icon={<Camera size={14} color={c.foreground} />} onPress={() => addPhotos("camera")} />
            <Button title="Choose photos" variant="outline" size="sm" style={{ flex: 1 }} icon={<ImagePlus size={14} color={c.foreground} />} onPress={() => addPhotos("library")} />
          </View>
        )}
      </Field>

      {email ? (
        <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10, gap: 6 }}>
          <PreviewRow label="To" value={to || "—"} />
          <PreviewRow label="From" value={CONTACT.email} />
          <PreviewRow label="Subject" value={email.subject} />
          <View style={{ backgroundColor: c.muted, borderRadius: 6, padding: 8 }}>
            <Text size={12}>{email.text}</Text>
          </View>
        </View>
      ) : (
        <Text muted size={12}>
          Still needed: {missing.join(", ")}.
        </Text>
      )}
    </Sheet>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <Text muted size={13} style={{ width: 58 }}>
        {label}
      </Text>
      <Text weight="medium" size={13} style={{ flex: 1 }}>
        {value}
      </Text>
    </View>
  );
}
