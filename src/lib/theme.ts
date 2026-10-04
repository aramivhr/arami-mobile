import { useColorScheme } from "react-native";

// Colors mirror the website's design tokens (src/index.css in rent-halo-system),
// so the app and the site look the same in both light and dark mode.
const light = {
  background: "hsl(220, 20%, 97%)",
  foreground: "hsl(222, 47%, 11%)",
  card: "hsl(0, 0%, 100%)",
  primary: "hsl(222, 47%, 16%)",
  primaryForeground: "hsl(45, 100%, 96%)",
  secondary: "hsl(220, 16%, 92%)",
  muted: "hsl(220, 16%, 94%)",
  mutedForeground: "hsl(220, 10%, 46%)",
  accent: "hsl(36, 95%, 52%)",
  accentForeground: "hsl(222, 47%, 11%)",
  destructive: "hsl(0, 72%, 51%)",
  success: "hsl(152, 60%, 40%)",
  warning: "hsl(36, 95%, 52%)",
  border: "hsl(220, 16%, 88%)",
  // Fixed colors the website uses directly (Tailwind palette)
  booked: "#2dd4bf", // teal-400
  blocked: "#e5e7eb", // gray-200
  blockedBorder: "#d1d5db", // gray-300
  emerald: "#10b981",
  sky: "#38bdf8",
  slate900: "#0f172a",
  amber500: "#f59e0b",
};

const dark: typeof light = {
  ...light,
  background: "hsl(222, 47%, 8%)",
  foreground: "hsl(220, 20%, 92%)",
  card: "hsl(222, 40%, 12%)",
  primary: "hsl(36, 95%, 52%)",
  primaryForeground: "hsl(222, 47%, 11%)",
  secondary: "hsl(222, 30%, 18%)",
  muted: "hsl(222, 30%, 18%)",
  mutedForeground: "hsl(220, 10%, 55%)",
  destructive: "hsl(0, 62%, 45%)",
  border: "hsl(222, 30%, 20%)",
  blocked: "#374151",
  blockedBorder: "#4b5563",
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}

export const fonts = {
  regular: "DMSans_400Regular",
  medium: "DMSans_500Medium",
  semibold: "DMSans_600SemiBold",
  bold: "DMSans_700Bold",
};

export const radius = 10; // --radius: 0.625rem
