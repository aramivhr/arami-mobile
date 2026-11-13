import { describe, expect, it } from "vitest";
import { calendarDays, dateStr, daysInMonth, todayScrollX } from "@/lib/dates";

// Today is always the third column from the left on the current month,
// with a full screen of days after it; other months show just their own days.

describe("calendarDays", () => {
  for (const visible of [14, 23])
    for (let m = 0; m < 12; m++)
      for (let d = 1; d <= daysInMonth(2026, m); d++) {
        it(`${visible} cols, 2026-${m + 1}-${d}`, () => {
          const today = dateStr(2026, m, d);
          const cols = calendarDays(2026, m, today, visible);
          const i = cols.findIndex((c) => c.ds === today);
          // Scrolled to today: two days before it, and the screen is full after it.
          const x = todayScrollX(cols, today, 1);
          expect(i - x).toBe(2);
          expect(cols.length - x).toBeGreaterThanOrEqual(visible);
          // Consecutive days, the whole month included, nothing extra beyond what's needed.
          for (let k = 1; k < cols.length; k++) expect(Date.parse(cols[k].ds) - Date.parse(cols[k - 1].ds)).toBe(86_400_000);
          expect(cols.filter((c) => c.inMonth)).toHaveLength(daysInMonth(2026, m));
          expect(cols.length - daysInMonth(2026, m)).toBe(Math.max(0, 3 - d) + Math.max(0, d - 3 + visible - daysInMonth(2026, m)));
          // Another month: only its own days, scrolled to the start.
          const other = calendarDays(2026, (m + 1) % 12, today, visible);
          expect(other.every((c) => c.inMonth)).toBe(true);
          expect(todayScrollX(other, today, 1)).toBe(0);
        });
      }
});
