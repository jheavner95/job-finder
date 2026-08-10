/**
 * System's own navigation.
 *
 * These five destinations used to be five of the eleven items in the global
 * sidebar, which put "Saved Searches" and "Scan History" at the same level as
 * Today. They are the machinery: you visit them when something is wrong or when
 * you want to make discovery do something now, not as part of a day's work.
 *
 * Local to System, so the primary navigation stays six items and the user can
 * always tell that they are in System rather than lost in a subsystem.
 */
export const SYSTEM_NAV = [
  { href: "/system", label: "Overview", exact: true },
  { href: "/system/sources", label: "Sources" },
  { href: "/system/scans", label: "Scans" },
  { href: "/system/schedules", label: "Schedules" },
  { href: "/system/activity", label: "Activity" },
  { href: "/system/import", label: "Import" },
] as const;

/** Nested routes keep their section marked, so "I am in System" survives depth. */
export function isCurrentSystemRoute(pathname: string, item: { href: string; exact?: boolean }) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}
