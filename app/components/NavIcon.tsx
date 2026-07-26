import type { ReactNode } from "react";

export type NavIconName =
  | "layout"
  | "sunrise"
  | "clipboard-check"
  | "radar"
  | "bookmark-search"
  | "upload"
  | "flag"
  | "target"
  | "folder"
  | "bell"
  | "bar-chart";

export function NavIcon({ name }: { name: NavIconName }) {
  let paths: ReactNode;
  switch (name) {
    case "layout":
      paths = <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>;
      break;
    case "sunrise":
      paths = <><path d="M12 2v3M4.2 5.2l2.1 2.1M19.8 5.2l-2.1 2.1M3 17h18M5 21h14" /><path d="M7 17a5 5 0 0 1 10 0" /></>;
      break;
    case "clipboard-check":
      paths = <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2h6v2M9 13l2 2 4-5" /></>;
      break;
    case "radar":
      paths = <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><path d="M12 12l5-5M12 3v2M21 12h-2" /></>;
      break;
    case "bookmark-search":
      paths = <><path d="M6 3h10v8M6 3v18l5-3 2 1.2" /><circle cx="17" cy="16" r="3" /><path d="m19.2 18.2 2 2" /></>;
      break;
    case "upload":
      paths = <><path d="M12 16V4M8 8l4-4 4 4M4 15v5h16v-5" /></>;
      break;
    case "flag":
      paths = <><path d="M5 22V3M5 4h12l-2 4 2 4H5" /></>;
      break;
    case "target":
      paths = <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>;
      break;
    case "folder":
      paths = <><path d="M3 6h7l2 2h9v11H3z" /><path d="M3 10h18" /></>;
      break;
    case "bell":
      paths = <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>;
      break;
    case "bar-chart":
      paths = <><path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7M2 20h20" /></>;
      break;
  }
  return (
    <svg aria-hidden="true" className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths}
    </svg>
  );
}
