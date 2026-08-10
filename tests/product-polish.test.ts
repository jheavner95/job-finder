import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("product polish contracts", () => {
  const styles = readFileSync("app/globals.css", "utf8");

  it("defines shared interaction, spacing, radius, type, and surface tokens", () => {
    for (const token of [
      "--focus-ring",
      "--shadow-sm",
      "--radius-md",
      "--space-4",
      "--text-sm",
      "--control-height",
      "--transition-fast",
      "--surface-subtle",
    ]) {
      expect(styles).toContain(token);
    }
  });

  it("provides consistent focus, disabled, reduced-motion, and overflow behavior", () => {
    expect(styles).toContain("summary:focus-visible");
    expect(styles).toContain("button):disabled");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain(".sources-table-wrap { max-width: 100%; overflow-x: auto");
    expect(styles).toContain(".import-workspace { grid-template-columns: 1fr;");
  });

  it("provides independent loading and error states for primary workspaces", () => {
    for (const route of [
      // UX-5 moved the operational workspaces under System; redirect stubs at
      // the old paths inherit the root boundary and need none of their own.
      "evidence",
      "getting-started",
      "review",
      "sources",
      "system",
      "system/activity",
      "system/import",
      "system/schedules",
      "system/sources",
    ]) {
      expect(readFileSync(`app/${route}/loading.tsx`, "utf8")).toMatch(/loading|skeleton/i);
      expect(readFileSync(`app/${route}/error.tsx`, "utf8")).toContain("../error");
    }
  });

  it("uses a shared pending button for server-action forms", () => {
    const button = readFileSync("app/components/SubmitButton.tsx", "utf8");
    expect(button).toContain("useFormStatus");
    expect(button).toContain("aria-busy");
    for (const page of ["sources", "system/schedules", "system/activity", "evidence"]) {
      expect(readFileSync(`app/${page}/page.tsx`, "utf8")).toContain("SubmitButton");
    }
  });
});
