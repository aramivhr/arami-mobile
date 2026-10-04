// In-memory file system for tests.
export const files = new Map<string, Uint8Array>();
export const Paths = { document: { uri: "file:///docs/" } };
export class File {
  uri: string;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = parts.map((p) => (typeof p === "string" ? p : p.uri)).join("").replace(/([^:/])\/\/+/g, "$1/");
  }
  get exists() {
    return files.has(this.uri);
  }
  async arrayBuffer() {
    const b = files.get(this.uri);
    if (!b) throw new Error(`no such file ${this.uri}`);
    return b.buffer;
  }
  copy(dest: File) {
    const b = files.get(this.uri);
    if (!b) throw new Error(`no such file ${this.uri}`);
    files.set(dest.uri, b);
  }
  delete() {
    if (!files.delete(this.uri)) throw new Error(`no such file ${this.uri}`);
  }
}
