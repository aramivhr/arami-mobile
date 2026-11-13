// Date helpers. Dates in the database are plain "YYYY-MM-DD" strings, compared
// as strings exactly like the website does.

export function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseISO(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function todayISO() {
  return toISO(new Date());
}

export function nightsBetween(a: string, b: string) {
  const da = parseISO(a);
  const db = parseISO(b);
  if (!da || !db) return 0;
  return Math.max(0, Math.round((db.getTime() - da.getTime()) / 86400000));
}

export function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export function dateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatMonth(year: number, month: number) {
  return new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** "04 Oct 2026", like the website's reservation confirmation. */
export function prettyDate(s: string) {
  const d = parseISO(s);
  if (!d) return s;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function shortDate(s: string) {
  const d = parseISO(s);
  if (!d) return s;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function money(n: number) {
  return `AED ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "5m", "3h", "2d" style relative time for message lists. */
export function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function dateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

/** The date in Dubai (UTC+4 all year, no daylight saving), where the business and its backend jobs run. */
export function dubaiISO(d: Date = new Date()) {
  return new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
}

/** Money as the website's calendar and reservation details show it: no trailing ".00", thousands separated (the website's formatAmount). */
export function formatAmount(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return String(value ?? "");
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export interface CalendarDay {
  /** yyyy-mm-dd */
  ds: string;
  /** Day of the month. */
  day: number;
  /** 0 = Sunday. */
  dow: number;
  /** False for the few days of the month before or after, shown so today can sit third from the left. */
  inMonth: boolean;
}

/**
 * The calendar's columns for a month. On the current month today must sit
 * third from the left when scrolled there, so up to two days of the previous
 * month come first (today is the 1st or 2nd) and days of the next month follow
 * when the month ends before a full screen after today.
 * `todayStr` is today's yyyy-mm-dd; `visibleDays` how many columns fit on screen.
 */
export function calendarDays(year: number, month: number, todayStr: string, visibleDays: number): CalendarDay[] {
  const n = daysInMonth(year, month);
  const inThisMonth = todayStr.slice(0, 7) === dateStr(year, month, 1).slice(0, 7);
  const today = inThisMonth ? Number(todayStr.slice(8, 10)) : 0;
  const lead = inThisMonth ? Math.max(0, 3 - today) : 0;
  // Index of today with the lead days in front, then enough days after it to fill the screen.
  const trail = inThisMonth ? Math.max(0, today + lead - 3 + visibleDays - (n + lead)) : 0;
  const out: CalendarDay[] = [];
  for (let i = 1 - lead; i <= n + trail; i++) {
    const d = new Date(year, month, i);
    out.push({ ds: dateStr(d.getFullYear(), d.getMonth(), d.getDate()), day: d.getDate(), dow: d.getDay(), inMonth: i >= 1 && i <= n });
  }
  return out;
}

/** Scroll position that puts today third from the left (0 when today isn't in `days`). */
export function todayScrollX(days: CalendarDay[], todayStr: string, colW: number) {
  const i = days.findIndex((d) => d.ds === todayStr);
  return i < 0 ? 0 : Math.max(0, (i - 2) * colW);
}
