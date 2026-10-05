/** The website's guestCountsPayload (GuestCountFields.tsx): at least one adult, whole numbers only. */
export function guestCounts(f: { adults: string; children: string; infants: string }) {
  const n = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
  return { adults: Math.max(1, n(f.adults)), children: n(f.children), infants: n(f.infants) };
}
