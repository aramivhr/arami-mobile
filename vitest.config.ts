import { defineConfig } from "vitest/config";
import path from "node:path";

const stub = (n: string) => path.resolve(__dirname, "tests/stubs", n);

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], testTimeout: 20_000 },
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, "src/$1") },
      { find: "react-native", replacement: stub("react-native.ts") },
      { find: "@react-native-async-storage/async-storage", replacement: stub("async-storage.ts") },
      { find: "@react-native-community/netinfo", replacement: stub("netinfo.ts") },
      { find: "expo-file-system", replacement: stub("expo-file-system.ts") },
      { find: "expo-image-manipulator", replacement: stub("expo-image-manipulator.ts") },
      { find: "react-native-url-polyfill/auto", replacement: stub("empty.ts") },
      { find: "npm:@supabase/supabase-js@2", replacement: stub("deno-supabase.ts") },
    ],
  },
});
