import { files } from "./expo-file-system";
export const SaveFormat = { JPEG: "jpeg" };
let n = 0;
export async function manipulateAsync(uri: string, _actions: unknown[] = [], opts: { base64?: boolean } = {}) {
  const out = `file:///cache/small-${n++}.jpg`;
  files.set(out, files.get(uri) ?? new Uint8Array([1, 2, 3]));
  return { uri: out, width: 1600, height: 1200, ...(opts.base64 ? { base64: "QUJD" } : {}) };
}
