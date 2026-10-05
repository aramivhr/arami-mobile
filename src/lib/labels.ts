import type { DirectPaymentMethod, ReservationSource } from "@/lib/types";

export const SOURCE_LABEL: Record<ReservationSource, string> = {
  booking: "Booking.com",
  airbnb: "Airbnb",
  direct: "Direct",
};

export const DIRECT_PAYMENT_LABELS: Record<DirectPaymentMethod, string> = {
  cash: "Cash",
  payment_link: "Payment Link",
  bank_transfer: "Bank Transfer",
};

export function directPaymentLabel(m?: DirectPaymentMethod | null) {
  return m ? DIRECT_PAYMENT_LABELS[m] : "";
}
