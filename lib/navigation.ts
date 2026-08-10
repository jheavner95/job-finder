/**
 * Six destinations, one boundary.
 *
 * Before UX-5 the sidebar held eleven items in four groups, and five of them
 * were operational: Discovery Workspace, Company Sources, Scan History, Saved
 * Searches, Import Jobs. Notifications and Reports sat under a "System" heading
 * that was a label rather than a place. A person deciding which job to apply to
 * had to read past the machinery to reach their work.
 *
 * Everything above the rule is the job search. Everything the engine needs to
 * say about itself is behind one door.
 */
type NavGroup = {
  id: string;
  /** Rendered below a rule: operational, not part of the daily product. */
  separated?: boolean;
  items: readonly { href: string; label: string; icon: string }[];
};

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: "product",
    items: [
      { href: "/", label: "Today", icon: "sunrise" },
      { href: "/review", label: "Opportunities", icon: "clipboard-check" },
      { href: "/applications", label: "Applications", icon: "briefcase" },
      // The user's watchlist: companies Job Finder monitors for them. Board
      // resolution, providers and crawl health are the engine's business and
      // live under System.
      { href: "/sources", label: "Companies", icon: "target" },
      /*
       * `/context` is the canonical profile route, settled at UX-6.
       *
       * It owns every candidate preference the product persists. Career
       * Evidence (`/evidence`), Writing Voice (`/context/writing-voice`) and
       * résumé import (`/getting-started`) are reachable from inside it as
       * detail surfaces rather than as peers. The path is not renamed to
       * `/profile`: it would break links to buy nothing visible.
       */
      { href: "/context", label: "Your Profile", icon: "folder" },
    ],
  },
  {
    id: "system",
    separated: true,
    items: [{ href: "/system", label: "System", icon: "radar" }],
  },
];

export const NAV_STORAGE_KEY = "job-search-intelligence.nav-sections";
