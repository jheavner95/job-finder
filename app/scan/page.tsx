import { redirect } from "next/navigation";

/**
 * Moved by UX-5. Kept so links, bookmarks and history keep working.
 * See docs/route-map.md for why this destination.
 */
export default function Moved() {
  redirect("/system/scans");
}
