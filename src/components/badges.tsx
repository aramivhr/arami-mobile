import React from "react";
import { Image, Pressable, View } from "react-native";
import { Badge, Text } from "@/components/ui";
import { radius, useColors } from "@/lib/theme";
import type { DirectPaymentMethod, ReservationSource, Thread } from "@/lib/types";

export { SOURCE_LABEL, DIRECT_PAYMENT_LABELS, directPaymentLabel } from "@/lib/labels";
import { DIRECT_PAYMENT_LABELS } from "@/lib/labels";

// Same badges as the website's StatusBadge and SourceBadge components.

type Status = "confirmed" | "pending" | "cancelled" | "checked-in" | "checked-out" | "no-show";

export function StatusBadge({ status }: { status: Status }) {
  const c = useColors();
  const config: Record<Status, { label: string; color: string }> = {
    confirmed: { label: "Confirmed", color: c.success },
    pending: { label: "Pending", color: c.warning },
    cancelled: { label: "Cancelled", color: c.destructive },
    "checked-in": { label: "Checked In", color: c.primary },
    "checked-out": { label: "Checked Out", color: c.mutedForeground },
    "no-show": { label: "No Show", color: c.destructive },
  };
  const cfg = config[status] ?? config.pending;
  return <Badge label={cfg.label} color={cfg.color} bg={withAlpha(cfg.color, 0.15)} border={withAlpha(cfg.color, 0.3)} />;
}

/** Turns "hsl(h, s%, l%)" or "#rrggbb" into the same color with transparency. */
export function withAlpha(color: string, alpha: number) {
  if (color.startsWith("hsl(")) return color.replace("hsl(", "hsla(").replace(")", `, ${alpha})`);
  if (color.startsWith("#") && color.length === 7) {
    const a = Math.round(alpha * 255).toString(16).padStart(2, "0");
    return color + a;
  }
  return color;
}

const airbnbLogo = require("../../assets/images/airbnb-logo.png");

export function SourceBadge({ source, size = "md" }: { source: ReservationSource; size?: "sm" | "md" }) {
  if (source === "airbnb") {
    const s = size === "sm" ? 24 : 32;
    return <Image source={airbnbLogo} style={{ width: s, height: s }} resizeMode="contain" />;
  }
  const s = size === "sm" ? 18 : 26;
  const isBooking = source === "booking";
  return (
    <View
      style={{
        width: s,
        height: s,
        borderRadius: s / 2,
        backgroundColor: isBooking ? "#003580" : "#facc15",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text weight="bold" size={size === "sm" ? 10 : 13} style={{ color: isBooking ? "#fff" : "#713f12" }}>
        {isBooking ? "B" : "D"}
      </Text>
    </View>
  );
}

export function ChoiceRow<T extends string>({
  options,
  value,
  onChange,
  render,
}: {
  options: readonly T[];
  value: T | null | undefined;
  onChange: (v: T) => void;
  render: (v: T) => React.ReactNode;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => (
        <Pressable
          key={o}
          onPress={() => onChange(o)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: radius - 2,
            borderWidth: 1,
            borderColor: value === o ? c.primary : c.border,
            backgroundColor: value === o ? withAlpha(c.primary, 0.1) : c.card,
          }}
        >
          {render(o)}
        </Pressable>
      ))}
    </View>
  );
}

export function DirectPaymentSelect({
  value,
  onChange,
}: {
  value: DirectPaymentMethod | null | undefined;
  onChange: (v: DirectPaymentMethod) => void;
}) {
  return (
    <ChoiceRow
      options={["cash", "payment_link", "bank_transfer"] as const}
      value={value}
      onChange={onChange}
      render={(m) => (
        <Text size={13} weight={value === m ? "semibold" : "regular"}>
          {DIRECT_PAYMENT_LABELS[m]}
        </Text>
      )}
    />
  );
}

/** Airbnb conversation type, as on the website's Messages page. */
export function KindBadge({ kind, label }: { kind: Thread["thread_kind"]; label: string }) {
  const color = kind === "enquiry" ? "#0ea5e9" : "#059669";
  return (
    <View style={{ backgroundColor: withAlpha(color, 0.15), borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text weight="semibold" size={10} style={{ color, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </Text>
    </View>
  );
}
