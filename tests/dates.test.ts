import { describe, expect, it } from "vitest";
import { addDays, daysInMonth, dateStr, nightsBetween, parseISO, prettyDate, shortDate, toISO } from "@/lib/dates";
import { cases } from "./rand";

// Dates are stored as "YYYY-MM-DD" and compared as strings, like the website.
const utcNights = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86400000));

describe("toISO / parseISO round trip", () => {
  it.each(cases(400, 1, (r) => r.iso(1999, 2040)))("%s", (_l, iso) => {
    expect(toISO(parseISO(iso)!)).toBe(iso);
  });
});

describe("nightsBetween matches calendar arithmetic (incl. DST, leap years, month ends)", () => {
  it.each(cases(400, 2, (r) => ({ a: r.iso(2023, 2029), n: r.int(-5, 400) })))("%s", (_l, { a, n }) => {
    const d = new Date(Date.parse(a));
    d.setUTCDate(d.getUTCDate() + n);
    const b = d.toISOString().slice(0, 10);
    expect(nightsBetween(a, b)).toBe(utcNights(a, b));
    expect(nightsBetween(a, b)).toBe(Math.max(0, n));
  });
});

describe("addDays moves whole calendar days", () => {
  it.each(cases(300, 3, (r) => ({ a: r.iso(2023, 2029), n: r.int(-400, 400) })))("%s", (_l, { a, n }) => {
    const got = toISO(addDays(parseISO(a)!, n));
    const d = new Date(Date.parse(a));
    d.setUTCDate(d.getUTCDate() + n);
    expect(got).toBe(d.toISOString().slice(0, 10));
  });
});

describe("daysInMonth and dateStr", () => {
  it.each(cases(200, 4, (r) => ({ y: r.int(1990, 2060), m: r.int(0, 11) })))("%s", (_l, { y, m }) => {
    const n = daysInMonth(y, m);
    expect(n).toBe(new Date(Date.UTC(y, m + 1, 0)).getUTCDate());
    expect(dateStr(y, m, n)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parseISO(dateStr(y, m, n))!.getDate()).toBe(n);
  });
});

describe("bad dates never crash the display helpers", () => {
  it.each(cases(200, 5, (r) => r.pick(["", "2026-13-45", "abc", "2026-02", "0000-00-00", r.str(10), r.iso()])))("%s", (_l, s) => {
    expect(() => prettyDate(s)).not.toThrow();
    expect(() => shortDate(s)).not.toThrow();
    expect(typeof prettyDate(s)).toBe("string");
  });
});
