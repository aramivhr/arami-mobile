import React, { useEffect, useState } from "react";
import { Alert, Linking, Pressable, View } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { CalendarDays, IdCard, MapPin, Moon, Pencil, Phone, Share2, Trash2, User, Users, Globe } from "lucide-react-native";
import { Button, Input, Label, Sheet, Text } from "@/components/ui";
import { SOURCE_LABEL, SourceBadge, StatusBadge, directPaymentLabel } from "@/components/badges";
import { useColors } from "@/lib/theme";
import { money, nightsBetween, prettyDate } from "@/lib/dates";
import { COMPANY_ADDRESS, COMPANY_NAME, COMPANY_PHONE, COMPANY_WEBSITE, reservationNumber } from "@/lib/company";
import { useDeleteReservation, useSaveGuestDetails } from "@/hooks/data";
import type { Apartment, Building, Reservation } from "@/lib/types";

// The reservation confirmation, matching the website's ConfirmationDialog:
// guest, stay and payment cards, passport/ID capture, and a PDF to share.

export function ReservationDetail({
  reservation,
  apartment,
  building,
  showFinancial,
  showContacts,
  canEdit,
  onEdit,
  onClose,
}: {
  reservation: Reservation | null;
  apartment?: Apartment | null;
  building?: Building | null;
  showFinancial: boolean;
  showContacts: boolean;
  /** Edit and delete; only offered for direct reservations. */
  canEdit: boolean;
  onEdit: (r: Reservation) => void;
  onClose: () => void;
}) {
  const c = useColors();
  const [paidInput, setPaidInput] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [additionalGuests, setAdditionalGuests] = useState("");
  const saveMut = useSaveGuestDetails();
  const deleteMut = useDeleteReservation();

  useEffect(() => {
    if (reservation) {
      setPaidInput("");
      setIdNumber(reservation.guest_id_number ?? "");
      setAdditionalGuests(reservation.additional_guests ?? "");
    }
  }, [reservation?.id]);

  if (!reservation) return null;
  const r = reservation;
  const isDirect = (r.source ?? "direct") === "direct";
  const total = Number(r.total_price ?? 0);
  const paid = isDirect ? Math.min(Number(paidInput) || 0, total) : total;
  const balance = Math.max(0, total - paid);
  const nights = nightsBetween(r.check_in, r.check_out);
  const guestParts = [
    r.adults != null ? `${r.adults} ${r.adults === 1 ? "adult" : "adults"}` : null,
    r.children != null && r.children > 0 ? `${r.children} ${r.children === 1 ? "child" : "children"}` : null,
    r.infants != null && r.infants > 0 ? `${r.infants} ${r.infants === 1 ? "infant" : "infants"}` : null,
  ].filter(Boolean);

  const saveGuestDetails = async () => {
    try {
      await saveMut.mutateAsync({ id: r.id, guest_id_number: idNumber || null, additional_guests: additionalGuests || null });
      Alert.alert("Guest details saved");
    } catch {
      Alert.alert("Could not save guest details");
    }
  };

  const confirmDelete = () =>
    Alert.alert("Delete Reservation", `Are you sure you want to delete the reservation for ${r.guest_name}? This action cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteMut.mutateAsync(r.id);
            onClose();
          } catch (e) {
            Alert.alert("Could not delete reservation", (e as Error).message);
          }
        },
      },
    ]);

  const sharePdf = async () => {
    try {
      const html = confirmationHtml({
        r,
        apartment,
        building,
        showFinancial,
        showContacts,
        idNumber,
        additionalGuests,
        nights,
        paid,
        balance,
        total,
      });
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: reservationNumber(r.id), UTI: "com.adobe.pdf" });
      } else {
        Alert.alert("PDF saved", uri);
      }
    } catch (e) {
      Alert.alert("Could not create the PDF", (e as Error).message);
    }
  };

  const box = { borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 10, padding: 14 };
  const sectionTitle = (icon: React.ReactNode, title: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
      {icon}
      <Text muted weight="semibold" size={11} style={{ letterSpacing: 1, textTransform: "uppercase" }}>
        {title}
      </Text>
    </View>
  );
  const iconProps = { size: 14, color: c.mutedForeground };

  return (
    <Sheet
      open={!!reservation}
      onClose={onClose}
      title={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text weight="semibold" size={15}>
              Reservation Confirmation
            </Text>
            <Text size={12} style={{ color: c.amber500, fontFamily: "Courier" }}>
              {reservationNumber(r.id)}
            </Text>
          </View>
          <StatusBadge status={r.status} />
        </View>
      }
      footer={
        <View style={{ gap: 8 }}>
          {canEdit && (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button title="Edit" icon={<Pencil size={16} color={c.primaryForeground} />} style={{ flex: 1 }} onPress={() => onEdit(r)} />
              <Button
                title="Delete"
                variant="destructive"
                icon={<Trash2 size={16} color="#fff" />}
                style={{ flex: 1 }}
                onPress={confirmDelete}
                loading={deleteMut.isPending}
              />
            </View>
          )}
          <Button title="Share PDF" variant="accent" icon={<Share2 size={16} color={c.slate900} />} onPress={sharePdf} />
        </View>
      }
    >
      <View style={box}>
        {sectionTitle(<User {...iconProps} />, "Guest")}
        <Text weight="semibold" size={16}>
          {r.guest_name}
        </Text>
        {showContacts && (
          <Text muted size={12} style={{ marginTop: 2 }}>
            {r.guest_phone}
            {r.guest_email ? ` · ${r.guest_email}` : ""}
          </Text>
        )}
        {guestParts.length > 0 && (
          <Text muted size={12} style={{ marginTop: 2 }}>
            {guestParts.join(", ")}
            {r.guest_ages?.length ? ` (ages: ${r.guest_ages.join(", ")})` : ""}
          </Text>
        )}
        <View style={{ marginTop: 12, gap: 12 }}>
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <IdCard {...iconProps} />
              <Label style={{ marginBottom: 0 }}>Passport / ID number</Label>
            </View>
            <Input value={idNumber} onChangeText={setIdNumber} placeholder="e.g. P1234567" style={{ marginTop: 6 }} />
          </View>
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Users {...iconProps} />
              <Label style={{ marginBottom: 0 }}>Additional guests (name + ID, one per line)</Label>
            </View>
            <Input
              value={additionalGuests}
              onChangeText={setAdditionalGuests}
              multiline
              numberOfLines={3}
              placeholder={"Jane Doe — P7654321\nJohn Doe — 784-1990-..."}
              style={{ marginTop: 6, minHeight: 80 }}
            />
          </View>
          <Button title="Save guest details" variant="secondary" size="sm" onPress={saveGuestDetails} loading={saveMut.isPending} />
        </View>
      </View>

      <View style={box}>
        {sectionTitle(<MapPin {...iconProps} />, "Apartment")}
        <Text weight="semibold">
          {apartment?.name}
          {building ? ` — ${building.name}` : ""}
        </Text>
        {!!building?.address && (
          <Text muted size={12}>
            {building.address}
          </Text>
        )}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          {[
            ["Check-in", prettyDate(r.check_in)],
            ["Check-out", prettyDate(r.check_out)],
            ["Nights", String(nights)],
          ].map(([k, v]) => (
            <View key={k} style={{ flex: 1, backgroundColor: c.muted, borderRadius: 8, padding: 8, alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                {k === "Nights" && <Moon size={11} color={c.mutedForeground} />}
                <Text muted size={10} style={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
                  {k}
                </Text>
              </View>
              <Text weight="medium" size={12}>
                {v}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={box}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          {sectionTitle(<CalendarDays {...iconProps} />, "Booking & payment")}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <SourceBadge source={r.source || "direct"} size="sm" />
            <Text size={12}>{SOURCE_LABEL[r.source ?? "direct"]}</Text>
          </View>
        </View>
        {showFinancial ? (
          <View style={{ gap: 8 }}>
            <Row label="Total" value={money(total)} bold />
            {isDirect ? (
              <>
                <View>
                  <Label>Amount paid (AED)</Label>
                  <Input value={paidInput} onChangeText={setPaidInput} keyboardType="decimal-pad" placeholder="0" />
                  {!!r.direct_payment_method && (
                    <Text muted size={12} style={{ marginTop: 4 }}>
                      Method: {directPaymentLabel(r.direct_payment_method)}
                    </Text>
                  )}
                </View>
                <View style={{ backgroundColor: c.muted, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Row label="Balance remaining" value={money(balance)} bold />
                </View>
              </>
            ) : (
              <Row label="Collected by channel" value={money(total)} />
            )}
            {(r.amount_before_tax != null || r.ota_commission != null) && (
              <Text muted size={11}>
                Commissionable: AED {r.amount_before_tax ?? r.total_price}
                {r.ota_commission != null ? ` · Commission: AED ${r.ota_commission}` : ""}
              </Text>
            )}
          </View>
        ) : (
          <Text muted size={12}>
            Payment details are not available for your role.
          </Text>
        )}
      </View>

      {(r.source && r.source !== "direct" ? true : !!r.notes) && (
        <View style={box}>
          {sectionTitle(null, "Notes")}
          <Text>{r.source && r.source !== "direct" ? "Channex" : r.notes}</Text>
        </View>
      )}

      <View style={{ backgroundColor: c.slate900, borderRadius: 10, padding: 14, gap: 4 }}>
        <Text weight="semibold" size={11} style={{ color: c.amber500, letterSpacing: 1, textTransform: "uppercase" }}>
          Get in touch
        </Text>
        <Text size={12} style={{ color: "#e2e8f0" }}>
          {COMPANY_ADDRESS}
        </Text>
        <View style={{ flexDirection: "row", gap: 16, marginTop: 4 }}>
          <Pressable onPress={() => Linking.openURL(`tel:${COMPANY_PHONE.replace(/\s/g, "")}`)} style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
            <Phone size={12} color="#e2e8f0" />
            <Text size={12} style={{ color: "#e2e8f0" }}>
              {COMPANY_PHONE}
            </Text>
          </Pressable>
          <Pressable onPress={() => Linking.openURL(`https://${COMPANY_WEBSITE}`)} style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
            <Globe size={12} color="#e2e8f0" />
            <Text size={12} style={{ color: "#e2e8f0" }}>
              {COMPANY_WEBSITE}
            </Text>
          </Pressable>
        </View>
      </View>
    </Sheet>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text muted>{label}</Text>
      <Text weight={bold ? "semibold" : "medium"}>{value}</Text>
    </View>
  );
}

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");

/** Same layout and content as the website's jsPDF confirmation. */
function confirmationHtml(p: {
  r: Reservation;
  apartment?: Apartment | null;
  building?: Building | null;
  showFinancial: boolean;
  showContacts: boolean;
  idNumber: string;
  additionalGuests: string;
  nights: number;
  paid: number;
  balance: number;
  total: number;
}) {
  const { r } = p;
  const row = (label: string, value: string, bold = false) =>
    `<tr><td class="l">${esc(label)}</td><td class="v${bold ? " b" : ""}">${esc(value || "—")}</td></tr>`;
  const section = (title: string, rows: string) => `<h3>${esc(title)}</h3><table>${rows}</table>`;
  const isDirect = (r.source ?? "direct") === "direct";
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
  @page { margin: 0; }
  body { font-family: Helvetica, Arial, sans-serif; margin: 0; color: #0f172a; }
  .head { background: #0f172a; color: #fff; padding: 36px 48px; display: flex; justify-content: space-between; }
  .head .t { color: #f59e0b; font-weight: bold; font-size: 20px; text-align: right; }
  .head .s { color: #e2e8f0; font-size: 12px; text-align: right; margin-top: 6px; }
  .co { font-weight: bold; font-size: 14px; margin-top: 40px; }
  .body { padding: 24px 48px 120px; }
  h3 { color: #f59e0b; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin: 22px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 5px 0; vertical-align: top; }
  td.l { color: #64748b; width: 40%; }
  td.v { text-align: right; }
  td.b { font-weight: bold; }
  .foot { position: fixed; bottom: 0; left: 0; right: 0; background: #0f172a; color: #cbd5e1; padding: 18px 48px; font-size: 11px; }
  .foot b { color: #fff; font-size: 13px; }
  </style></head><body>
  <div class="head"><div><div class="co">${esc(COMPANY_NAME)}</div></div>
  <div><div class="t">RESERVATION CONFIRMATION</div><div class="s">${esc(reservationNumber(r.id))}</div>
  <div class="s">Issued ${new Date().toISOString().slice(0, 10)}</div></div></div>
  <div class="body">
  ${section(
    "Guest details",
    row("Guest name", r.guest_name) +
      (p.showContacts ? row("Phone", r.guest_phone) + row("Email", r.guest_email) : "") +
      row("Passport / ID no.", p.idNumber) +
      (p.additionalGuests.trim() ? row("Additional guests", p.additionalGuests) : ""),
  )}
  ${section(
    "Stay details",
    row("Apartment", p.apartment ? `${p.apartment.name}${p.building ? ` — ${p.building.name}` : ""}` : "—") +
      (p.building?.address ? row("Address", p.building.address) : "") +
      (p.apartment ? row("Unit type", `${p.apartment.type} · up to ${p.apartment.max_guests} guests`) : "") +
      row("Check-in", prettyDate(r.check_in)) +
      row("Check-out", prettyDate(r.check_out)) +
      row("Nights", String(p.nights)) +
      row("Status", r.status),
  )}
  ${section(
    "Payment",
    row("Booking source", SOURCE_LABEL[r.source ?? "direct"] ?? r.source) +
      (isDirect && r.direct_payment_method ? row("Payment method", directPaymentLabel(r.direct_payment_method)) : "") +
      (p.showFinancial
        ? row("Total amount", money(p.total), true) + row("Amount paid", money(p.paid)) + row("Balance remaining", money(p.balance), true)
        : ""),
  )}
  ${r.notes ? `<h3>Notes</h3><div style="font-size:13px">${esc(r.notes)}</div>` : ""}
  </div>
  <div class="foot"><b>${esc(COMPANY_NAME)}</b><br/>${esc(COMPANY_ADDRESS)}<br/>Phone: ${esc(COMPANY_PHONE)} · Web: ${esc(COMPANY_WEBSITE)}</div>
  </body></html>`;
}
