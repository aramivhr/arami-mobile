// Stand-in for react-native in tests. Logic tests only need Platform and
// AppState; the screen tests render components with react-test-renderer, so
// each primitive becomes a plain host element named after it, keeping its
// props (onPress, style, accessibilityLabel...) for the tests to inspect.
import React from "react";

export const Platform = { OS: "ios" as string, select: (o: Record<string, unknown>) => o.ios ?? o.default };
export const AppState = { addEventListener: () => ({ remove() {} }), currentState: "active" };

const host = (name: string) => {
  const C = React.forwardRef((props: Record<string, unknown>, ref) => React.createElement(name, { ...props, ref }));
  C.displayName = name;
  return C;
};

export const View = host("View");
export const Text = host("Text");
export const TextInput = host("TextInput");
export const Image = host("Image");
export const ActivityIndicator = host("ActivityIndicator");
export const Switch = host("Switch");
export const RefreshControl = host("RefreshControl");
export const KeyboardAvoidingView = host("KeyboardAvoidingView");

export function Pressable({ children, style, ...props }: Record<string, any>) {
  const state = { pressed: false };
  return React.createElement(
    "Pressable",
    { ...props, style: typeof style === "function" ? style(state) : style },
    typeof children === "function" ? children(state) : children,
  );
}
export const TouchableOpacity = Pressable;

export const ScrollView = React.forwardRef(({ children, refreshControl, ...props }: Record<string, any>, ref) => {
  React.useImperativeHandle(ref, () => ({ scrollTo() {}, scrollToEnd() {} }));
  return React.createElement("ScrollView", props, refreshControl, children);
});

export const FlatList = React.forwardRef((p: Record<string, any>, ref) => {
  React.useImperativeHandle(ref, () => ({ scrollToEnd() {}, scrollToOffset() {}, scrollToIndex() {} }));
  const { data = [], renderItem, keyExtractor, ListEmptyComponent, ListHeaderComponent, ListFooterComponent, refreshControl, ...props } = p;
  const el = (c: any) => (c == null ? null : React.isValidElement(c) ? c : React.createElement(c));
  return React.createElement(
    "FlatList",
    props,
    refreshControl,
    el(ListHeaderComponent),
    data.length
      ? data.map((item: any, index: number) =>
          React.createElement(React.Fragment, { key: keyExtractor ? keyExtractor(item, index) : index }, renderItem({ item, index })),
        )
      : el(ListEmptyComponent),
    el(ListFooterComponent),
  );
});
export const SectionList = FlatList;

export function Modal({ visible, children, ...props }: Record<string, any>) {
  return visible ? React.createElement("Modal", props, children) : null;
}

export const StyleSheet = {
  create: <T,>(s: T) => s,
  hairlineWidth: 1,
  absoluteFill: {},
  absoluteFillObject: {},
  flatten: (s: unknown) => (Array.isArray(s) ? Object.assign({}, ...s.flat(Infinity).filter(Boolean)) : s ?? {}),
};

export const Alert = { alert: (..._args: unknown[]) => {} };
export const Vibration = { vibrate: (..._args: unknown[]) => {}, cancel() {} };
export const Share = { share: async (..._args: unknown[]) => ({ action: "sharedAction" }) };
export const Linking = { openURL: async (_u: string) => true, canOpenURL: async () => true };
export const Keyboard = { dismiss() {}, addListener: () => ({ remove() {} }) };
export const Dimensions = { get: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }), addEventListener: () => ({ remove() {} }) };

const screen = { width: 390, height: 844, scale: 3, fontScale: 1 };
export function useWindowDimensions() {
  return (globalThis as any).__window ?? screen;
}
export function useColorScheme() {
  return (globalThis as any).__scheme ?? "light";
}
export const Appearance = { getColorScheme: () => (globalThis as any).__scheme ?? "light", addChangeListener: () => ({ remove() {} }) };
