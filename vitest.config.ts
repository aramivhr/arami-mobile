import { defineConfig } from "vitest/config";
import path from "node:path";

const stub = (n: string) => path.resolve(__dirname, "tests/stubs", n);

const resolve = {
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
};

// Metro turns require("x.png") into an asset id; in tests it becomes { uri }.
const assets = {
  name: "rn-assets",
  transform(code: string, id: string) {
    if (!/\/src\/.*\.tsx?$/.test(id) || !code.includes("require(")) return null;
    return code.replace(/require\((["'])([^"']+\.(?:png|jpe?g|gif|webp))\1\)/g, (_m, _q, p) => `({ uri: ${JSON.stringify(p)} })`);
  },
};

export default defineConfig({
  resolve,
  test: {
    testTimeout: 20_000,
    projects: [
      // Logic, website-parity and backend-function tests.
      { resolve, test: { name: "logic", include: ["tests/*.test.ts"], testTimeout: 20_000 } },
      // Screens rendered with react-test-renderer against an in-memory Supabase.
      { resolve, plugins: [assets], test: { name: "screens", include: ["tests/ui/**/*.test.tsx"], setupFiles: ["tests/ui/setup.ts"], testTimeout: 60_000 } },
    ],
  },
});
