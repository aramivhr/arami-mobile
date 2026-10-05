import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { CalendarPlus, ChevronLeft, ChevronRight, Lock, Unlock } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Button, Card, Field, Input, PageHeader, Select, Sheet, Text } from "@/components/ui";
import { SourceBadge } from "@/components/badges";
import { RangePicker } from "@/components/RangePicker";
import { ReservationForm } from "@/components/ReservationForm";
import {
  useAddBlockedDate,
  useApartments,
  useBlockedDates,
  useBuildings,
  useDeleteBlockedDate,
  useReservations,
} from "@/hooks/data";
import { useMyPermissions } from "@/hooks/permissions";
import { useColors } from "@/lib/theme";
import { dateStr, daysInMonth, formatMonth, nightsBetween } from "@/lib/dates";
import type { BlockedDate, Reservation } from "@/lib/types";

// The website's calendar grid (units down the side, days across), sized for a
// phone: about two weeks are visible and the rest scrolls sideways. Same colors,
// labels and actions as the website.

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const LABEL_W = 96;
const ROW_H = 34;

type DayStatus =
  | { type: "available" }
  | { type: "reserved"; res: Reservation }
  | { type: "split"; checkout: Reservation; checkin: Reservation }
  | { type: "blocked"; block: BlockedDate };

export default function CalendarScreen() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [building, setBuilding] = useState<string>("all");
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [creating, setCreating] = useState<{ apartment_id: string; check_in: string } | null>(null);
  const [cell, setCell] = useState<{ type: "block" | "unblock"; apartmentId: string; date: string; block?: BlockedDate } | null>(null);
  const [blockEnd, setBlockEnd] = useState("");
  const [blockReason, setBlockReason] = useState("");

  const buildingsQ = useBuildings();
  const apartmentsQ = useApartments();
  const reservationsQ = useReservations();
  const blockedQ = useBlockedDates();
  const buildings = buildingsQ.data ?? [];
  const allApartments = apartmentsQ.data ?? [];
  const reservations = reservationsQ.data ?? [];
  const blocked = blockedQ.data ?? [];
  const addBlock = useAddBlockedDate();
  const deleteBlock = useDeleteBlockedDate();
  const { data: perms } = useMyPermissions();
  const showFinancial = perms?.show_financial ?? false;
  const showContacts = (perms?.show_contacts ?? false) || !!perms?.isAdmin;
  const canAdd = !!(perms?.can_add_reservations || perms?.isAdmin);
  const canEditAny = !!(perms?.can_edit_reservations || perms?.isAdmin);

  const nDays = daysInMonth(year, month);
  const visibleDays = width >= 768 ? 23 : 14;
  const colW = Math.max(22, (Math.min(width, 900) - 28 - LABEL_W) / visibleDays);
  const todayStr = dateStr(now.getFullYear(), now.getMonth(), now.getDate());

  const apartments = useMemo(() => {
    const monthEnd = dateStr(year, month, nDays);
    const out = new Set(blocked.filter((b) => b.reason === "Out of management" && b.start_date <= monthEnd).map((b) => b.apartment_id));
    const order = new Map(buildings.map((b, i) => [b.id, i]));
    return allApartments
      .filter((a) => (building === "all" || a.building_id === building) && !out.has(a.id))
      .sort((a, b) => {
        const d = (order.get(a.building_id) ?? 0) - (order.get(b.building_id) ?? 0);
        return d !== 0 ? d : a.name.localeCompare(b.name, undefined, { numeric: true });
      });
  }, [building, allApartments, buildings, blocked, year, month, nDays]);

  const statusFor = (aptId: string, day: number): DayStatus => {
    const ds = dateStr(year, month, day);
    const active = reservations.filter((r) => r.apartment_id === aptId && r.status !== "cancelled");
    const checkout = active.find((r) => r.check_out === ds);
    const checkin = active.find((r) => r.check_in === ds);
    if (checkout && checkin && checkout.id !== checkin.id) return { type: "split", checkout, checkin };
    const res = active.find((r) => ds >= r.check_in && ds < r.check_out);
    if (res) return { type: "reserved", res };
    const blk = blocked.find((b) => b.apartment_id === aptId && ds >= b.start_date && ds <= b.end_date);
    if (blk) return { type: "blocked", block: blk };
    return { type: "available" };
  };

  // Scroll so today is in view on the current month.
  const hScroll = useRef<ScrollView>(null);
  useEffect(() => {
    const isCurrent = year === now.getFullYear() && month === now.getMonth();
    const x = isCurrent ? Math.max(0, (now.getDate() - 2) * colW) : 0;
    const t = setTimeout(() => hScroll.current?.scrollTo({ x, animated: false }), 50);
    return () => clearTimeout(t);
  }, [year, month, colW]);

  const shiftMonth = (n: number) => {
    const d = new Date(year, month + n, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const openReservation = (r: Reservation) => router.push({ pathname: "/reservation/[id]", params: { id: r.id } });

  const label = (r: Reservation) => {
    const nights = nightsBetween(r.check_in, r.check_out);
    const first = (r.guest_name ?? "Guest").split(" ")[0] || "Guest";
    const name = nights < 4 ? first.slice(0, 2) : first;
    return showFinancial ? `${name} · ${r.total_price} AED` : name;
  };

  const onCellPress = (aptId: string, day: number, s: DayStatus) => {
    const ds = dateStr(year, month, day);
    if (s.type === "reserved") openReservation(s.res);
    else if (s.type === "blocked") setCell({ type: "unblock", apartmentId: aptId, date: ds, block: s.block });
    else if (s.type === "available") {
      setCell({ type: "block", apartmentId: aptId, date: ds });
      setBlockEnd(ds);
      setBlockReason("");
    }
  };

  const doBlock = async () => {
    if (!cell) return;
    try {
      await addBlock.mutateAsync({ apartment_id: cell.apartmentId, start_date: cell.date, end_date: blockEnd || cell.date, reason: blockReason || "Blocked" });
      setCell(null);
    } catch (e) {
      Alert.alert("Could not block dates", (e as Error).message);
    }
  };

  const doUnblock = async () => {
    if (!cell?.block) return;
    try {
      await deleteBlock.mutateAsync(cell.block.id);
      setCell(null);
    } catch (e) {
      Alert.alert("Could not unblock dates", (e as Error).message);
    }
  };

  const aptLabel = (id: string) => {
    const apt = allApartments.find((a) => a.id === id);
    const bld = apt ? buildings.find((b) => b.id === apt.building_id) : null;
    return { apt, bld };
  };

  const refresh = () => {
    reservationsQ.refetch();
    blockedQ.refetch();
    apartmentsQ.refetch();
    buildingsQ.refetch();
  };

  const days = Array.from({ length: nDays }, (_, i) => i + 1);

  return (
    <Screen onRefresh={refresh} refreshing={reservationsQ.isRefetching}>
      <PageHeader
        title="Calendar"
        subtitle="Tap any cell to manage"
        right={
          <Select
            value={building}
            onChange={setBuilding}
            options={[{ value: "all", label: "All Buildings" }, ...buildings.map((b) => ({ value: b.id, label: b.name }))]}
            title="Building"
            style={{ width: 150 }}
          />
        }
      />

      <Card style={{ overflow: "hidden" }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 6, paddingVertical: 8 }}>
          <Pressable onPress={() => shiftMonth(-1)} hitSlop={10} style={{ padding: 8 }} accessibilityLabel="Previous month">
            <ChevronLeft size={20} color={c.foreground} />
          </Pressable>
          <Text weight="semibold" size={16}>
            {formatMonth(year, month)}
          </Text>
          <Pressable onPress={() => shiftMonth(1)} hitSlop={10} style={{ padding: 8 }} accessibilityLabel="Next month">
            <ChevronRight size={20} color={c.foreground} />
          </Pressable>
        </View>

        <View style={{ flexDirection: "row" }}>
          {/* Unit names, fixed on the left */}
          <View style={{ width: LABEL_W, borderRightWidth: 1, borderRightColor: c.border }}>
            <View style={{ height: 38, justifyContent: "center", paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text muted size={11} weight="medium">
                Apt
              </Text>
            </View>
            {apartments.map((apt) => {
              const bld = buildings.find((b) => b.id === apt.building_id);
              return (
                <View key={apt.id} style={{ height: ROW_H, justifyContent: "center", paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
                  <Text size={11} weight="medium" numberOfLines={1}>
                    {apt.name}
                  </Text>
                  <Text muted size={9} numberOfLines={1}>
                    {bld?.name}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Days, scrolling sideways */}
          <ScrollView horizontal ref={hScroll} showsHorizontalScrollIndicator={false}>
            <View>
              <View style={{ flexDirection: "row", height: 38, borderBottomWidth: 1, borderBottomColor: c.border }}>
                {days.map((d) => {
                  const dow = new Date(year, month, d).getDay();
                  const isToday = dateStr(year, month, d) === todayStr;
                  const weekend = dow === 0 || dow === 6;
                  return (
                    <View key={d} style={{ width: colW, alignItems: "center", justifyContent: "center", backgroundColor: weekend ? c.muted : undefined }}>
                      <Text muted size={9}>
                        {DOW[dow]}
                      </Text>
                      <Text size={11} weight={isToday ? "bold" : "regular"} style={isToday ? { color: c.accent } : undefined}>
                        {d}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {apartments.map((apt) => {
                const statuses = days.map((d) => statusFor(apt.id, d));
                return (
                  <View key={apt.id} style={{ height: ROW_H, flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.border }}>
                    {statuses.map((s, i) => {
                      const d = i + 1;
                      if (s.type === "split") {
                        return (
                          <View key={d} style={{ width: colW, flexDirection: "row", gap: 2, paddingVertical: 3 }}>
                            <Pressable onPress={() => openReservation(s.checkout)} style={{ flex: 1, backgroundColor: c.booked, borderTopRightRadius: 6, borderBottomRightRadius: 6 }} />
                            <Pressable onPress={() => openReservation(s.checkin)} style={{ flex: 1, backgroundColor: c.booked, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 }} />
                          </View>
                        );
                      }
                      if (s.type === "reserved") {
                        const ds = dateStr(year, month, d);
                        const isStart = ds === s.res.check_in;
                        const next = statuses[i + 1];
                        const isEnd = d === nDays || !next || next.type !== "reserved" || next.res.id !== s.res.id;
                        const prev = statuses[i - 1];
                        return (
                          <Pressable
                            key={d}
                            onPress={() => openReservation(s.res)}
                            style={{
                              width: colW,
                              marginVertical: 3,
                              backgroundColor: c.booked,
                              borderTopLeftRadius: isStart && prev?.type !== "split" ? 6 : 0,
                              borderBottomLeftRadius: isStart && prev?.type !== "split" ? 6 : 0,
                              borderTopRightRadius: isEnd && next?.type !== "split" ? 6 : 0,
                              borderBottomRightRadius: isEnd && next?.type !== "split" ? 6 : 0,
                            }}
                          />
                        );
                      }
                      return (
                        <Pressable
                          key={d}
                          onPress={() => onCellPress(apt.id, d, s)}
                          style={{
                            width: colW,
                            borderRightWidth: 1,
                            borderRightColor: s.type === "blocked" ? c.blockedBorder : c.border,
                            backgroundColor: s.type === "blocked" ? c.blocked : c.card,
                          }}
                        />
                      );
                    })}

                    {/* Guest labels drawn over the bars, starting on the check-in day */}
                    {statuses.map((s, i) => {
                      const res = s.type === "reserved" ? s.res : s.type === "split" ? s.checkin : null;
                      if (!res || res.check_in !== dateStr(year, month, i + 1)) return null;
                      const span = Math.min(nightsBetween(res.check_in, res.check_out), 4);
                      const left = i * colW + (s.type === "split" ? colW / 2 + 1 : 2);
                      return (
                        <View
                          key={`l${i}`}
                          pointerEvents="none"
                          style={{ position: "absolute", left, top: 0, height: ROW_H, width: span * colW - 4, flexDirection: "row", alignItems: "center", gap: 3, overflow: "hidden" }}
                        >
                          <SourceBadge source={res.source || "direct"} size="sm" />
                          <Text size={10} weight="semibold" numberOfLines={1} style={{ color: "#fff", flexShrink: 1 }}>
                            {label(res)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, padding: 12 }}>
          <Legend swatch={<View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: c.card, borderWidth: 1, borderColor: c.border }} />} label="Available" />
          <Legend swatch={<View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.booked }} />} label="Booked" />
          <Legend swatch={<View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: c.blocked, borderWidth: 1, borderColor: c.blockedBorder }} />} label="Blocked" />
          <Legend
            swatch={
              <View style={{ flexDirection: "row", gap: 2 }}>
                <View style={{ width: 10, height: 12, backgroundColor: c.booked, borderTopRightRadius: 3, borderBottomRightRadius: 3 }} />
                <View style={{ width: 10, height: 12, backgroundColor: c.booked, borderTopLeftRadius: 3, borderBottomLeftRadius: 3 }} />
              </View>
            }
            label="Checkout / Check-in"
          />
        </View>
      </Card>

      <ReservationForm
        open={!!editing || !!creating}
        onClose={() => {
          setEditing(null);
          setCreating(null);
        }}
        editing={editing}
        preset={creating ?? undefined}
        newStatus="confirmed"
        showContacts={showContacts}
        showFinancial={showFinancial}
      />

      <Sheet
        open={cell?.type === "block"}
        onClose={() => setCell(null)}
        title="Available Date"
        footer={
          <View style={{ flexDirection: "row", gap: 8 }}>
            {canAdd && (
              <Button
                title="New Reservation"
                icon={<CalendarPlus size={16} color={c.primaryForeground} />}
                style={{ flex: 1 }}
                onPress={() => {
                  if (!cell) return;
                  setCreating({ apartment_id: cell.apartmentId, check_in: cell.date });
                  setCell(null);
                }}
              />
            )}
            <Button title="Block Dates" variant="destructive" icon={<Lock size={16} color="#fff" />} style={{ flex: 1 }} onPress={doBlock} loading={addBlock.isPending} />
          </View>
        }
      >
        {cell && (
          <>
            <AptLine info={aptLabel(cell.apartmentId)} />
            <RangePicker
              label="From – To"
              start={cell.date}
              end={blockEnd}
              minDate={cell.date}
              nightsMode={false}
              onChange={(_s, e) => setBlockEnd(e)}
            />
            <Field label="Reason">
              <Input value={blockReason} onChangeText={setBlockReason} placeholder="e.g. Maintenance, Owner use..." />
            </Field>
          </>
        )}
      </Sheet>

      <Sheet
        open={cell?.type === "unblock"}
        onClose={() => setCell(null)}
        title="Unblock Dates"
        footer={<Button title="Unblock & Open Dates" icon={<Unlock size={16} color={c.primaryForeground} />} onPress={doUnblock} loading={deleteBlock.isPending} />}
      >
        {cell?.block && (
          <>
            <AptLine info={aptLabel(cell.apartmentId)} />
            <Text>
              <Text muted>Blocked: </Text>
              <Text weight="medium">
                {cell.block.start_date} → {cell.block.end_date}
              </Text>
            </Text>
            <Text>
              <Text muted>Reason: </Text>
              <Text weight="medium">{cell.block.reason}</Text>
            </Text>
            <Text muted size={13}>
              This will remove the entire block period and make these dates available again.
            </Text>
          </>
        )}
      </Sheet>
    </Screen>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {swatch}
      <Text muted size={11}>
        {label}
      </Text>
    </View>
  );
}

function AptLine({ info }: { info: { apt?: { name: string } | null; bld?: { name: string } | null } }) {
  return (
    <Text>
      <Text muted>Apartment: </Text>
      <Text weight="medium">{info.apt?.name}</Text>
      <Text muted> ({info.bld?.name})</Text>
    </Text>
  );
}
