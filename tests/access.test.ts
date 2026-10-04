import { describe, expect, it } from "vitest";
import { MORE_BY_TYPE, TABS_BY_TYPE, canSeeScreen, canSeeTab, getsPushAlerts, loginEmail, userTypeFromRoles, type ScreenKey, type TabKey, type UserType } from "@/lib/access";
import { canAccessPage, webLoginEmail, webUserType } from "./web/oracle";
import { cases } from "./rand";

const TYPES: UserType[] = ["super_admin", "admin", "owner"];
// The website page each app tab or screen corresponds to (null = app-only, admins only).
const WEB_PATH: Record<TabKey | ScreenKey, string | null> = {
  dashboard: "/",
  calendar: "/calendar",
  reservations: "/reservations",
  messages: "/messages",
  notifications: "/notifications",
  financial: "/financial",
  more: "/",
  inspections: null,
  alert_settings: null,
};

describe("Gevorg's tab and page choices", () => {
  const expected: Record<UserType, string[]> = {
    super_admin: ["dashboard", "calendar", "messages", "inspections", "reservations", "notifications", "alert_settings", "financial"],
    admin: ["dashboard", "calendar", "messages", "inspections", "reservations", "notifications", "alert_settings"],
    owner: ["dashboard", "calendar", "reservations", "financial"],
  };
  const all = Object.keys(WEB_PATH).filter((k) => k !== "more");
  it.each(TYPES.flatMap((t) => all.map((k) => [`${t} ${k}`, t, k] as const)))("%s", (_l, t, k) => {
    const sees = (TABS_BY_TYPE[t] as string[]).includes(k) || (MORE_BY_TYPE[t] as string[]).includes(k);
    expect(sees).toBe(expected[t].includes(k));
  });
  it.each(TYPES.map((t) => [t]))("%s tabs fit a phone tab bar and end with More", (t) => {
    expect(TABS_BY_TYPE[t].length).toBeLessThanOrEqual(5);
    expect(TABS_BY_TYPE[t].at(-1)).toBe("more");
  });
});

describe("role rows -> user type matches the website, and the app never shows a page the website hides", () => {
  const ROLES = ["admin", "super_admin", "user", "owner", "Admin", "", "SUPER_ADMIN", "manager"];
  const roleCases = cases(500, 11, (r) => Array.from({ length: r.int(0, 4) }, () => ({ role: r.pick(ROLES) })));
  it.each(roleCases)("%s", (_l, rows) => {
    const t = userTypeFromRoles(rows);
    expect(t).toBe(webUserType(rows));
    for (const [key, path] of Object.entries(WEB_PATH)) {
      const sees = key in { dashboard: 1, calendar: 1, reservations: 1, messages: 1, inspections: 1, more: 1 } && canSeeTab(t, key as TabKey) ? true : canSeeScreen(t, key as ScreenKey);
      if (!sees) continue;
      if (path) expect(canAccessPage(t, path), `${t} sees ${key} but the website hides ${path}`).toBe(true);
      else expect(t === "admin" || t === "super_admin").toBe(true);
    }
    expect(getsPushAlerts(t)).toBe(t !== "owner");
    expect(canSeeScreen(undefined, "messages")).toBe(false);
  });
});

describe("login name -> email matches the website's login page", () => {
  const loginCases = cases(500, 12, (r) => {
    const name = r.pick(["gevorg", "Admin", " owner1 ", "a.b", "x@arami.app", "Name@Gmail.com", "", "  ", "ünï", "o'neil"]);
    return r.bool() ? name : name + r.str(6);
  });
  it.each(loginCases)("%s", (_l, id) => {
    expect(loginEmail(id)).toBe(webLoginEmail(id));
  });
});
