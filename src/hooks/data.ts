import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/auth";
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

function diffReservation(before: Reservation | undefined, updates: Partial<Reservation>): string[] {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reservations"] }),
  });
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
