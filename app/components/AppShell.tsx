"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { NAV_GROUPS, NAV_STORAGE_KEY } from "@/lib/navigation";
import { NavIcon, type NavIconName } from "./NavIcon";

export function AppShell({
  children,
  showGettingStarted,
}: {
  children: React.ReactNode;
  showGettingStarted: boolean;
}) {
  const pathname = usePathname();
  const groups = NAV_GROUPS.map((group) => group.id === "career" && showGettingStarted
    ? {
        ...group,
        items: [
          { href: "/getting-started", label: "Getting Started", icon: "flag" },
          ...group.items,
        ],
      }
    : group);
  const activeGroup = groups.find((group) => group.items.some((item) =>
    item.href === "/"
      ? pathname === "/"
      : pathname.startsWith(item.href)
        || (item.href === "/review" && pathname.startsWith("/jobs/")),
  ))?.id;
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(NAV_GROUPS.map((group) => [group.id, true])),
  );

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(NAV_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, boolean>;
        queueMicrotask(() => setExpanded((current) => ({ ...current, ...parsed })));
      }
    } catch {
      // Invalid local state falls back to the fully expanded navigation.
    }
  }, []);

  const toggleGroup = (groupId: string) => {
    setExpanded((current) => {
      const next = {
        ...current,
        [groupId]: groupId === activeGroup ? true : !current[groupId],
      };
      window.localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
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
          {groups.map((group) => {
            const isExpanded = group.id === activeGroup || expanded[group.id];
            return (
              <section className="nav-group" key={group.id} aria-labelledby={`nav-${group.id}-label`}>
                <button
                  type="button"
                  className="nav-group-toggle"
                  aria-expanded={isExpanded}
                  aria-controls={`nav-${group.id}-items`}
                  onClick={() => toggleGroup(group.id)}
                >
                  <span id={`nav-${group.id}-label`}>{group.label}</span>
                  <i aria-hidden="true">{isExpanded ? "−" : "+"}</i>
                </button>
                <div id={`nav-${group.id}-items`} hidden={!isExpanded}>
                  {group.items.map((item) => {
                    const active =
                      item.href === "/"
                        ? pathname === "/"
                        : pathname.startsWith(item.href)
                          || (item.href === "/review" && pathname.startsWith("/jobs/"));
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
                </div>
              </section>
            );
          })}
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
