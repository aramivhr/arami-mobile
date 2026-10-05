// Native-only modules the screens import, replaced for the screen tests.
import { vi } from "vitest";
import React from "react";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("lucide-react-native", () => {
  const cache: Record<string, unknown> = {};
  return new Proxy(
    { __esModule: true },
    {
      get: (t: any, name: string) => {
        if (name in t) return t[name];
        if (name === "then") return undefined;
        return (cache[name] ??= Object.assign((props: Record<string, unknown>) => React.createElement("Icon", { name, ...props }), { displayName: name }));
      },
      has: () => true,
    },
  );
});

export const nav = { pushes: [] as unknown[], options: {} as Record<string, unknown>, params: {} as Record<string, string> };
(globalThis as any).__nav = nav;

vi.mock("expo-router", () => {
  const n = () => (globalThis as any).__nav;
  const router = { push: (t: unknown) => n().pushes.push(t), replace: (t: unknown) => n().pushes.push(t), back: () => n().pushes.push("back") };
  return {
    router,
    useRouter: () => router,
    useLocalSearchParams: () => n().params,
    useNavigation: () => ({ setOptions: (o: Record<string, unknown>) => Object.assign(n().options, o) }),
    Link: ({ children }: { children: React.ReactNode }) => React.createElement("Link", null, children),
    Redirect: ({ href }: { href: unknown }) => React.createElement("Redirect", { href }),
    Stack: Object.assign(({ children }: { children: React.ReactNode }) => children ?? null, { Screen: () => null }),
    Tabs: Object.assign(({ children }: { children: React.ReactNode }) => children ?? null, { Screen: () => null }),
  };
});

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaView: ({ children }: { children: React.ReactNode }) => React.createElement("SafeAreaView", null, children),
}));

vi.mock("expo-print", () => ({
  printToFileAsync: async ({ html }: { html: string }) => {
    (globalThis as any).__printed = [...((globalThis as any).__printed ?? []), html];
    return { uri: "file:///tmp/out.pdf" };
  },
}));
vi.mock("expo-sharing", () => ({
  isAvailableAsync: async () => true,
  shareAsync: async (uri: string) => {
    (globalThis as any).__shared = [...((globalThis as any).__shared ?? []), uri];
  },
}));
vi.mock("expo-constants", () => ({ default: { executionEnvironment: "storeClient", expoConfig: { extra: {} } } }));
vi.mock("expo-notifications", () => ({
  setNotificationHandler: () => {},
  getPermissionsAsync: async () => ({ status: "granted" }),
  requestPermissionsAsync: async () => ({ status: "granted" }),
  getExpoPushTokenAsync: async () => ({ data: "ExponentPushToken[test]" }),
  setNotificationChannelAsync: async () => {},
  addNotificationResponseReceivedListener: () => ({ remove() {} }),
  getLastNotificationResponseAsync: async () => null,
  AndroidImportance: { HIGH: 4 },
}));
vi.mock("expo-device", () => ({ isDevice: false }));
vi.mock("expo-local-authentication", () => ({
  hasHardwareAsync: async () => false,
  isEnrolledAsync: async () => false,
  supportedAuthenticationTypesAsync: async () => [],
  authenticateAsync: async () => ({ success: true }),
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2 },
}));
vi.mock("expo-secure-store", () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));
vi.mock("expo-image-picker", () => ({ launchCameraAsync: async () => ({ canceled: true }), launchImageLibraryAsync: async () => ({ canceled: true }), requestCameraPermissionsAsync: async () => ({ granted: true }) }));

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return (globalThis as any).__db;
  },
  invokeFunction: async (name: string, body: Record<string, unknown>) => {
    const { data, error } = await (globalThis as any).__db.functions.invoke(name, { body });
    if (error) throw error;
    if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "Request failed");
    return data;
  },
}));
vi.mock("@/hooks/auth", () => ({
  useAuth: () => ({ user: (globalThis as any).__user ?? null, session: (globalThis as any).__user ? {} : null, loading: false, logout: async () => {}, login: async () => ({ error: null }) }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// react-test-renderer prints a deprecation notice on every render; it is still
// the only renderer for react-native-style trees, so keep the output readable.
const origError = console.error;
console.error = (...a: unknown[]) => {
  if (typeof a[0] === "string" && a[0].includes("react-test-renderer is deprecated")) return;
  origError(...a);
};
