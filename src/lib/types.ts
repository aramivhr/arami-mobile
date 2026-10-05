// Types matching the website's Supabase schema (rent-halo-system src/lib/data.ts).
// The app reads and writes the same tables as the website, so keep these in sync
// when the website's schema changes.

export interface Building {
  id: string;
  user_id: string;
  name: string;
  address: string;
  created_at?: string;
}

export interface Apartment {
  id: string;
  user_id: string;
  building_id: string;
  name: string;
  type: string;
  max_guests: number;
  crm_id?: string | null;
  manage_type?: "sublease" | "revenue_share" | null;
  created_at?: string;
  room_type_id?: string | null;
}

export type DirectPaymentMethod = "cash" | "payment_link" | "bank_transfer";
export type ReservationStatus = "confirmed" | "pending" | "cancelled" | "checked-in" | "checked-out";
export type ReservationSource = "booking" | "airbnb" | "direct";

export interface Reservation {
  id: string;
  user_id: string;
  apartment_id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  status: ReservationStatus;
  total_price: number;
  source: ReservationSource;
  direct_payment_method?: DirectPaymentMethod | null;
  notes?: string | null;
  guest_id_number?: string | null;
  additional_guests?: string | null;
  adults?: number | null;
  children?: number | null;
  infants?: number | null;
  guest_ages?: number[] | null;
  channel?: string | null;
  currency?: string | null;
  external_booking_id?: string | null;
  amount_before_tax?: number | null;
  tax?: number | null;
  ota_commission?: number | null;
  created_at?: string;
}

export interface BlockedDate {
  id: string;
  user_id: string;
  apartment_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  created_at?: string;
}

export interface AppNotification {
  id: string;
  kind: "new" | "modified" | "cancelled" | "message";
  title: string;
  body: string;
  reservation_id: string | null;
  dedupe_key: string | null;
  read: boolean;
  created_at: string;
}

export interface Thread {
  id: string;
  title: string | null;
  provider: string | null;
  thread_kind: "enquiry" | "booking_request" | null;
  last_message: string | null;
  last_message_at: string | null;
  unit: string | null;
  building: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  check_in: string | null;
  check_out: string | null;
  status: string | null;
  total_price: number | null;
  currency: string | null;
  adults: number | null;
  children: number | null;
  infants: number | null;
  guest_ages: unknown;
}

export interface ThreadMessage {
  id: string;
  text: string;
  sender: string | null; // "guest" | "property" | "system"
  at: string | null;
  attachments?: unknown[];
}

// Mobile-only tables (mobile_*), added to the same Supabase for the app.

export type ItemCondition = "ok" | "damaged" | "missing" | "dirty";

export interface InspectionResult {
  room: string;
  item: string;
  condition: ItemCondition;
  note: string;
  /** Storage paths in the mobile-inspection-photos bucket. */
  photos: string[];
  /** Keys and access cards: how many were handed back (0 = this unit has none). */
  count?: number | null;
}

export interface InspectionTemplate {
  id: string;
  name: string;
  rooms: { room: string; items: string[] }[];
  is_default: boolean;
}

export interface Inspection {
  id: string;
  reservation_id: string | null;
  apartment_id: string;
  template_id: string | null;
  due_date: string;
  urgent: boolean;
  status: "pending" | "in_progress" | "completed";
  inspector_id: string | null;
  guest_name: string | null;
  check_in: string | null;
  check_out: string | null;
  results: InspectionResult[];
  general_notes: string | null;
  summary: string | null;
  damage_found: boolean;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationSettings {
  user_id: string;
  reservation_new: boolean;
  reservation_modified: boolean;
  reservation_cancelled: boolean;
  guest_message: boolean;
  inspection_due: boolean;
  inspection_damage: boolean;
  sync_failure: boolean;
}
