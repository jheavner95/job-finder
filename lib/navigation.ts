export const NAV_GROUPS = [
  {
    id: "daily",
    label: "Daily",
    items: [
      { href: "/", label: "Dashboard", icon: "layout" },
      { href: "/briefing", label: "Daily Briefing", icon: "sunrise" },
      { href: "/review", label: "Review Queue", icon: "clipboard-check" },
    ],
  },
  {
    id: "discovery",
    label: "Discovery",
    items: [
      { href: "/sources", label: "Sources", icon: "radar" },
      { href: "/searches", label: "Saved Searches", icon: "bookmark-search" },
      { href: "/import", label: "Import Jobs", icon: "upload" },
    ],
  },
  {
    id: "career",
    label: "Career",
    items: [
      { href: "/context", label: "Job Finder", icon: "target" },
      { href: "/evidence", label: "Career Evidence", icon: "folder" },
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
