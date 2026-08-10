"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SYSTEM_NAV, isCurrentSystemRoute } from "@/lib/system-nav";

export function SystemNav() {
  const pathname = usePathname();
  return (
    <nav className="system-nav" aria-label="System sections">
      {SYSTEM_NAV.map((item) => {
        const current = isCurrentSystemRoute(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={current ? "is-selected" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
