// The fixed stepMessages from the Lovable prompt (lovable-prompt-nov13-app-changes.md).
// refresh.mjs puts it into the dispatcher copy while the website still has the old one.
/* eslint-disable */
// @ts-nocheck
async function stepMessages(admin: Any) {
  const r = await channexFetch(admin, `/message_threads?pagination[page]=1&pagination[limit]=50`, "GET");
  if (!r.ok) throw new Error(`channex ${r.status}`);
  const rows: Any[] = (r.body as Any)?.data ?? [];

  const propIds = [...new Set(rows.map((t) => t.relationships?.property?.data?.id).filter(Boolean))];
  const unitByProp: Record<string, string> = {};
  if (propIds.length) {
    const { data: maps } = await admin.from("channex_mapping").select("channex_id, internal_id")
      .eq("entity_type", "property").in("channex_id", propIds);
    const internal = (maps ?? []).map((m: Any) => m.internal_id);
    if (internal.length) {
      const list = internal.join(",");
      const { data: apts } = await admin.from("apartments").select("id, name, room_type_id, buildings(name)")
        .or(`id.in.(${list}),room_type_id.in.(${list})`);
      for (const m of maps ?? []) {
        const names = (apts ?? []).filter((a: Any) => a.id === m.internal_id || a.room_type_id === m.internal_id)
          .map((a: Any) => (a.buildings?.name ? `${a.buildings.name} – ${a.name}` : a.name));
        if (names.length) unitByProp[m.channex_id] = names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
      }
    }
  }

  const bookingIds = [...new Set(rows.map((t) => t.relationships?.booking?.data?.id).filter(Boolean))];
  const resByBooking: Record<string, Any> = {};
  if (bookingIds.length) {
    const { data: intake } = await admin.from("channex_booking_intake")
      .select("channex_booking_id, applied_reservation_id, received_at, raw_revision").in("channex_booking_id", bookingIds)
      .order("received_at", { ascending: false });
    const resCols = "id, guest_name, check_in, check_out, apartments(name, buildings(name))";
    const resIds = (intake ?? []).map((i: Any) => i.applied_reservation_id).filter(Boolean);
    if (resIds.length) {
      const { data: res } = await admin.from("reservations").select(resCols).in("id", resIds);
      for (const i of intake ?? []) {
        if (resByBooking[i.channex_booking_id]) continue;
        const rr = (res ?? []).find((x: Any) => x.id === i.applied_reservation_id);
        if (rr) resByBooking[i.channex_booking_id] = rr;
      }
    }
    const words = (s: string) => String(s ?? "").toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length > 1);
    for (const i of intake ?? []) {
      if (resByBooking[i.channex_booking_id]) continue;
      const rev = i.raw_revision?.attributes ?? i.raw_revision ?? {};
      const ci = rev.arrival_date, co = rev.departure_date;
      if (!ci || !co) continue;
      const cust = rev.customer ?? {};
      const nameWords = words(`${cust.name ?? ""} ${cust.surname ?? ""}`);
      const { data: cands } = await admin.from("reservations").select(resCols).eq("check_in", ci).eq("check_out", co);
      const hit = (cands ?? []).find((c: Any) => words(c.guest_name).some((w) => nameWords.includes(w)))
        ?? ((cands ?? []).length === 1 ? cands![0] : null);
      if (hit) resByBooking[i.channex_booking_id] = hit;
    }
  }

  const threads = rows.map((t) => {
    const a = t.attributes ?? {};
    const propId = t.relationships?.property?.data?.id;
    const bookingId = t.relationships?.booking?.data?.id ?? null;
    const res = bookingId ? resByBooking[bookingId] : null;
    return {
      id: t.id,
      title: a.title ?? null,
      provider: a.provider ?? null,
      last_message: typeof a.last_message === "string" ? a.last_message : a.last_message?.message ?? null,
      sender: typeof a.last_message === "object" ? a.last_message?.sender ?? null : null,
      last_message_at: a.last_message_received_at ?? a.updated_at ?? a.inserted_at ?? null,
      unit: res?.apartments?.name ?? (propId ? unitByProp[propId] ?? null : null),
      building: res?.apartments?.buildings?.name ?? null,
      guest_name: res?.guest_name ?? null,
      check_in: res?.check_in ?? null,
      check_out: res?.check_out ?? null,
    };
  });

  // Only guest messages from the last 2 hours: skips our own replies, and
  // stops a backlog of old threads from all alerting at once.
  const recentFrom = Date.now() - 2 * 3600 * 1000;
  const fresh = threads.filter((t) => t.last_message_at && t.last_message
    && (!t.sender || t.sender === "guest")
    && Date.parse(t.last_message_at) >= recentFrom);
  const notifRows = fresh.map((t) => ({
    kind: "message",
    title: `New message from ${t.guest_name ?? t.title ?? "a guest"}`,
    body: `${t.unit ? `${t.unit} · ` : ""}${String(t.last_message).slice(0, 200)}`,
    dedupe_key: `msg:${t.id}:${t.last_message_at}`,
  }));
  if (!notifRows.length) return 0;
  // notifications.dedupe_key has a partial unique index (WHERE dedupe_key IS
  // NOT NULL), which ON CONFLICT (dedupe_key) cannot use, so an upsert fails.
  // Insert only keys not seen yet; a duplicate-key error means another run won.
  const { data: existing, error: existingError } = await admin.from("notifications")
    .select("dedupe_key").in("dedupe_key", notifRows.map((n) => n.dedupe_key));
  if (existingError) throw existingError;
  const seen = new Set((existing ?? []).map((r: Any) => r.dedupe_key));
  const newKeys = new Set<string>();
  for (const row of notifRows) {
    if (seen.has(row.dedupe_key)) continue;
    const { error } = await admin.from("notifications").insert(row);
    if (!error) newKeys.add(row.dedupe_key);
    else if (error.code !== "23505") console.error("message notification insert failed:", error);
  }
  if (newKeys.size) {
    const { sendTemplateEmail } = await import("../_shared/transactional-email-templates/send-email.ts");
    for (const t of fresh) {
      const key = `msg:${t.id}:${t.last_message_at}`;
      if (!newKeys.has(key)) continue;
      try {
        const lines = [
          `From: ${t.guest_name ?? t.title ?? "Guest"}`,
          `Channel: ${t.provider ?? "—"}`,
          ...(t.unit ? [`Unit: ${t.unit}${t.building ? ` (${t.building})` : ""}`] : []),
          ...(t.check_in ? [`Dates: ${t.check_in} → ${t.check_out ?? ""}`] : []),
          `Message: ${String(t.last_message)}`,
        ];
        await sendTemplateEmail("reservation-alert", "arami.vhr@gmail.com", {
          templateData: { title: `New message from ${t.guest_name ?? t.title ?? "a guest"}`, lines },
          idempotencyKey: `guest-message-${key}`,
        });
      } catch (e) {
        console.error("message alert email failed:", e);
      }
    }
  }
  return newKeys.size;
}
