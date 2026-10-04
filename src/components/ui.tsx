import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, ChevronDown, X } from "lucide-react-native";
import { fonts, radius, useColors } from "@/lib/theme";

// Small set of building blocks that reproduce the website's shadcn/ui look
// (cards, buttons, inputs, badges, dialogs) with the same colors and font.

type Weight = "regular" | "medium" | "semibold" | "bold";

export function Text({
  style,
  weight = "regular",
  muted,
  size = 14,
  ...props
}: TextProps & { weight?: Weight; muted?: boolean; size?: number }) {
  const c = useColors();
  return (
    <RNText
      {...props}
      style={[{ fontFamily: fonts[weight], fontSize: size, color: muted ? c.mutedForeground : c.foreground }, style]}
    />
  );
}

export function Card({ style, children, onPress }: { style?: StyleProp<ViewStyle>; children: React.ReactNode; onPress?: () => void }) {
  const c = useColors();
  const base: ViewStyle = {
    backgroundColor: c.card,
    borderColor: c.border,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius + 2,
  };
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.8 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

type ButtonVariant = "default" | "outline" | "ghost" | "destructive" | "secondary" | "accent";

export function Button({
  title,
  onPress,
  variant = "default",
  icon,
  disabled,
  loading,
  size = "md",
  style,
}: {
  title?: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  size?: "sm" | "md";
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const palette: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    default: { bg: c.primary, fg: c.primaryForeground },
    outline: { bg: c.card, fg: c.foreground, border: c.border },
    ghost: { bg: "transparent", fg: c.foreground },
    destructive: { bg: c.destructive, fg: "#fff" },
    secondary: { bg: c.secondary, fg: c.foreground },
    accent: { bg: c.amber500, fg: c.slate900 },
  };
  const p = palette[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          backgroundColor: p.bg,
          borderColor: p.border ?? p.bg,
          borderWidth: p.border ? 1 : 0,
          borderRadius: radius,
          height: size === "sm" ? 34 : 44,
          paddingHorizontal: size === "sm" ? 10 : 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={p.fg} size="small" /> : icon}
      {!!title && (
        <Text weight="medium" size={size === "sm" ? 13 : 14} style={{ color: p.fg }}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Label({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text weight="medium" size={13} style={[{ marginBottom: 6 }, style]}>
      {children}
    </Text>
  );
}

export function Input(props: TextInputProps & { style?: StyleProp<TextStyle> }) {
  const c = useColors();
  return (
    <TextInput
      placeholderTextColor={c.mutedForeground}
      {...props}
      style={[
        {
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: radius,
          backgroundColor: c.card,
          color: c.foreground,
          fontFamily: fonts.regular,
          fontSize: 15,
          paddingHorizontal: 12,
          minHeight: 44,
          paddingVertical: props.multiline ? 10 : 0,
          textAlignVertical: props.multiline ? "top" : "center",
        },
        props.style,
      ]}
    />
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Label>{label}</Label>
      {children}
    </View>
  );
}

export function Badge({ label, color, bg, border }: { label: string; color: string; bg: string; border?: string }) {
  return (
    <View
      style={{
        backgroundColor: bg,
        borderColor: border ?? bg,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
        alignSelf: "flex-start",
      }}
    >
      <Text weight="medium" size={11} style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

/** Bottom sheet dialog, the phone equivalent of the website's Dialog. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} onPress={onClose} />
        <View
          style={{
            backgroundColor: c.background,
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            maxHeight: "90%",
            paddingBottom: Math.max(insets.bottom, 12),
            width: "100%",
            maxWidth: 640,
            alignSelf: "center",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8 }}>
            <View style={{ flex: 1 }}>
              {typeof title === "string" ? (
                <Text weight="semibold" size={17}>
                  {title}
                </Text>
              ) : (
                title
              )}
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <X size={20} color={c.mutedForeground} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 12, gap: 14 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer && <View style={{ paddingHorizontal: 18, paddingTop: 8, gap: 8 }}>{footer}</View>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  placeholder = "Select",
  title,
  style,
}: {
  value: T | "" | null | undefined;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  placeholder?: string;
  title?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const [open, setOpen] = React.useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[
          {
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: radius,
            backgroundColor: c.card,
            minHeight: 40,
            paddingHorizontal: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          },
          style,
        ]}
      >
        <Text size={14} numberOfLines={1} style={{ flex: 1 }} muted={!current}>
          {current?.label ?? placeholder}
        </Text>
        <ChevronDown size={16} color={c.mutedForeground} />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title={title ?? placeholder}>
        <View>
          {options.map((o) => (
            <Pressable
              key={o.value}
              onPress={() => {
                onChange(o.value);
                setOpen(false);
              }}
              style={({ pressed }) => ({
                paddingVertical: 13,
                paddingHorizontal: 4,
                flexDirection: "row",
                alignItems: "center",
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: c.border,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={{ flex: 1 }} weight={o.value === value ? "semibold" : "regular"}>
                {o.label}
              </Text>
              {o.value === value && <Check size={18} color={c.accent} />}
            </Pressable>
          ))}
        </View>
      </Sheet>
    </>
  );
}

/** Page title block used at the top of each screen, like the website's h1 + subtitle. */
export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ flex: 1 }}>
        <Text weight="bold" size={22} style={{ letterSpacing: -0.3 }}>
          {title}
        </Text>
        {!!subtitle && (
          <Text muted size={13} style={{ marginTop: 2 }}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </View>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Text muted size={14} style={{ textAlign: "center", paddingVertical: 28 }}>
      {children}
    </Text>
  );
}

export function Divider() {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />;
}
