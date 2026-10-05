import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, View } from "react-native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Camera, Check, ChevronDown, ChevronRight, ImagePlus, Share2, Sparkles, X } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { Badge, Button, Card, Input, Label, Text } from "@/components/ui";
import { withAlpha } from "@/components/badges";
import { RequireScreen } from "@/components/RequireScreen";
import { useAuth } from "@/hooks/auth";
import {
  issuesOf,
  keepPhoto,
  loadDraft,
  onInspectionSynced,
  photoDataUris,
  saveDraft,
  syncInspections,
  useInspection,
  usePhotoUrls,
  usePreviousInspection,
  useTemplate,
  useUnitLabel,
  writeSummary,
  type Draft,
} from "@/hooks/inspections";
import { conditionText, inspectionReportHtml } from "@/lib/inspectionReport";
import { KEYS_ROOM, applyResult, keyOf, markRestOk, progress, withKeysSection } from "@/lib/inspectionDraft";
import { dateTime, prettyDate } from "@/lib/dates";
import { useColors } from "@/lib/theme";
import type { Inspection, InspectionResult, ItemCondition } from "@/lib/types";

// One checkout inspection: a room-by-room checklist with notes and photos,
// an AI-written report, and Finish. Every change is kept on the phone first
// (works without signal) and uploads in the background.

export default function InspectionRoute() {
  return (
    <RequireScreen screen="inspections">
      <InspectionScreen />
    </RequireScreen>
  );
}

const CONDITIONS: { key: ItemCondition; label: string }[] = [
  { key: "ok", label: "OK" },
  { key: "dirty", label: "Dirty" },
  { key: "damaged", label: "Damaged" },
  { key: "missing", label: "Missing" },
];


function fromServer(insp: Inspection, userId: string | null): Draft {
  return {
    results: insp.results ?? [],
    general_notes: insp.general_notes,
    summary: insp.summary,
    complete: false,
    started_at: insp.started_at ?? new Date().toISOString(),
    inspector_id: insp.inspector_id ?? userId,
  };
}

function InspectionScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useInspection(id);
  const insp = q.data;
  const tplQ = useTemplate(insp?.template_id);
  const prevQ = usePreviousInspection(insp);
  const units = useUnitLabel();
  const unit = insp ? units.label(insp.apartment_id) : "";

  const [draft, setDraft] = useState<Draft | null>(null);
  const [hasLocal, setHasLocal] = useState(false);
  const [openRoom, setOpenRoom] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: unit || "Inspection" });
  }, [navigation, unit]);

  // Start from the phone's saved draft if there is one, otherwise from Supabase.
  useEffect(() => {
    if (!insp || draft) return;
    loadDraft(insp.id).then((d) => {
      setHasLocal(!!d);
      setDraft(d ?? fromServer(insp, user?.id ?? null));
    });
  }, [insp?.id, draft, user?.id]);

  // When this inspection's draft finishes uploading, show what Supabase now has.
  useEffect(
    () =>
      onInspectionSynced((syncedId) => {
        if (syncedId !== id) return;
        setHasLocal(false);
        q.refetch().then((r) => r.data && setDraft(fromServer(r.data, user?.id ?? null)));
      }),
    [id, user?.id],
  );

  const rooms = useMemo(() => {
    if (tplQ.data?.rooms?.length) return withKeysSection(tplQ.data.rooms);
    // No template: show whatever rooms the results already have.
    const seen = new Map<string, string[]>();
    for (const r of draft?.results ?? []) seen.set(r.room, [...(seen.get(r.room) ?? []), r.item]);
    return withKeysSection([...seen].map(([room, items]) => ({ room, items })));
  }, [tplQ.data, draft?.results]);

  const { total, checked } = progress(rooms, draft?.results ?? []);
  const byKey = useMemo(() => new Map((draft?.results ?? []).map((r) => [keyOf(r.room, r.item), r])), [draft?.results]);
  const prevByKey = useMemo(() => new Map((prevQ.data?.results ?? []).map((r) => [keyOf(r.room, r.item), r])), [prevQ.data]);

  const update = useCallback(
    (fn: (d: Draft) => Draft) => {
      setDraft((cur) => {
        if (!cur || !id) return cur;
        const next = fn(cur);
        setHasLocal(true);
        saveDraft(id, next).then(() => {
          if (syncTimer.current) clearTimeout(syncTimer.current);
          syncTimer.current = setTimeout(() => syncInspections(qc), 2500);
        });
        return next;
      });
    },
    [id, qc],
  );

  const setResult = (room: string, item: string, patch: Partial<InspectionResult>) =>
    update((d) => ({ ...d, results: applyResult(d.results, room, item, patch) }));

  const allOk = (room: string, items: string[]) => update((d) => ({ ...d, results: markRestOk(d.results, room, items) }));

  const addPhoto = async (room: string, item: string, source: "camera" | "library") => {
    try {
      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return Alert.alert("Camera access is off", "Allow camera access for Arami Portal in Settings.");
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.8 };
      const res = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets?.[0]) return;
      const uri = await keepPhoto(id!, res.assets[0].uri);
      // Add to the item as it is now, not as it was when the camera opened.
      update((d) => {
        const cur = d.results.find((r) => r.room === room && r.item === item);
        return { ...d, results: applyResult(d.results, room, item, { photos: [...(cur?.photos ?? []), uri] }) };
      });
    } catch (e) {
      Alert.alert("Couldn't add the photo", (e as Error).message);
    }
  };

  const generate = async () => {
    if (!id) return;
    setWriting(true);
    try {
      // The report is written from what Supabase has, so send the latest changes first.
      await syncInspections(qc);
      if (await loadDraft(id)) await syncInspections(qc);
      if (await loadDraft(id)) {
        Alert.alert("Not uploaded yet", "The report needs a connection. Your changes are saved on this phone; try again when you're online.");
        return;
      }
      const summary = await writeSummary(id);
      update((d) => ({ ...d, summary }));
    } catch (e) {
      Alert.alert("Couldn't write the report", (e as Error).message);
    } finally {
      setWriting(false);
    }
  };

  const finish = () => {
    const missing = total - checked;
    const go = async () => {
      if (!id || !draft) return;
      const next = { ...draft, complete: true };
      setDraft(next);
      setHasLocal(true);
      await saveDraft(id, next);
      await syncInspections(qc);
      if (await loadDraft(id)) await syncInspections(qc);
      const left = await loadDraft(id);
      if (left) Alert.alert("Saved on this phone", "The inspection will be finished and uploaded when you're back online.");
      router.back();
    };
    Alert.alert(
      "Finish inspection?",
      missing > 0
        ? `${missing} item${missing === 1 ? " is" : "s are"} not checked and will be left out. Damaged or missing items create a task and alert super admins.`
        : "Damaged or missing items create a task and alert super admins.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Finish", onPress: go },
      ],
    );
  };

  if (!insp || !draft) {
    return (
      <Screen>
        <Text muted>{q.isError ? "Couldn't load this inspection." : "Loading..."}</Text>
      </Screen>
    );
  }

  const done = insp.status === "completed" && !draft.complete;
  const finishing = draft.complete;
  const readOnly = done || finishing;
  const issues = issuesOf(draft.results);

  return (
    <Screen onRefresh={hasLocal ? undefined : () => q.refetch().then((r) => r.data && setDraft(fromServer(r.data, user?.id ?? null)))} refreshing={q.isRefetching}>
      <Card style={{ padding: 14, gap: 6 }}>
        <Text weight="semibold" size={16}>
          {unit}
        </Text>
        <Text muted size={13}>
          {insp.guest_name ?? "Guest"} · {insp.check_in ? prettyDate(insp.check_in) : "—"} – {insp.check_out ? prettyDate(insp.check_out) : "—"}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {insp.urgent && !done && <Badge label="Urgent: guest arriving today" color={c.destructive} bg={withAlpha(c.destructive, 0.12)} />}
          {done && (
            <Badge
              label={insp.damage_found ? "Damage or missing items" : "Completed"}
              color={insp.damage_found ? c.destructive : c.success}
              bg={withAlpha(insp.damage_found ? c.destructive : c.success, 0.12)}
            />
          )}
          {finishing && <Badge label="Finishing when online" color={c.accent} bg={withAlpha(c.accent, 0.12)} />}
          {hasLocal && !finishing && <Badge label="Saved on phone" color={c.accent} bg={withAlpha(c.accent, 0.12)} />}
        </View>
        {done && insp.completed_at && (
          <Text muted size={12}>
            Completed {dateTime(insp.completed_at)}
          </Text>
        )}
        {!readOnly && (
          <View style={{ gap: 6, marginTop: 4 }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: c.muted, overflow: "hidden" }}>
              <View style={{ width: `${total ? (checked / total) * 100 : 0}%`, height: 6, backgroundColor: c.accent }} />
            </View>
            <Text muted size={12}>
              {checked} of {total} items checked{issues.length ? ` · ${issues.length} need attention` : ""}
            </Text>
          </View>
        )}
      </Card>

      {readOnly && <ReportView insp={insp} draft={draft} unit={unit} />}

      {!readOnly &&
        rooms.map(({ room, items }) => {
          const roomChecked = items.filter((i) => byKey.has(keyOf(room, i))).length;
          const roomIssues = items.filter((i) => (byKey.get(keyOf(room, i))?.condition ?? "ok") !== "ok").length;
          const expanded = openRoom === room;
          return (
            <Card key={room}>
              <Pressable onPress={() => setOpenRoom(expanded ? null : room)} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14 }}>
                {expanded ? <ChevronDown size={18} color={c.mutedForeground} /> : <ChevronRight size={18} color={c.mutedForeground} />}
                <Text weight="semibold" style={{ flex: 1 }}>
                  {room}
                </Text>
                {roomIssues > 0 && <Badge label={`${roomIssues} issue${roomIssues === 1 ? "" : "s"}`} color={c.destructive} bg={withAlpha(c.destructive, 0.12)} />}
                <Text muted size={12}>
                  {roomChecked}/{items.length}
                </Text>
                {roomChecked === items.length && <Check size={16} color={c.success} />}
              </Pressable>
              {expanded && (
                <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 14 }}>
                  {roomChecked < items.length && <Button title="Mark the rest OK" variant="outline" size="sm" onPress={() => allOk(room, items)} />}
                  {items.map((item) => (
                    <ItemRow
                      key={item}
                      item={item}
                      keys={room === KEYS_ROOM}
                      result={byKey.get(keyOf(room, item))}
                      previous={prevByKey.get(keyOf(room, item))}
                      onChange={(patch) => setResult(room, item, patch)}
                      onAddPhoto={(src) => addPhoto(room, item, src)}
                    />
                  ))}
                </View>
              )}
            </Card>
          );
        })}

      {!readOnly && (
        <>
          <Card style={{ padding: 14, gap: 8 }}>
            <Label>General notes</Label>
            <Input
              value={draft.general_notes ?? ""}
              onChangeText={(t) => update((d) => ({ ...d, general_notes: t || null }))}
              placeholder="Anything else worth noting"
              multiline
              style={{ minHeight: 70, textAlignVertical: "top" }}
            />
          </Card>
          <Card style={{ padding: 14, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Label style={{ flex: 1, marginBottom: 0 }}>Report</Label>
              <Button
                title={draft.summary ? "Rewrite" : "Write report"}
                size="sm"
                variant="outline"
                icon={writing ? undefined : <Sparkles size={14} color={c.accent} />}
                loading={writing}
                onPress={generate}
              />
            </View>
            <Input
              value={draft.summary ?? ""}
              onChangeText={(t) => update((d) => ({ ...d, summary: t || null }))}
              placeholder="Tap Write report to have AI write it from the checklist, or type it here."
              multiline
              style={{ minHeight: 110, textAlignVertical: "top" }}
            />
          </Card>
          <Button title="Finish inspection" onPress={finish} />
        </>
      )}
    </Screen>
  );
}

const KEY_CHOICES: { key: string; label: string; patch: Partial<InspectionResult>; on: (r?: InspectionResult) => boolean }[] = [
  { key: "ok", label: "Returned", patch: { condition: "ok" }, on: (r) => r?.condition === "ok" && r.count !== 0 },
  { key: "none", label: "None", patch: { condition: "ok", count: 0 }, on: (r) => r?.condition === "ok" && r.count === 0 },
  { key: "damaged", label: "Damaged", patch: { condition: "damaged" }, on: (r) => r?.condition === "damaged" },
  { key: "missing", label: "Missing", patch: { condition: "missing" }, on: (r) => r?.condition === "missing" },
];

function ItemRow({
  item,
  keys,
  result,
  previous,
  onChange,
  onAddPhoto,
}: {
  item: string;
  /** A key or access card: Returned / None / Damaged / Missing, and how many. */
  keys?: boolean;
  result?: InspectionResult;
  previous?: InspectionResult;
  onChange: (patch: Partial<InspectionResult>) => void;
  onAddPhoto: (src: "camera" | "library") => void;
}) {
  const c = useColors();
  const color: Record<ItemCondition, string> = { ok: c.success, dirty: c.amber500, damaged: c.destructive, missing: c.destructive };
  const photos = usePhotoUrls(result?.photos ?? []);
  const issue = result && result.condition !== "ok";
  return (
    <View style={{ gap: 8 }}>
      <Text weight="medium">{item}</Text>
      {previous && previous.condition !== "ok" && (
        <Text muted size={12}>
          Last inspection: {previous.condition}
          {previous.note ? ` (${previous.note})` : ""}
        </Text>
      )}
      <View style={{ flexDirection: "row", gap: 6 }}>
        {(keys
          ? KEY_CHOICES.map((k) => ({ ...k, on: k.on(result), tint: color[k.patch.condition!] }))
          : CONDITIONS.map(({ key, label }) => ({ key, label, patch: { condition: key } as Partial<InspectionResult>, on: result?.condition === key, tint: color[key] }))
        ).map(({ key, label, patch, on, tint }) => (
          <Pressable
            key={key}
            onPress={() => onChange(keys && key !== "none" && result?.count === 0 ? { ...patch, count: null } : patch)}
            accessibilityLabel={`${item}: ${label}`}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 8,
              alignItems: "center",
              borderWidth: 1,
              borderColor: on ? tint : c.border,
              backgroundColor: on ? withAlpha(tint, 0.14) : c.card,
            }}
          >
            <Text size={12} weight={on ? "semibold" : "regular"} style={on ? { color: tint } : undefined}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      {keys && result && result.count !== 0 && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text muted size={13} style={{ flex: 1 }}>
            How many handed back?
          </Text>
          <Input
            value={result.count == null ? "" : String(result.count)}
            onChangeText={(t) => {
              const digits = t.replace(/[^0-9]/g, "");
              onChange({ count: digits === "" ? null : Math.min(99, Number(digits)) });
            }}
            keyboardType="number-pad"
            placeholder="0"
            style={{ width: 70, textAlign: "center" }}
          />
        </View>
      )}
      {(issue || !!result?.note || !!result?.photos.length) && (
        <>
          <Input value={result?.note ?? ""} onChangeText={(t) => onChange({ note: t })} placeholder="What's wrong?" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {photos.map((u, i) => (
              <View key={`${i}:${result?.photos[i]}`}>
                {u ? (
                  <Image source={{ uri: u }} style={{ width: 72, height: 72, borderRadius: 8, backgroundColor: c.muted }} />
                ) : (
                  <View style={{ width: 72, height: 72, borderRadius: 8, backgroundColor: c.muted, alignItems: "center", justifyContent: "center" }}>
                    <ActivityIndicator size="small" color={c.mutedForeground} />
                  </View>
                )}
                <Pressable
                  onPress={() => onChange({ photos: (result?.photos ?? []).filter((_, j) => j !== i) })}
                  hitSlop={8}
                  accessibilityLabel="Remove photo"
                  style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: c.foreground, alignItems: "center", justifyContent: "center" }}
                >
                  <X size={12} color={c.background} />
                </Pressable>
              </View>
            ))}
            <PhotoButton Icon={Camera} label="Take photo" onPress={() => onAddPhoto("camera")} />
            <PhotoButton Icon={ImagePlus} label="Choose photo" onPress={() => onAddPhoto("library")} />
          </View>
        </>
      )}
    </View>
  );
}

function PhotoButton({ Icon, label, onPress }: { Icon: typeof Camera; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={{ width: 72, height: 72, borderRadius: 8, borderWidth: 1, borderStyle: "dashed", borderColor: c.border, alignItems: "center", justifyContent: "center" }}
    >
      <Icon size={20} color={c.mutedForeground} />
    </Pressable>
  );
}

/** The saved report: summary, items needing attention with photos, notes, and Share PDF. */
function ReportView({ insp, draft, unit }: { insp: Inspection; draft: Draft; unit: string }) {
  const c = useColors();
  const tplQ = useTemplate(insp.template_id);
  const [sharing, setSharing] = useState(false);
  const issues = issuesOf(draft.results);
  const keyResults = draft.results.filter((r) => r.room === KEYS_ROOM);
  const okCount = draft.results.length - issues.length;

  const share = async () => {
    setSharing(true);
    try {
      // Photos are embedded in the PDF itself, including ones still on the phone.
      const photoUrls = await photoDataUris(issuesOf(draft.results).flatMap((r) => r.photos));
      const html = inspectionReportHtml({ insp: { ...insp, ...draft }, unit, template: tplQ.data ?? null, photoUrls });
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Inspection ${unit}`, UTI: "com.adobe.pdf" });
      } else {
        Alert.alert("PDF saved", uri);
      }
    } catch (e) {
      Alert.alert("Could not create the PDF", (e as Error).message);
    } finally {
      setSharing(false);
    }
  };

  return (
    <>
      {!!draft.summary && (
        <Card style={{ padding: 14, gap: 6 }}>
          <Label style={{ marginBottom: 0 }}>Report</Label>
          <Text size={14} style={{ lineHeight: 20 }}>
            {draft.summary}
          </Text>
        </Card>
      )}
      <Card style={{ padding: 14, gap: 12 }}>
        <Label style={{ marginBottom: 0 }}>Items needing attention ({issues.length})</Label>
        {issues.length === 0 && <Text muted>None. {okCount} items OK.</Text>}
        {issues.map((r) => (
          <IssueRow key={`${r.room}|${r.item}`} r={r} />
        ))}
      </Card>
      {keyResults.length > 0 && (
        <Card style={{ padding: 14, gap: 8 }}>
          <Label style={{ marginBottom: 0 }}>{KEYS_ROOM}</Label>
          {keyResults.map((r) => (
            <View key={r.item} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <Text>{r.item}</Text>
              <Text weight="medium" style={{ color: r.condition === "ok" ? c.foreground : c.destructive, flexShrink: 1, textAlign: "right" }}>
                {conditionText(r)}
              </Text>
            </View>
          ))}
        </Card>
      )}
      {!!draft.general_notes && (
        <Card style={{ padding: 14, gap: 6 }}>
          <Label style={{ marginBottom: 0 }}>Notes</Label>
          <Text>{draft.general_notes}</Text>
        </Card>
      )}
      <Button
        title="Share PDF"
        variant="outline"
        icon={sharing ? <ActivityIndicator size="small" color={c.foreground} /> : <Share2 size={16} color={c.foreground} />}
        onPress={share}
        disabled={sharing}
      />
    </>
  );
}

function IssueRow({ r }: { r: InspectionResult }) {
  const c = useColors();
  const photos = usePhotoUrls(r.photos);
  const color = r.condition === "dirty" ? c.amber500 : c.destructive;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text weight="medium" style={{ flex: 1 }}>
          {r.room} · {r.item}
        </Text>
        <Badge label={conditionText(r)} color={color} bg={withAlpha(color, 0.12)} />
      </View>
      {!!r.note && (
        <Text muted size={13}>
          {r.note}
        </Text>
      )}
      {photos.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {photos.map((u, i) =>
            u ? (
              <Image key={`${i}:${u}`} source={{ uri: u }} style={{ width: 96, height: 96, borderRadius: 8, backgroundColor: c.muted }} />
            ) : (
              <View key={i} style={{ width: 96, height: 96, borderRadius: 8, backgroundColor: c.muted, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator size="small" color={c.mutedForeground} />
              </View>
            ),
          )}
        </View>
      )}
    </View>
  );
}
