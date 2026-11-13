import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, Lock, Unlock } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Button, Field, Input, PageHeader, Select, Sheet, Text } from "@/components/ui";
import { SourceBadge, withAlpha } from "@/components/badges";
import { RangePicker } from "@/components/RangePicker";
import { ReservationForm } from "@/components/ReservationForm";
import {
  useAddBlockedDate,
  useApartments,
  useBlockedDates,
  useBuildings,
  useDeleteBlockedDate,
  useOverbookings,
  useReservations,
} from "@/hooks/data";
import type { Overbooking } from "@/lib/overbookings";
import { useMyPermissions } from "@/hooks/permissions";
import { useColors } from "@/lib/theme";
import { calendarDays, dateStr, daysInMonth, formatAmount, formatMonth, nightsBetween, todayScrollX, type CalendarDay } from "@/lib/dates";
import type { Apartment, BlockedDate, Reservation } from "@/lib/types";
import { dayCell as overlapCell } from "@/lib/calendar-overlaps";

// The website's calendar grid (units down the side, days across), sized for a
// phone: about two weeks are visible and the rest scrolls sideways. Same colors,
// labels and actions as the website. The date row stays at the top while the
// units scroll up and down, and on the current month today is the third column.

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const LABEL_W = 96;
const ROW_H = 34;

type GridRow = { type: "apt"; apt: Apartment } | { type: "overbooking"; ob: Overbooking };

type DayStatus =
  | { type: "available" }
  | { type: "reserved"; res: Reservation }
  | { type: "split"; checkout: Reservation; checkin: Reservation }
  /** More than one stay that night: an overbooking. `stays` oldest first, the overbooking (shown) last. */
  | { type: "overlap"; stays: Reservation[] }
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
  const [overbooking, setOverbooking] = useState<Overbooking | null>(null);

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
  // Columns: the month, plus a few days either side on the current month so today can be third from the left.
  const days = useMemo(() => calendarDays(year, month, todayStr, visibleDays), [year, month, todayStr, visibleDays]);
  const rangeStart = days[0].ds;
  const rangeEnd = days[days.length - 1].ds;

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

  // Channel bookings with no free unit: a red row under the last unit each could
  // go in, or at the top when none of those units is in view on "All Buildings".
  const overbookings = useOverbookings(allApartments, reservations);
  const rows = useMemo<GridRow[]>(() => {
    const after = new Map<string, Overbooking[]>();
    const top: Overbooking[] = [];
    for (const ob of overbookings) {
      if (ob.checkOut <= rangeStart || ob.checkIn > rangeEnd) continue;
      const lastUnit = [...apartments].reverse().find((a) => ob.unitIds.includes(a.id));
      if (lastUnit) after.set(lastUnit.id, [...(after.get(lastUnit.id) ?? []), ob]);
      else if (building === "all") top.push(ob);
    }
    const out: GridRow[] = top.map((ob) => ({ type: "overbooking", ob }));
    for (const apt of apartments) {
      out.push({ type: "apt", apt });
      for (const ob of after.get(apt.id) ?? []) out.push({ type: "overbooking", ob });
    }
    return out;
  }, [overbookings, apartments, building, rangeStart, rangeEnd]);

  const byApt = useMemo(() => {
    const m = new Map<string, Reservation[]>();
    for (const r of reservations) {
      if (r.status === "cancelled") continue;
      m.set(r.apartment_id, [...(m.get(r.apartment_id) ?? []), r]);
    }
    return m;
  }, [reservations]);

  // Same rules as the website: one row per unit, and nights with more than one
  // stay are an overbooking shown in red on that row.
  const statusFor = (aptId: string, ds: string): DayStatus => {
    const cell = overlapCell(byApt.get(aptId) ?? [], ds);
    if (cell.type === "overlap") return { type: "overlap", stays: cell.stays };
    if (cell.type === "split") return { type: "split", checkout: cell.checkout, checkin: cell.checkin };
    if (cell.type === "reserved") return { type: "reserved", res: cell.stay };
    const blk = blocked.find((b) => b.apartment_id === aptId && ds >= b.start_date && ds <= b.end_date);
    if (blk) return { type: "blocked", block: blk };
    return { type: "available" };
  };

  // Scroll so today is the third column on the current month (the start on other months).
  // The date row is its own strip (so it can stay at the top) and follows the grid sideways.
  const hScroll = useRef<ScrollView>(null);
  const headScroll = useRef<ScrollView>(null);
  useEffect(() => {
    const x = todayScrollX(days, todayStr, colW);
    const t = setTimeout(() => {
      hScroll.current?.scrollTo({ x, animated: false });
      headScroll.current?.scrollTo({ x, animated: false });
    }, 50);
    return () => clearTimeout(t);
  }, [days, todayStr, colW]);

  const shiftMonth = (n: number) => {
    const d = new Date(year, month + n, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const openReservation = (r: Reservation) => router.push({ pathname: "/reservation/[id]", params: { id: r.id } });
  const barColor = (r: Reservation) => (r.is_overbooking ? c.destructive : c.booked);
  const overbookingInView = useMemo(
    () => apartments.some((a) => days.some((d) => statusFor(a.id, d.ds).type === "overlap")) || reservations.some((r) => r.is_overbooking && r.status !== "cancelled" && r.check_out > rangeStart && r.check_in <= rangeEnd),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apartments, days, byApt, blocked, reservations, rangeStart, rangeEnd],
  );

  const label = (r: Reservation) => {
    const nights = nightsBetween(r.check_in, r.check_out);
    const first = (r.guest_name ?? "Guest").split(" ")[0] || "Guest";
    const name = nights < 4 ? first.slice(0, 2) : first;
    // Price first: short stays have little room and the label is cut from the end.
    return showFinancial ? `${formatAmount(r.total_price)} · ${name}` : name;
  };

  const onCellPress = (aptId: string, ds: string, s: DayStatus) => {
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

  const dayCell = (d: CalendarDay) => {
    const isToday = d.ds === todayStr;
    const weekend = d.dow === 0 || d.dow === 6;
    return (
      <View key={d.ds} style={{ width: colW, alignItems: "center", justifyContent: "center", backgroundColor: isToday ? withAlpha(c.accent, 0.12) : weekend ? c.muted : undefined }}>
        <Text muted size={9}>
          {DOW[d.dow]}
        </Text>
        <Text size={11} weight={isToday ? "bold" : "regular"} muted={!d.inMonth && !isToday} style={isToday ? { color: c.accent } : undefined}>
          {d.day}
        </Text>
      </View>
    );
  };

  const edge = { borderLeftWidth: 1, borderRightWidth: 1, borderColor: c.border, backgroundColor: c.card };

  return (
    // Children: 0 header, 1 month bar, 2 date row (stays at the top), 3 grid.
    <Screen onRefresh={refresh} refreshing={reservationsQ.isRefetching} stickyHeaderIndices={[2]} contentStyle={{ gap: 0 }}>
      <View style={{ marginBottom: 16 }}>
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
      </View>

      <View style={[edge, { borderTopWidth: 1, borderTopLeftRadius: 10, borderTopRightRadius: 10 }]}>
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
      </View>

      {/* Date row: stays at the top while scrolling down, and follows the grid sideways. */}
      <View style={[edge, { flexDirection: "row", height: 38, borderBottomWidth: 1 }]}>
        <View style={{ width: LABEL_W, justifyContent: "center", paddingHorizontal: 8, borderRightWidth: 1, borderRightColor: c.border }}>
          <Text muted size={11} weight="medium">
            Apt
          </Text>
        </View>
        <ScrollView horizontal ref={headScroll} scrollEnabled={false} showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row" }}>{days.map(dayCell)}</View>
        </ScrollView>
      </View>

      <View style={[edge, { borderBottomWidth: 1, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, overflow: "hidden" }]}>
        <View style={{ flexDirection: "row" }}>
          {/* Unit names, fixed on the left */}
          <View style={{ width: LABEL_W, borderRightWidth: 1, borderRightColor: c.border }}>
            {rows.map((row) => {
              if (row.type === "overbooking") {
                return (
                  <View
                    key={`ob-${row.ob.key}`}
                    style={{ height: ROW_H, justifyContent: "center", paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: withAlpha(c.destructive, 0.1) }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                      <AlertTriangle size={10} color={c.destructive} />
                      <Text size={10} weight="semibold" numberOfLines={1} style={{ color: c.destructive }}>
                        Overbooking
                      </Text>
                    </View>
                    <Text size={9} numberOfLines={1} style={{ color: c.destructive }}>
                      {row.ob.guestName.split(" ")[0]}
                    </Text>
                  </View>
                );
              }
              const apt = row.apt;
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
          <ScrollView
            horizontal
            ref={hScroll}
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(e) => headScroll.current?.scrollTo({ x: e.nativeEvent.contentOffset.x, animated: false })}
          >
            <View>
              {rows.map((row) => {
                if (row.type === "overbooking") return <OverbookingRow key={`ob-${row.ob.key}`} ob={row.ob} days={days} colW={colW} onPress={() => setOverbooking(row.ob)} />;
                const apt = row.apt;
                const statuses = days.map((d) => statusFor(apt.id, d.ds));
                return (
                  <View key={apt.id} style={{ height: ROW_H, flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.border }}>
                    {statuses.map((s, i) => {
                      const ds = days[i].ds;
                      const d = ds;
                      if (s.type === "split") {
                        return (
                          <View key={d} style={{ width: colW, flexDirection: "row", gap: 2, paddingVertical: 3 }}>
                            <Pressable onPress={() => openReservation(s.checkout)} style={{ flex: 1, backgroundColor: barColor(s.checkout), borderTopRightRadius: 6, borderBottomRightRadius: 6 }} />
                            <Pressable onPress={() => openReservation(s.checkin)} style={{ flex: 1, backgroundColor: barColor(s.checkin), borderTopLeftRadius: 6, borderBottomLeftRadius: 6 }} />
                          </View>
                        );
                      }
                      if (s.type === "overlap") {
                        const shown = s.stays[s.stays.length - 1];
                        const prev = statuses[i - 1];
                        const next = statuses[i + 1];
                        const isStart = prev?.type !== "overlap";
                        const isEnd = next?.type !== "overlap";
                        return (
                          <Pressable
                            key={d}
                            onPress={() => openReservation(shown)}
                            accessibilityLabel={`Overbooking: ${s.stays.map((x) => x.guest_name).join(" and ")}`}
                            style={{
                              width: colW,
                              marginVertical: 3,
                              backgroundColor: c.destructive,
                              borderTopLeftRadius: isStart ? 6 : 0,
                              borderBottomLeftRadius: isStart ? 6 : 0,
                              borderTopRightRadius: isEnd ? 6 : 0,
                              borderBottomRightRadius: isEnd ? 6 : 0,
                            }}
                          />
                        );
                      }
                      if (s.type === "reserved") {
                        const next = statuses[i + 1];
                        const prev = statuses[i - 1];
                        const isStart = ds === s.res.check_in || i === 0 || prev?.type === "overlap";
                        const isEnd = i === days.length - 1 || !next || next.type !== "reserved" || next.res.id !== s.res.id;
                        return (
                          <Pressable
                            key={d}
                            onPress={() => openReservation(s.res)}
                            style={{
                              width: colW,
                              marginVertical: 3,
                              backgroundColor: barColor(s.res),
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
                          onPress={() => onCellPress(apt.id, ds, s)}
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
                      if (s.type === "overlap") {
                        if (statuses[i - 1]?.type === "overlap") return null;
                        const shown = s.stays[s.stays.length - 1];
                        let span = 1;
                        while (span < 4 && statuses[i + span]?.type === "overlap") span++;
                        return (
                          <View
                            key={`l${i}`}
                            pointerEvents="none"
                            style={{ position: "absolute", left: i * colW + 3, top: 0, height: ROW_H, width: Math.max(span, 2) * colW - 6, flexDirection: "row", alignItems: "center", gap: 3, overflow: "hidden", zIndex: 2 }}
                          >
                            <AlertTriangle size={11} color="#fff" />
                            <Text size={10} weight="bold" numberOfLines={1} style={{ color: "#fff", flexShrink: 1 }}>
                              OVERBOOKING · {(shown.guest_name ?? "Guest").split(" ")[0]}
                            </Text>
                          </View>
                        );
                      }
                      const res = s.type === "reserved" ? s.res : s.type === "split" ? s.checkin : null;
                      const afterOverlap = s.type === "reserved" && statuses[i - 1]?.type === "overlap" && res && res.check_out > days[i].ds;
                      if (!res || (res.check_in !== days[i].ds && !afterOverlap)) return null;
                      const span = Math.min(nightsBetween(days[i].ds < res.check_in ? res.check_in : days[i].ds, res.check_out), 4);
                      const left = i * colW + (s.type === "split" ? colW / 2 + 1 : 2);
                      return (
                        <View
                          key={`l${i}`}
                          pointerEvents="none"
                          style={{ position: "absolute", left, top: 0, height: ROW_H, width: span * colW - 4, flexDirection: "row", alignItems: "center", gap: 3, overflow: "hidden" }}
                        >
                          {res.is_overbooking ? <AlertTriangle size={11} color="#fff" /> : <SourceBadge source={res.source || "direct"} size="sm" />}
                          <Text size={10} weight="semibold" numberOfLines={1} style={{ color: "#fff", flexShrink: 1 }}>
                            {res.is_overbooking ? "OVERBOOKING · " : ""}{label(res)}
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
          {(overbookings.length > 0 || overbookingInView) && (
            <Legend swatch={<View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: c.destructive }} />} label="Overbooking (tap to see every stay)" />
          )}
        </View>
      </View>

      <Sheet open={!!overbooking} onClose={() => setOverbooking(null)} title="Overbooking">
        {overbooking && <OverbookingDetails ob={overbooking} apartments={allApartments} buildings={buildings} showFinancial={showFinancial} />}
      </Sheet>

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

function OverbookingRow({
  ob,
  days,
  colW,
  onPress,
}: {
  ob: Overbooking;
  days: CalendarDay[];
  colW: number;
  onPress: () => void;
}) {
  const c = useColors();
  const nDays = days.length;
  const startIdx = Math.max(0, days.findIndex((d) => d.ds >= ob.checkIn));
  const startDs = days[startIdx]?.ds ?? ob.checkIn;
  return (
    <View style={{ height: ROW_H, flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.border }}>
      {days.map((cd, i) => {
        const ds = cd.ds;
        const d = ds;
        if (ds < ob.checkIn || ds >= ob.checkOut) {
          return <View key={d} style={{ width: colW, borderRightWidth: 1, borderRightColor: c.border, backgroundColor: withAlpha(c.destructive, 0.05) }} />;
        }
        const isStart = ds === ob.checkIn;
        const isEnd = i === nDays - 1 || days[i + 1].ds >= ob.checkOut;
        return (
          <Pressable
            key={d}
            onPress={onPress}
            accessibilityLabel={`Overbooking: ${ob.guestName}`}
            style={{
              width: colW,
              marginVertical: 3,
              backgroundColor: c.destructive,
              borderTopLeftRadius: isStart ? 6 : 0,
              borderBottomLeftRadius: isStart ? 6 : 0,
              borderTopRightRadius: isEnd ? 6 : 0,
              borderBottomRightRadius: isEnd ? 6 : 0,
            }}
          />
        );
      })}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: startIdx * colW + 3,
          top: 0,
          height: ROW_H,
          width: Math.max(2, Math.min(6, nightsBetween(startDs, ob.checkOut))) * colW - 6,
          flexDirection: "row",
          alignItems: "center",
          gap: 3,
          overflow: "hidden",
        }}
      >
        <AlertTriangle size={11} color="#fff" />
        <Text size={10} weight="bold" numberOfLines={1} style={{ color: "#fff", flexShrink: 1 }}>
          OVERBOOKING · {ob.guestName}
        </Text>
      </View>
    </View>
  );
}

function OverbookingDetails({
  ob,
  apartments,
  buildings,
  showFinancial,
}: {
  ob: Overbooking;
  apartments: Apartment[];
  buildings: { id: string; name: string }[];
  showFinancial: boolean;
}) {
  const c = useColors();
  const units = apartments
    .filter((a) => ob.unitIds.includes(a.id))
    .map((a) => {
      const b = buildings.find((x) => x.id === a.building_id);
      return `${a.name}${b ? ` (${b.name})` : ""}`;
    });
  const nights = nightsBetween(ob.checkIn, ob.checkOut);
  const guests = [
    ob.adults != null ? `${ob.adults} ${ob.adults === 1 ? "adult" : "adults"}` : null,
    ob.children ? `${ob.children} ${ob.children === 1 ? "child" : "children"}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const arrived = new Date(ob.receivedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const rows: [string, string][] = [
    ["Guest", ob.guestName],
    ["Channel", ob.channel],
    ["Booking number", ob.ref],
    ["Arrived", arrived],
    ["Check-in", ob.checkIn],
    ["Check-out", `${ob.checkOut} (${nights} ${nights === 1 ? "night" : "nights"})`],
    ...(guests ? ([["Guests", guests]] as [string, string][]) : []),
    ...(showFinancial && ob.amount != null ? ([["Total", `${formatAmount(ob.amount)} ${ob.currency}`]] as [string, string][]) : []),
    ["Can go in", units.length ? units.join(", ") : "Unknown: check the Channex mapping"],
  ];
  return (
    <>
      <View style={{ borderRadius: 8, borderWidth: 1, borderColor: withAlpha(c.destructive, 0.4), backgroundColor: withAlpha(c.destructive, 0.08), padding: 12 }}>
        <Text size={13} style={{ color: c.destructive }}>
          This booking arrived from {ob.channel} but every unit it can go in is taken on at least one of these nights, so it is not in the reservations
          yet. Move or cancel a stay, or remove a block, in one of the units below and it imports automatically within 2 minutes.
        </Text>
      </View>
      {rows.map(([label, value]) => (
        <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
          <Text muted>{label}</Text>
          <Text weight="medium" style={{ flexShrink: 1, textAlign: "right" }}>
            {value}
          </Text>
        </View>
      ))}
    </>
  );
}
