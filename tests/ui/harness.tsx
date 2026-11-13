// Renders real app screens with react-test-renderer against an in-memory
// Supabase (tests/fakeSupabase.ts), so the real hooks, queries and permission
// rules run end to end. Native modules are replaced in tests/ui/setup.ts.
import React from "react";
import TestRenderer, { act, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";

// React Query hands results to components on a setTimeout(0); run that
// straight away so a settled screen always shows its loaded data.
notifyManager.setScheduler((cb) => cb());
import { FakeSupabase } from "../fakeSupabase";

export type Role = "super_admin" | "admin" | "owner";

export interface Perms {
  access_all_units?: boolean;
  show_financial?: boolean;
  show_contacts?: boolean;
  can_edit_reservations?: boolean;
  can_add_reservations?: boolean;
}

/** A fresh database with one signed-in user of the given type. */
export function setup(role: Role, perms: Perms = {}, tables: Record<string, Record<string, any>[]> = {}) {
  const db = new FakeSupabase();
  const userId = "me";
  db.tables.user_roles = role === "owner" ? [] : [{ user_id: userId, role }];
  db.tables.user_permissions = [{ user_id: userId, ...perms }];
  for (const [t, rows] of Object.entries(tables)) db.tables[t] = rows.map((r) => ({ ...r }));
  (globalThis as any).__db = db;
  (globalThis as any).__user = { id: userId, email: "me@arami.app" };
  const nav = (globalThis as any).__nav;
  nav.pushes = [];
  nav.options = {};
  (globalThis as any).__printed = [];
  (globalThis as any).__shared = [];
  return db;
}

export function setParams(p: Record<string, string>) {
  (globalThis as any).__nav.params = p;
}
export const pushes = () => (globalThis as any).__nav.pushes as unknown[];
export const navOptions = () => (globalThis as any).__nav.options as Record<string, any>;

/** Lets queries settle: several rounds of resolved promises inside act. */
let current: QueryClient | null = null;

/**
 * Lets the screen settle: flushes until no query or mutation is running (and
 * at least twice, so effects that start new queries get their turn).
 */
export async function settle(minRounds = 2) {
  for (let i = 0; i < 200; i++) {
    await act(async () => {
      await new Promise((r) => setImmediate(r));
    });
    const busy = current ? current.isFetching() + current.isMutating() : 0;
    if (i + 1 >= minRounds && busy === 0) return;
  }
  throw new Error("screen never settled");
}

export async function render(el: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity, refetchInterval: false as any } } });
  current = qc;
  let r!: ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<QueryClientProvider client={qc}>{el}</QueryClientProvider>);
  });
  await settle();
  return { r, qc, unmount: () => act(() => r.unmount()) };
}

/** Every piece of visible text, joined by " | " (Text children flattened). */
export function textOf(node: ReactTestRenderer | ReactTestInstance): string {
  const root = "root" in node ? node.root : node;
  const out: string[] = [];
  const walk = (n: ReactTestInstance | string) => {
    if (typeof n === "string") return void out.push(n);
    if ((n.type as unknown) === "Text") return void out.push(flat(n));
    for (const c of n.children) walk(c as any);
  };
  const flat = (n: ReactTestInstance | string): string => (typeof n === "string" ? n : n.children.map((c) => flat(c as any)).join(""));
  walk(root);
  return out.join(" | ");
}

export const hosts = (r: ReactTestRenderer, type: string) => r.root.findAll((n) => n.type === type);

/** The nearest pressable (host Pressable or anything with onPress) containing the text. */
export function pressableWith(r: ReactTestRenderer, text: string | RegExp): ReactTestInstance {
  const matches = r.root.findAll((n) => typeof n.type === "string" && typeof n.props.onPress === "function" && (typeof text === "string" ? textOf(n).includes(text) : text.test(textOf(n))));
  if (!matches.length) throw new Error(`nothing pressable with ${text}\n${textOf(r)}`);
  // innermost
  return matches.sort((a, b) => depth(b) - depth(a))[0];
}
const depth = (n: ReactTestInstance) => {
  let d = 0;
  for (let p = n.parent; p; p = p.parent) d++;
  return d;
};

export function byLabel(r: ReactTestRenderer, label: string) {
  return r.root.findAll((n) => typeof n.type === "string" && n.props.accessibilityLabel === label);
}

export async function press(node: ReactTestInstance) {
  await act(async () => {
    await node.props.onPress?.();
  });
  await settle();
}

export async function type(node: ReactTestInstance, value: string) {
  await act(async () => {
    node.props.onChangeText?.(value);
  });
}

// ---- fixtures ----

export const BUILDINGS = [
  { id: "b1", user_id: "x", name: "Marina Gate", address: "Dubai Marina", created_at: "2025-01-01T00:00:00Z" },
  { id: "b2", user_id: "x", name: "Bay Square", address: "Business Bay", created_at: "2025-01-02T00:00:00Z" },
];
export const APARTMENTS = [
  { id: "a1", user_id: "x", building_id: "b1", name: "1204", type: "1BR", max_guests: 3, room_type_id: null, created_at: "2025-01-01T00:00:00Z" },
  { id: "a2", user_id: "x", building_id: "b1", name: "1501", type: "2BR", max_guests: 5, room_type_id: "g1", created_at: "2025-01-02T00:00:00Z" },
  { id: "a3", user_id: "x", building_id: "b2", name: "B-302", type: "Studio", max_guests: 2, room_type_id: "g1", created_at: "2025-01-03T00:00:00Z" },
  { id: "a4", user_id: "x", building_id: "b2", name: "B-410", type: "3BR", max_guests: 7, room_type_id: null, created_at: "2025-01-04T00:00:00Z" },
];

export const isoShift = (iso: string, n: number) => {
  const d = new Date(Date.parse(iso));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
