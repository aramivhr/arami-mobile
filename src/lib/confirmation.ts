import { COMPANY_ADDRESS, COMPANY_NAME, COMPANY_PHONE, COMPANY_WEBSITE, reservationNumber } from "@/lib/company";
import { SOURCE_LABEL, directPaymentLabel } from "@/lib/labels";
import { money, nightsBetween, prettyDate } from "@/lib/dates";
import type { Apartment, Building, Reservation } from "@/lib/types";

// The reservation confirmation PDF, same layout and content as the website's.

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");

export function confirmationHtml(p: {
  r: Reservation;
  apartment?: Apartment | null;
  building?: Building | null;
  showFinancial: boolean;
  showContacts: boolean;
  idNumber: string;
  additionalGuests: string;
  /** Date shown as "Issued"; defaults to today. */
  issued?: string;
}) {
  const { r } = p;
  const nights = nightsBetween(r.check_in, r.check_out);
  const total = Number(r.total_price ?? 0);
  const guests = [
    r.adults != null ? `${r.adults} ${r.adults === 1 ? "adult" : "adults"}` : null,
    r.children ? `${r.children} ${r.children === 1 ? "child" : "children"}` : null,
    r.infants ? `${r.infants} ${r.infants === 1 ? "infant" : "infants"}` : null,
  ].filter(Boolean).join(", ");
  const row = (label: string, value: string, bold = false) =>
    `<tr><td class="l">${esc(label)}</td><td class="v${bold ? " b" : ""}">${esc(value || "—")}</td></tr>`;
  const section = (title: string, rows: string) => `<h3>${esc(title)}</h3><table>${rows}</table>`;
  const isDirect = (r.source ?? "direct") === "direct";
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
  @page { margin: 0; }
  body { font-family: Helvetica, Arial, sans-serif; margin: 0; color: #0f172a; }
  .head { background: #0f172a; color: #fff; padding: 36px 48px; display: flex; justify-content: space-between; }
  .head .t { color: #f59e0b; font-weight: bold; font-size: 20px; text-align: right; }
  .head .s { color: #e2e8f0; font-size: 12px; text-align: right; margin-top: 6px; }
  .co { font-weight: bold; font-size: 14px; margin-top: 40px; }
  .body { padding: 24px 48px 120px; }
  h3 { color: #f59e0b; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin: 22px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 5px 0; vertical-align: top; }
  td.l { color: #64748b; width: 40%; }
  td.v { text-align: right; }
  td.b { font-weight: bold; }
  .foot { position: fixed; bottom: 0; left: 0; right: 0; background: #0f172a; color: #cbd5e1; padding: 18px 48px; font-size: 11px; }
  .foot b { color: #fff; font-size: 13px; }
  </style></head><body>
  <div class="head"><div><div class="co">${esc(COMPANY_NAME)}</div></div>
  <div><div class="t">RESERVATION CONFIRMATION</div><div class="s">${esc(reservationNumber(r.id))}</div>
  <div class="s">Issued ${esc(p.issued ?? new Date().toISOString().slice(0, 10))}</div></div></div>
  <div class="body">
  ${section(
    "Guest details",
    row("Guest name", r.guest_name) +
      (guests ? row("Guests", guests) : "") +
      (p.showContacts ? row("Phone", r.guest_phone) + row("Email", r.guest_email) : "") +
      row("Passport / ID no.", p.idNumber) +
      (p.additionalGuests.trim() ? row("Additional guests", p.additionalGuests) : ""),
  )}
  ${section(
    "Stay details",
    row("Apartment", p.apartment ? `${p.apartment.name}${p.building ? ` — ${p.building.name}` : ""}` : "—") +
      (p.building?.address ? row("Address", p.building.address) : "") +
      (p.apartment ? row("Unit type", `${p.apartment.type} · up to ${p.apartment.max_guests} guests`) : "") +
      row("Check-in", prettyDate(r.check_in)) +
      row("Check-out", prettyDate(r.check_out)) +
      row("Nights", String(nights)) +
      row("Status", r.status),
  )}
  ${section(
    "Payment",
    row("Booking source", SOURCE_LABEL[r.source ?? "direct"] ?? String(r.source)) +
      (isDirect && r.direct_payment_method ? row("Payment method", directPaymentLabel(r.direct_payment_method)) : "") +
      (p.showFinancial
        ? row("Total amount", money(total), true)
        : ""),
  )}
  ${r.notes ? `<h3>Notes</h3><div style="font-size:13px">${esc(r.notes)}</div>` : ""}
  </div>
  <div class="foot"><b>${esc(COMPANY_NAME)}</b><br/>${esc(COMPANY_ADDRESS)}<br/>Phone: ${esc(COMPANY_PHONE)} · Web: ${esc(COMPANY_WEBSITE)}</div>
  </body></html>`;
}
