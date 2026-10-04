import { useEffect, useMemo, useState } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { File, Paths } from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { invokeFunction, supabase } from "@/lib/supabase";
import { useApartments, useBuildings } from "@/hooks/data";
import type { Inspection, InspectionResult, InspectionTemplate } from "@/lib/types";

// Checkout inspections (mobile_inspections). The backend creates one for every
// checkout each day. Inspectors often work without signal, so every change is
// first saved on the phone as a draft and sent to Supabase when there is a
// connection (see syncInspections).

export const PHOTO_BUCKET = "mobile-inspection-photos";
const DRAFT_PREFIX = "insp-draft:";
const CACHE_PREFIX = "insp-cache:";

export interface Draft {
  results: InspectionResult[];
  general_notes: string | null;
  summary: string | null;
  /** Finish was pressed; complete the inspection once everything is uploaded. */
  complete: boolean;
  started_at: string;
  inspector_id: string | null;
}

// ---------- Offline cache for lists ----------

async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  try {
    const data = await fetcher();
    AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data)).catch(() => {});
    return data;
  } catch (e) {
    const saved = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (saved) return JSON.parse(saved) as T;
    throw e;
  }
}

const SELECT = "*";

export interface InspectionFilters {
  status: "open" | "completed";
  apartmentId?: string;
  from?: string;
  to?: string;
}

export function useInspections(f: InspectionFilters) {
  return useQuery({
    queryKey: ["inspections", f],
    queryFn: () =>
      cached(`list:${JSON.stringify(f)}`, async () => {
        let q = supabase.from("mobile_inspections").select(SELECT);
        if (f.status === "open") q = q.neq("status", "completed").order("due_date", { ascending: true });
        else q = q.eq("status", "completed").order("due_date", { ascending: false }).limit(200);
        if (f.apartmentId) q = q.eq("apartment_id", f.apartmentId);
        if (f.from) q = q.gte("due_date", f.from);
        if (f.to) q = q.lte("due_date", f.to);
        const { data, error } = await q;
        if (error) throw error;
        return data as Inspection[];
      }),
  });
}

export function useInspection(id: string | undefined) {
  return useQuery({
    queryKey: ["inspections", "one", id],
    enabled: !!id,
    queryFn: () =>
      cached(`one:${id}`, async () => {
        const { data, error } = await supabase.from("mobile_inspections").select(SELECT).eq("id", id!).single();
        if (error) throw error;
        return data as Inspection;
      }),
  });
}

/** The previous completed inspection of the same apartment, for "what changed". */
export function usePreviousInspection(insp: Inspection | undefined) {
  return useQuery({
    queryKey: ["inspections", "previous", insp?.id],
    enabled: !!insp,
    queryFn: () =>
      cached(`prev:${insp!.id}`, async () => {
        const { data, error } = await supabase
          .from("mobile_inspections")
          .select(SELECT)
          .eq("apartment_id", insp!.apartment_id)
          .eq("status", "completed")
          .neq("id", insp!.id)
          .lt("due_date", insp!.due_date)
          .order("due_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return (data as Inspection) ?? null;
      }),
  });
}

export function useTemplate(id: string | null | undefined) {
  return useQuery({
    queryKey: ["inspection-template", id ?? "default"],
    queryFn: () =>
      cached(`tpl:${id ?? "default"}`, async () => {
        let q = supabase.from("mobile_inspection_templates").select("*");
        q = id ? q.eq("id", id) : q.eq("is_default", true);
        const { data, error } = await q.limit(1).maybeSingle();
        if (error) throw error;
        return data as InspectionTemplate | null;
      }),
  });
}

// ---------- Drafts ----------

export async function loadDraft(id: string): Promise<Draft | null> {
  const s = await AsyncStorage.getItem(DRAFT_PREFIX + id);
  return s ? (JSON.parse(s) as Draft) : null;
}

export async function saveDraft(id: string, draft: Draft) {
  await AsyncStorage.setItem(DRAFT_PREFIX + id, JSON.stringify(draft));
}

export async function pendingDraftIds(): Promise<string[]> {
  const keys = await AsyncStorage.getAllKeys();
  return keys.filter((k) => k.startsWith(DRAFT_PREFIX)).map((k) => k.slice(DRAFT_PREFIX.length));
}

/** Count of inspections with changes not yet sent, for the "waiting to upload" banner. */
export function usePendingCount() {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const tick = () => pendingDraftIds().then((ids) => alive && setN(ids.length));
    tick();
    const t = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return n;
}

// ---------- Photos ----------

export const isLocalPhoto = (p: string) => p.startsWith("file:") || p.startsWith("content:") || p.startsWith("blob:") || p.startsWith("data:");

const KEPT_PREFIX = "insp-photos:";

/** Shrinks a photo and keeps a copy in the app's documents so it survives until uploaded. */
export async function keepPhoto(inspectionId: string, uri: string): Promise<string> {
  const small = await manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: 0.7, format: SaveFormat.JPEG });
  if (Platform.OS === "web") return small.uri;
  const dest = new File(Paths.document, `insp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
  new File(small.uri).copy(dest);
  // Remember every phone copy per inspection, so copies of photos removed before
  // upload are cleaned up too.
  await AsyncStorage.setItem(KEPT_PREFIX + inspectionId, JSON.stringify([...(await keptPhotos(inspectionId)), { uri: dest.uri, at: Date.now() }]));
  return dest.uri;
}

const UPLOADED_KEY = "insp-uploaded";

async function uploadedMap(): Promise<Record<string, string>> {
  const s = await AsyncStorage.getItem(UPLOADED_KEY);
  return s ? JSON.parse(s) : {};
}

/** Uploads a phone photo once; the phone path to storage path mapping is remembered across retries. */
async function uploadPhoto(inspectionId: string, localUri: string): Promise<string> {
  const done = await uploadedMap();
  if (done[localUri]) return done[localUri];
  const body = Platform.OS === "web" ? await (await fetch(localUri)).arrayBuffer() : await new File(localUri).arrayBuffer();
  const path = `${inspectionId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, body, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  await AsyncStorage.setItem(UPLOADED_KEY, JSON.stringify({ ...(await uploadedMap()), [localUri]: path }));
  return path;
}

async function keptPhotos(inspectionId: string) {
  return JSON.parse((await AsyncStorage.getItem(KEPT_PREFIX + inspectionId)) ?? "[]") as { uri: string; at: number }[];
}

/**
 * Deletes the given phone copies of an inspection's photos once its draft is
 * saved in Supabase. Only copies that existed when the upload started are
 * passed in, so a photo taken during the upload is never deleted.
 */
async function forgetLocalPhotos(inspectionId: string, uris: Set<string>) {
  // The phone path -> storage path map is kept, so a screen still showing the
  // phone path maps it to the uploaded file instead of losing the photo.
  for (const u of uris) {
    if (Platform.OS !== "web") {
      try {
        new File(u).delete();
      } catch {
        // Already gone.
      }
    }
  }
  const stay = (await keptPhotos(inspectionId)).filter((k) => !uris.has(k.uri));
  if (stay.length) await AsyncStorage.setItem(KEPT_PREFIX + inspectionId, JSON.stringify(stay));
  else await AsyncStorage.removeItem(KEPT_PREFIX + inspectionId);
}

/** Short-lived links for showing private photos. */
export function usePhotoUrls(paths: string[]) {
  const remote = paths.filter((p) => !isLocalPhoto(p));
  const q = useQuery({
    queryKey: ["photo-urls", remote],
    enabled: remote.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(remote, 3600);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
      return map;
    },
  });
  const map = q.data ?? {};
  return paths.map((p) => (isLocalPhoto(p) ? p : map[p])).filter(Boolean) as string[];
}

// ---------- Sync ----------

let syncing: Promise<void> | null = null;
const listeners = new Set<(id: string) => void>();

/** Called with an inspection id each time its draft has been fully sent. */
export function onInspectionSynced(fn: (id: string) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Sends every saved draft to Supabase. Safe to call any time; drafts stay on the phone until they're sent. */
export function syncInspections(qc?: QueryClient): Promise<void> {
  if (syncing) return syncing;
  syncing = (async () => {
    for (const id of await pendingDraftIds()) {
      try {
        await syncOne(id);
      } catch (e) {
        console.warn("Inspection sync waiting:", id, (e as Error).message);
      }
    }
    qc?.invalidateQueries({ queryKey: ["inspections"] });
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

async function syncOne(id: string) {
  const keptAtStart = new Set((await keptPhotos(id)).map((k) => k.uri));
  const draft = await loadDraft(id);
  if (!draft) return;

  // Upload photos first. The draft on the phone keeps the phone paths (the
  // screen may still be editing it); the row in Supabase gets storage paths.
  const results: InspectionResult[] = [];
  for (const r of draft.results) {
    const photos: string[] = [];
    for (const p of r.photos) {
      if (isLocalPhoto(p)) {
        // A phone copy that no longer exists was already sent and cleaned up; skip it.
        if (Platform.OS !== "web" && !new File(p).exists && !(await uploadedMap())[p]) continue;
        photos.push(await uploadPhoto(id, p));
      } else photos.push(p);
    }
    results.push({ ...r, photos });
  }

  const { error } = await supabase
    .from("mobile_inspections")
    .update({
      results,
      general_notes: draft.general_notes,
      summary: draft.summary,
      inspector_id: draft.inspector_id,
      started_at: draft.started_at,
      ...(draft.complete ? {} : { status: "in_progress" }),
    })
    .eq("id", id);
  if (error) throw error;

  if (draft.complete) await invokeFunction("mobile-inspection-complete", { inspection_id: id });

  // Only clear the draft if nothing changed on the phone while we were sending.
  const latest = await loadDraft(id);
  if (latest && JSON.stringify(latest) === JSON.stringify(draft)) {
    await AsyncStorage.removeItem(DRAFT_PREFIX + id);
    await forgetLocalPhotos(id, keptAtStart);
    listeners.forEach((fn) => fn(id));
  }
}

/** Retries sending drafts when the connection returns or the app comes back to the front. */
export function useInspectionSync() {
  const qc = useQueryClient();
  useEffect(() => {
    syncInspections(qc);
    const net = NetInfo.addEventListener((s) => {
      if (s.isConnected) syncInspections(qc);
    });
    const app = AppState.addEventListener("change", (s) => {
      if (s === "active") syncInspections(qc);
    });
    const t = setInterval(() => syncInspections(qc), 60_000);
    return () => {
      net();
      app.remove();
      clearInterval(t);
    };
  }, [qc]);
}

export async function writeSummary(id: string): Promise<string> {
  const { summary } = await invokeFunction<{ summary: string }>("mobile-inspection-summary", { inspection_id: id });
  return summary;
}

export { issuesOf } from "@/lib/inspectionDraft";

/** "Building – Apartment" names, as the website shows units. */
export function useUnitLabel() {
  const { data: apartments = [] } = useApartments();
  const { data: buildings = [] } = useBuildings();
  return useMemo(() => {
    const bName = Object.fromEntries(buildings.map((b) => [b.id, b.name]));
    const map: Record<string, string> = Object.fromEntries(
      apartments.map((a) => [a.id, bName[a.building_id] ? `${bName[a.building_id]} – ${a.name}` : a.name]),
    );
    return { label: (id: string) => map[id] ?? "Unit", options: apartments.map((a) => ({ value: a.id, label: map[a.id] })) };
  }, [apartments, buildings]);
}

