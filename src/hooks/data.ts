import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/auth";
import { useUserType } from "@/hooks/permissions";
import { buildOverbookings, type IntakeRow, type MappingRow } from "@/lib/overbookings";
import type { AppNotification, Apartment, BlockedDate, Building, Reservation } from "@/lib/types";

// Queries and writes mirror the website's hooks (rent-halo-system
// src/hooks/use-data.ts and use-notifications.ts) table for table, so both
// clients read and write the data the same way.

export function useBuildings() {
  return useQuery({
    queryKey: ["buildings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings").select("*").order("created_at");
      if (error) throw error;
      return data as Building[];
    },
  });
}

export function useApartments() {
  return useQuery({
    queryKey: ["apartments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("apartments").select("*").order("created_at");
      if (error) throw error;
      return data as Apartment[];
    },
  });
}

export function useReservations() {
  return useQuery({
    queryKey: ["reservations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("reservations_safe").select("*").order("check_in");
      if (error) throw error;
      return data as Reservation[];
    },
  });
}

export function useBlockedDates() {
  return useQuery({
    queryKey: ["blocked_dates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("blocked_dates").select("*").order("start_date");
      if (error) throw error;
      return data as BlockedDate[];
    },
  });
}

// Fire-and-forget alert (notification + email), exactly as the website sends it.
function notifyReservationChange(reservation_id: string, kind: "new" | "modified" | "cancelled", changes?: string[]) {
  return supabase.functions
    .invoke("notify-reservation-change", { body: { reservation_id, kind, changes } })
    .catch((e) => console.error("reservation alert failed", e));
}

export function diffReservation(before: Reservation | undefined, updates: Partial<Reservation>): string[] {
  if (!before) return [];
  const labels: [keyof Reservation, string][] = [
    ["guest_name", "Guest"],
    ["apartment_id", "Apartment"],
    ["check_in", "Check-in"],
    ["check_out", "Check-out"],
    ["status", "Status"],
    ["total_price", "Total amount"],
    ["adults", "Adults"],
    ["children", "Children"],
    ["infants", "Infants"],
    ["guest_phone", "Phone"],
    ["guest_email", "Email"],
    ["notes", "Notes"],
  ];
  const out: string[] = [];
  for (const [key, label] of labels) {
    if (!(key in updates)) continue;
    const b = before[key] == null || before[key] === "" ? "—" : String(before[key]);
    const a = updates[key] == null || updates[key] === "" ? "—" : String(updates[key]);
    if (b !== a) out.push(`${label}: ${b} → ${a}`);
  }
  return out;
}

export type NewReservation = Omit<Reservation, "id" | "user_id" | "created_at">;

export function useAddReservation() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (r: NewReservation) => {
      const { data, error } = await supabase.from("reservations").insert({ ...r, user_id: user!.id }).select().single();
      if (error) throw error;
      return data as Reservation;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["reservations"] });
      if (data?.id) notifyReservationChange(data.id, "new").then(() => qc.invalidateQueries({ queryKey: ["notifications"] }));
    },
  });
}

export function useUpdateReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Reservation> & { id: string }) => {
      const { error, count } = await supabase.from("reservations").update(updates, { count: "exact" }).eq("id", id);
      if (error) throw error;
      if (count === 0) throw new Error("You don't have permission to modify this reservation (or the selected apartment).");
      return { id, ...updates } as Reservation;
    },
    onSuccess: (data) => {
      const before = qc.getQueryData<Reservation[]>(["reservations"])?.find((r) => r.id === data.id);
      const changes = diffReservation(before, data);
      qc.invalidateQueries({ queryKey: ["reservations"] });
      notifyReservationChange(data.id, data.status === "cancelled" ? "cancelled" : "modified", changes).then(() =>
        qc.invalidateQueries({ queryKey: ["notifications"] }),
      );
    },
  });
}

export function useDeleteReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await notifyReservationChange(id, "cancelled");
      const { error } = await supabase.from("reservations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reservations"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/**
 * The passport / ID number already on file. reservations_safe (the list the app
 * loads) leaves it out, so it is read from reservations, as the website does.
 */
export function useGuestIdNumber(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["guest-id-number", id],
    enabled,
    queryFn: async () => {
      const { data } = await supabase.from("reservations").select("guest_id_number, additional_guests").eq("id", id).maybeSingle();
      return { guest_id_number: (data?.guest_id_number as string | null) ?? null, additional_guests: (data?.additional_guests as string | null) ?? null };
    },
  });
}

export function useSaveGuestDetails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; guest_id_number: string | null; additional_guests: string | null }) => {
      const { error } = await supabase
        .from("reservations")
        .update({ guest_id_number: v.guest_id_number, additional_guests: v.additional_guests })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["reservations"] });
      qc.invalidateQueries({ queryKey: ["guest-id-number", v.id] });
    },
  });
}

/**
 * Channel bookings waiting for a free unit, for the calendar (the website's
 * use-overbookings.ts). The intake and mapping tables are admin-only, so other
 * users get an empty list.
 */
export function useOverbookings(apartments: Apartment[], reservations: Reservation[]) {
  const { data: userType } = useUserType();
  const { data } = useQuery({
    queryKey: ["overbookings"],
    enabled: userType === "admin" || userType === "super_admin",
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data: waiting, error } = await supabase
        .from("channex_booking_intake")
        .select("channex_booking_id")
        .eq("status", "needs_manual_assignment");
      if (error) throw error;
      const bookingIds = [...new Set((waiting ?? []).map((w: { channex_booking_id: string }) => w.channex_booking_id))];
      if (bookingIds.length === 0) return { intake: [] as IntakeRow[], mappings: [] as MappingRow[] };
      // Every revision of those bookings, so a later revision that did import wins.
      const { data: intake, error: intakeErr } = await supabase
        .from("channex_booking_intake")
        .select("channex_booking_id, channex_property_id, received_at, status, error, raw_revision")
        .in("channex_booking_id", bookingIds);
      if (intakeErr) throw intakeErr;
      const { data: mappings, error: mapErr } = await supabase
        .from("channex_mapping")
        .select("entity_type, channex_id, internal_id")
        .in("entity_type", ["property", "room_type"]);
      if (mapErr) throw mapErr;
      return { intake: (intake ?? []) as IntakeRow[], mappings: (mappings ?? []) as MappingRow[] };
    },
  });
  return useMemo(() => (data ? buildOverbookings(data.intake, data.mappings, apartments, reservations) : []), [data, apartments, reservations]);
}

export function useAddBlockedDate() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (b: { apartment_id: string; start_date: string; end_date: string; reason: string }) => {
      const { data, error } = await supabase.from("blocked_dates").insert({ ...b, user_id: user!.id }).select().single();
      if (error) throw error;
      return data as BlockedDate;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["blocked_dates"] }),
  });
}

export function useDeleteBlockedDate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blocked_dates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["blocked_dates"] }),
  });
}

export function getOverlappingReservations(
  reservations: Reservation[],
  apartmentId: string,
  checkIn: string,
  checkOut: string,
  excludeId?: string,
): Reservation[] {
  return reservations.filter(
    (r) =>
      r.apartment_id === apartmentId &&
      r.status !== "cancelled" &&
      r.id !== excludeId &&
      r.check_in < checkOut &&
      r.check_out > checkIn,
  );
}

// ---- Notifications (the website's in-app notification list) ----

export function useNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notifications"],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },
  });
}

/**
 * Unread notifications counted on the server, as the website's bell does. The
 * list above holds only the newest 100, so counting it would stop at 100.
 */
export function useUnreadCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notifications", "unread-count"],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("read", false);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("notifications").update({ read: true }).eq("read", false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

/** Contract end dates per unit, used by the Financial page (same query as the website). */
export function useApartmentFinance() {
  return useQuery({
    queryKey: ["apartment_finance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("apartment_finance").select("apartment_id, contract_end");
      if (error) throw error;
      return (data ?? []) as { apartment_id: string; contract_end: string | null }[];
    },
  });
}
