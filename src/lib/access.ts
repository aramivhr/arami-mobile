// Which tabs and screens each user type sees in the app.
//
// User types come from the website's user_roles table (see useUserType). The
// website gates pages the same way (PAGE_ACCESS in rent-halo-system
// src/hooks/use-users.ts); the app shows a smaller set of pages, chosen by Gevorg.
// To add a user type later, add it to UserType and give it a row in each map.

export type UserType = "super_admin" | "admin" | "owner";

export type TabKey = "dashboard" | "calendar" | "reservations" | "messages" | "inspections" | "more";

/** Bottom tabs per user type, in display order. "more" is always last. */
export const TABS_BY_TYPE: Record<UserType, TabKey[]> = {
  super_admin: ["dashboard", "calendar", "messages", "inspections", "more"],
  admin: ["dashboard", "calendar", "messages", "inspections", "more"],
  owner: ["dashboard", "calendar", "reservations", "more"],
};

export type ScreenKey = "reservations" | "notifications" | "messages" | "financial";

/** Screens reachable from the "More" menu, per user type. */
export const MORE_BY_TYPE: Record<UserType, ScreenKey[]> = {
  // Super admins see everything admins see, plus Financial.
  super_admin: ["reservations", "notifications", "financial"],
  admin: ["reservations", "notifications"],
  owner: ["financial"],
};

export function canSeeTab(type: UserType | undefined, tab: TabKey) {
  return !!type && TABS_BY_TYPE[type].includes(tab);
}

export function canSeeScreen(type: UserType | undefined, screen: ScreenKey) {
  if (!type) return false;
  return (TABS_BY_TYPE[type] as string[]).includes(screen) || MORE_BY_TYPE[type].includes(screen);
}
