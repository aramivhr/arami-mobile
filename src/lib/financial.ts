import type { Apartment, DirectPaymentMethod, Reservation } from "@/lib/types";

// The website's Financial page numbers (rent-halo-system src/pages/Financial.tsx):
// revenue is pro-rated by nights inside the period, stops at a unit's
// contract_end, and occupancy is booked nights over available nights.
// Dates are "YYYY-MM-DD"; the period end is exclusive, like a checkout day.

export interface FinanceRow {
  apartment_id: string;
  contract_end: string | null;
}

export type ManageFilter = "all" | "sublease" | "revenue_share";

const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
const daysBetween = (a: string, b: string) => day(b) - day(a);

export function proRated(r: Pick<Reservation, "check_in" | "check_out" | "total_price">, periodStart: string, periodEnd: string) {
  const start = r.check_in > periodStart ? r.check_in : periodStart;
  const end = r.check_out < periodEnd ? r.check_out : periodEnd;
  if (start >= end) return { amount: 0, days: 0 };
  const total = daysBetween(r.check_in, r.check_out);
  if (total <= 0) return { amount: 0, days: 0 };
  const days = daysBetween(start, end);
  return { amount: Math.round((r.total_price / total) * days * 100) / 100, days };
}

export interface FinancialResult {
  totalAmount: number;
  totalCheckIns: number;
  bySource: Record<string, number>;
  byDirectPayment: Record<DirectPaymentMethod, number>;
  breakdown: { reservation: Reservation; proRatedAmount: number; proRatedDays: number; isCheckIn: boolean }[];
  occupancy: number;
  bookedNights: number;
  capacity: number;
}

export function computeFinancial({
  reservations,
  apartments,
  financeRows,
  selected,
  manage,
  start,
  end,
}: {
  reservations: Reservation[];
  apartments: Pick<Apartment, "id" | "manage_type">[];
  financeRows: FinanceRow[];
  /** Selected unit ids; empty means all. */
  selected: string[];
  manage: ManageFilter;
  start: string;
  end: string;
}): FinancialResult {
  const all = selected.length === 0;
  const scoped = new Set((manage === "all" ? apartments : apartments.filter((a) => a.manage_type === manage)).map((a) => a.id));
  const contractEnd = (id: string) => financeRows.find((f) => f.apartment_id === id)?.contract_end ?? null;

  const result: FinancialResult = {
    totalAmount: 0,
    totalCheckIns: 0,
    bySource: { booking: 0, airbnb: 0, direct: 0 },
    byDirectPayment: { cash: 0, payment_link: 0, bank_transfer: 0 },
    breakdown: [],
    occupancy: 0,
    bookedNights: 0,
    capacity: 0,
  };

  for (const r of reservations) {
    if (r.status === "cancelled") continue;
    if (!all && !selected.includes(r.apartment_id)) continue;
    if (!scoped.has(r.apartment_id)) continue;
    if (!(r.check_in < end && r.check_out > start)) continue;

    const cEnd = contractEnd(r.apartment_id);
    const { amount, days } = proRated(r, start, cEnd && cEnd < end ? cEnd : end);
    result.bookedNights += days;
    if (amount <= 0) continue;

    const isCheckIn = r.check_in >= start && r.check_in < end;
    result.totalAmount += amount;
    if (isCheckIn) result.totalCheckIns++;
    result.bySource[r.source] = (result.bySource[r.source] || 0) + amount;
    if (r.source === "direct" && r.direct_payment_method) {
      result.byDirectPayment[r.direct_payment_method] = (result.byDirectPayment[r.direct_payment_method] || 0) + amount;
    }
    result.breakdown.push({ reservation: r, proRatedAmount: amount, proRatedDays: days, isCheckIn });
  }

  const ids = (all ? apartments.map((a) => a.id) : selected).filter((id) => scoped.has(id));
  const listings = ids.filter((id) => {
    const cEnd = contractEnd(id);
    return !cEnd || cEnd > start;
  }).length;
  result.capacity = daysBetween(start, end) * listings;
  result.occupancy = result.capacity > 0 ? Math.min(100, (result.bookedNights / result.capacity) * 100) : 0;
  return result;
}

/** The website's quick ranges; `to` is exclusive. */
export function presets(now: Date = new Date()): { label: string; from: string; to: string }[] {
  const ym = (y: number, m: number) => {
    const d = new Date(Date.UTC(y, m, 1));
    return d.toISOString().slice(0, 10);
  };
  const y = now.getFullYear();
  const m = now.getMonth();
  return [
    { label: "This month", from: ym(y, m), to: ym(y, m + 1) },
    { label: "Last month", from: ym(y, m - 1), to: ym(y, m) },
    { label: "Last 3 months", from: ym(y, m - 2), to: ym(y, m) },
    { label: "Year to date", from: ym(y, 0), to: ym(y, m) },
    { label: "This year", from: ym(y, 0), to: ym(y + 1, 0) },
  ];
}
