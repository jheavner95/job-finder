import { describe, expect, it } from "vitest";

import { NAV_GROUPS } from "../lib/navigation";
import { SYSTEM_NAV, isCurrentSystemRoute } from "../lib/system-nav";

const items = NAV_GROUPS.flatMap((group) => group.items);

describe("primary navigation is the product, not the machinery", () => {
  it("offers six destinations in workflow order", () => {
    /*
     * Was eleven items in four groups, five of them operational: Discovery
     * Workspace, Company Sources, Scan History, Saved Searches, Import Jobs.
     */
    expect(items.map((item) => item.label)).toEqual([
      "Today",
      "Opportunities",
      "Applications",
      "Companies",
      "Your Profile",
      "System",
    ]);
    expect(items.map((item) => item.href)).toEqual([
      "/",
      "/review",
      "/applications",
      "/sources",
      "/context",
      "/system",
    ]);
  });

  it("keeps System behind a rule rather than among the daily work", () => {
    const separated = NAV_GROUPS.filter((group) => group.separated);
    expect(separated).toHaveLength(1);
    expect(separated[0].items.map((item) => item.href)).toEqual(["/system"]);
  });

  it("exposes no operational route as a peer of daily work", () => {
    // Every one of these is now reachable only inside System.
    const operational = ["/discovery", "/scan", "/searches", "/import", "/notifications"];
    for (const route of operational) {
      expect(items.some((item) => item.href === route)).toBe(false);
    }
  });

  it("does not promote a route that has nothing to say", () => {
    // Reports carried one figure Today already states; Insights reports "not
    // enough historical data" for every metric it owns.
    expect(items.some((item) => item.href === "/reports" || item.href === "/insights")).toBe(false);
  });

  it("lists each destination exactly once", () => {
    const hrefs = items.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("System keeps its own navigation", () => {
  it("collects the operational routes it absorbed", () => {
    expect(SYSTEM_NAV.map((item) => item.href)).toEqual([
      "/system",
      "/system/sources",
      "/system/scans",
      "/system/schedules",
      "/system/activity",
      "/system/import",
    ]);
  });

  it("keeps a nested route marked as its own section, not as Overview", () => {
    // "I am in System" has to survive depth: a scan result is still Scans.
    const overview = SYSTEM_NAV[0];
    const scans = SYSTEM_NAV.find((item) => item.href === "/system/scans")!;
    expect(isCurrentSystemRoute("/system/scans", scans)).toBe(true);
    expect(isCurrentSystemRoute("/system/scans", overview)).toBe(false);
    expect(isCurrentSystemRoute("/system", overview)).toBe(true);
  });
});
