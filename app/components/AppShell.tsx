"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_GROUPS } from "@/lib/navigation";
import { NavIcon, type NavIconName } from "./NavIcon";

/**
 * Six destinations, always visible.
 *
 * The sidebar used to be four collapsible groups of eleven items, with the
 * open/closed state persisted to localStorage. Collapsing exists to manage a
 * long list; six items are not a long list, and a navigation that remembers a
 * shape from last week is not stable. Everything is shown, nothing toggles.
 */
export function AppShell({
  children,
  showGettingStarted,
}: {
  children: React.ReactNode;
  /** First-run onboarding, appended rather than given a permanent slot. */
  showGettingStarted: boolean;
}) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    // An opportunity detail page belongs to Opportunities, even from elsewhere.
    if (href === "/review") return pathname.startsWith("/review") || pathname.startsWith("/jobs/");
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Job Finder home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 36 36" fill="none">
              <circle cx="18" cy="18" r="9.5" />
              <circle cx="18" cy="18" r="4.5" />
              <path d="M18 5.5V9M18 27v3.5M5.5 18H9M27 18h3.5" />
              <path className="brand-mark-accent" d="m23.5 12.5 5-5M24 8h4.5v4.5" />
            </svg>
          </span>
          <span><b>Job Finder</b><small>Intelligence</small></span>
        </Link>
        <nav aria-label="Primary navigation" className="nav-groups">
          {NAV_GROUPS.map((group) => (
            <section
              className={group.separated ? "nav-group nav-group-separated" : "nav-group"}
              key={group.id}
            >
              {group.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    className={active ? "nav-item active" : "nav-item"}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                  >
                    <span aria-hidden="true"><NavIcon name={item.icon as NavIconName} /></span>{item.label}
                  </Link>
                );
              })}
            </section>
          ))}
          {showGettingStarted && (
            <section className="nav-group nav-group-separated">
              <Link
                className={isActive("/getting-started") ? "nav-item active" : "nav-item"}
                href="/getting-started"
                aria-current={isActive("/getting-started") ? "page" : undefined}
              >
                <span aria-hidden="true"><NavIcon name="flag" /></span>Getting Started
              </Link>
            </section>
          )}
        </nav>
        <div className="sidebar-foot">
          <div className="profile-dot" aria-hidden="true">●</div>
          <div><strong>Your workspace</strong><small>Private · local context</small></div>
          <span aria-hidden="true">•••</span>
        </div>
      </aside>
      <main id="main-content">{children}</main>
    </div>
  );
}
