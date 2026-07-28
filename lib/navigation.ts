export const NAV_GROUPS = [
  {
    id: "daily",
    label: "Daily",
    items: [
      { href: "/", label: "Dashboard", icon: "layout" },
      { href: "/briefing", label: "Daily Briefing", icon: "sunrise" },
      { href: "/review", label: "Review Queue", icon: "clipboard-check" },
      { href: "/applications", label: "Applications", icon: "briefcase" },
    ],
  },
  {
    id: "discovery",
    label: "Discovery",
    items: [
      { href: "/discovery", label: "Discovery Workspace", icon: "radar" },
      { href: "/sources", label: "Company Sources", icon: "target" },
      { href: "/scan", label: "Scan History", icon: "bar-chart" },
      { href: "/searches", label: "Saved Searches", icon: "bookmark-search" },
      { href: "/import", label: "Import Jobs", icon: "upload" },
    ],
  },
  {
    id: "career",
    label: "Career",
    items: [
      { href: "/context", label: "Career Profile", icon: "target" },
      { href: "/evidence", label: "Career Evidence", icon: "folder" },
      { href: "/insights", label: "Insights", icon: "bar-chart" },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { href: "/notifications", label: "Notifications", icon: "bell" },
      { href: "/reports", label: "Reports", icon: "bar-chart" },
    ],
  },
] as const;

export const NAV_STORAGE_KEY = "job-search-intelligence.nav-sections";
