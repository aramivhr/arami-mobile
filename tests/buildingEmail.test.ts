import { describe, expect, it } from "vitest";
import * as app from "@/lib/buildingEmail";
import * as web from "./web/building-email";
import { newRequestId } from "@/lib/buildingEmail";
import { canEditReservation, canEmailBuildings } from "@/lib/access";
import { cases } from "./rand";

// The building email the app previews is the one the website's
// send-building-email function sends (tests/web/building-email.ts is the
// website's own code), for random purposes, guests, dates and photo counts.

const pick = <T,>(r: { pick: <U>(a: readonly U[]) => U }, a: readonly T[]) => r.pick(a);

const scen = cases(3000, 7301, (r) => ({
  purpose: pick(r, app.BUILDING_EMAIL_PURPOSES),
  buildingName: pick(r, ["Vida", "Binghatti Royale", "52/42 Emaar", "A & B <Tower>"]),
  unit: pick(r, ["1404", " 508 ", "", "703"]),
  guestName: pick(r, [undefined, "", "Ann Lee", " José Núñez "]),
  guestPhone: pick(r, [undefined, "", "+971501234567"]),
  checkIn: pick(r, [undefined, "", "2026-11-06", "2026-12-31"]),
  checkOut: pick(r, [undefined, "", "2026-11-06", "2026-11-09", "2027-01-02"]),
  visitDate: pick(r, [undefined, "", "2026-11-06", "2027-02-26"]),
  visitors: pick(r, [undefined, "", "Maria, Joy"]),
  notes: pick(r, [undefined, "", "Arriving 11am", "Line 1\nLine <2>"]),
  idCount: r.int(0, 3),
}));

describe("building email matches the website", () => {
  it("has the same purposes and labels", () => {
    expect(app.BUILDING_EMAIL_PURPOSES).toEqual(web.BUILDING_EMAIL_PURPOSES);
    expect(app.PURPOSE_LABEL).toEqual(web.PURPOSE_LABEL);
    expect(app.CONTACT).toEqual(web.CONTACT);
  });
  it.each(scen)("%s", (_l, input) => {
    const missing = app.missingFields(input);
    expect(missing).toEqual(web.missingFields(input));
    expect(app.isStayPurpose(input.purpose)).toBe(web.isStayPurpose(input.purpose));
    if (!missing.length) expect(app.buildBuildingEmail(input)).toEqual(web.buildBuildingEmail(input));
  });
});

describe("request ids", () => {
  it("are v4 UUIDs the function's validator accepts, and differ", () => {
    const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const ids = new Set(Array.from({ length: 500 }, () => newRequestId()));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(re);
    expect(newRequestId(() => 0)).toMatch(re);
    expect(newRequestId(() => 0.9999)).toMatch(re);
  });
});

describe("who can edit and email, as on the website", () => {
  // Website: canEdit = perms.can_edit_reservations || perms.isAdmin, on every booking;
  // Email building = admins and super admins.
  const perms = [null, {}, { isAdmin: true }, { can_edit_reservations: true }, { isAdmin: false, can_edit_reservations: false }];
  const sources = [null, "direct", "website", "airbnb", "booking"];
  it.each(perms.flatMap((p) => sources.map((s) => [JSON.stringify(p), s, p] as const)))("perms %s source %s", (_l, s, p) => {
    expect(canEditReservation(p, s)).toBe(!!(p?.can_edit_reservations || p?.isAdmin));
  });
  it("email building is admins and super admins only", () => {
    expect(canEmailBuildings("admin")).toBe(true);
    expect(canEmailBuildings("super_admin")).toBe(true);
    expect(canEmailBuildings("owner")).toBe(false);
    expect(canEmailBuildings(undefined)).toBe(false);
  });
});
