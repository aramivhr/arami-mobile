import type { DirectPaymentMethod, ReservationSource } from "@/lib/types";

export const SOURCE_LABEL: Record<ReservationSource, string> = {
  booking: "Booking.com",
  airbnb: "Airbnb",
  direct: "Direct",
  website: "Website",
};

/** The website's isOwnBooking (src/lib/reservation-source.ts): booked with Arami itself, not through a channel. */
export function isOwnBooking(source: string | null | undefined) {
  return !source || source === "direct" || source === "website";
}

export const DIRECT_PAYMENT_LABELS: Record<DirectPaymentMethod, string> = {
  cash: "Cash",
  payment_link: "Payment Link",
  bank_transfer: "Bank Transfer",
};

export function directPaymentLabel(m?: DirectPaymentMethod | null) {
  return m ? DIRECT_PAYMENT_LABELS[m] : "";
}
