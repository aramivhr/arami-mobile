import React, { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react-native";
import { Button, Label, Sheet, Text } from "@/components/ui";
import { withAlpha } from "@/components/badges";
import { radius, useColors } from "@/lib/theme";
import { daysInMonth, dateStr, formatMonth, nightsBetween, parseISO, prettyDate } from "@/lib/dates";

const WEEK = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/**
 * One popup that picks a start and end date, like the website's single
 * date-range picker: tap the first day, then the last day.
 */
export function RangePicker({
  label,
  start,
  end,
  onChange,
  minDate,
  nightsMode = true,
}: {
  label: string;
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
  minDate?: string;
  /** Stays count nights (end is the checkout day); blocks count days. */
  nightsMode?: boolean;
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ start: string; end: string }>({ start, end });
  const initial = parseISO(start) ?? new Date();
  const [ym, setYm] = useState({ y: initial.getFullYear(), m: initial.getMonth() });

  const openPicker = () => {
    setDraft({ start, end });
    const d = parseISO(start) ?? new Date();
    setYm({ y: d.getFullYear(), m: d.getMonth() });
    setOpen(true);
  };

  const pick = (ds: string) => {
    if (minDate && ds < minDate) return;
    if (!draft.start || draft.end || ds < draft.start) setDraft({ start: ds, end: "" });
    else if (nightsMode && ds === draft.start) return;
    else setDraft({ start: draft.start, end: ds });
  };

  const cells = useMemo(() => {
    const first = new Date(ym.y, ym.m, 1).getDay();
    const offset = first === 0 ? 6 : first - 1;
    const n = daysInMonth(ym.y, ym.m);
    return [...Array(offset).fill(null), ...Array.from({ length: n }, (_, i) => i + 1)];
  }, [ym]);

  const summary = start
    ? `${prettyDate(start)}  →  ${end ? prettyDate(end) : "…"}${end && nightsMode ? `  ·  ${nightsBetween(start, end)} nights` : ""}`
    : "Select dates";

  const shift = (n: number) => {
    const d = new Date(ym.y, ym.m + n, 1);
    setYm({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <View>
      <Label>{label}</Label>
      <Pressable
        onPress={openPicker}
        style={{
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: radius,
          backgroundColor: c.card,
          minHeight: 44,
          paddingHorizontal: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <CalendarDays size={16} color={c.mutedForeground} />
        <Text size={14} muted={!start}>
          {summary}
        </Text>
      </Pressable>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        footer={
          <Button
            title="Done"
            disabled={!draft.start || (!draft.end && nightsMode)}
            onPress={() => {
              onChange(draft.start, draft.end || draft.start);
              setOpen(false);
            }}
          />
        }
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable onPress={() => shift(-1)} hitSlop={10} style={{ padding: 6 }}>
            <ChevronLeft size={20} color={c.foreground} />
          </Pressable>
          <Text weight="semibold" size={16} style={{ flex: 1, textAlign: "center" }}>
            {formatMonth(ym.y, ym.m)}
          </Text>
          <Pressable onPress={() => shift(1)} hitSlop={10} style={{ padding: 6 }}>
            <ChevronRight size={20} color={c.foreground} />
          </Pressable>
        </View>
        <View style={{ flexDirection: "row" }}>
          {WEEK.map((w) => (
            <Text key={w} muted size={12} style={{ flex: 1, textAlign: "center" }}>
              {w}
            </Text>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {cells.map((d, i) => {
            if (d == null) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, height: 42 }} />;
            const ds = dateStr(ym.y, ym.m, d);
            const disabled = !!minDate && ds < minDate;
            const isEdge = ds === draft.start || ds === draft.end;
            const inRange = !!draft.start && !!draft.end && ds > draft.start && ds < draft.end;
            return (
              <Pressable
                key={ds}
                onPress={() => pick(ds)}
                disabled={disabled}
                style={{
                  width: `${100 / 7}%`,
                  height: 42,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: inRange ? withAlpha(c.accent, 0.18) : "transparent",
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isEdge ? c.accent : "transparent",
                  }}
                >
                  <Text
                    size={14}
                    weight={isEdge ? "bold" : "regular"}
                    style={{ color: disabled ? c.border : isEdge ? c.accentForeground : c.foreground }}
                  >
                    {d}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Text muted size={13} style={{ textAlign: "center" }}>
          {!draft.start
            ? "Tap the first day"
            : !draft.end
              ? nightsMode
                ? "Now tap the checkout day"
                : "Tap the last day, or Done for a single day"
              : `${prettyDate(draft.start)} → ${prettyDate(draft.end)}`}
        </Text>
      </Sheet>
    </View>
  );
}
