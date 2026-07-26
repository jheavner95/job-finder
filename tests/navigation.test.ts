import { describe, expect, it } from "vitest";

import { NAV_GROUPS } from "../lib/navigation";

describe("workflow navigation", () => {
  it("groups every stable route once in the requested workflow order", () => {
    expect(NAV_GROUPS.map((group) => group.label)).toEqual([
      "Daily",
      "Discovery",
      "Career",
      "System",
    ]);
    expect(NAV_GROUPS.map((group) => group.items.map((item) => item.label))).toEqual([
      ["Dashboard", "Daily Briefing", "Review Queue"],
      ["Sources", "Saved Searches", "Import Jobs"],
      ["Career Profile", "Career Evidence"],
      ["Notifications", "Reports"],
    ]);
    const routes = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.href));
    expect(new Set(routes).size).toBe(routes.length);
    expect(routes).toEqual([
      "/",
      "/briefing",
      "/review",
      "/sources",
      "/searches",
      "/import",
      "/context",
      "/evidence",
      "/notifications",
      "/reports",
    ]);
  });
});
