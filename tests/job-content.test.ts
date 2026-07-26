import { describe, expect, it } from "vitest";

import { normalizePostingContent, plainPostingText } from "../lib/job-content";

describe("provider posting content", () => {
  it("preserves structure and safe links without leaking HTML", () => {
    const result = normalizePostingContent(`
      <style>.track{display:none}</style><script>alert(1)</script>
      <h2>What you'll do</h2>
      <ul><li style="color:red" onclick="track()">Lead research</li><li>Build systems</li></ul>
      <p>Read the <a href="https://example.com/job?utm_source=test" data-track="1">official posting</a>.<br>Apply thoughtfully.</p>
      <img width="1" height="1" src="https://tracker.invalid/pixel">
    `);

    expect(result).toContain("### What you'll do");
    expect(result).toContain("- Lead research");
    expect(result).toContain("[official posting](https://example.com/job?utm_source=test)");
    expect(result).not.toMatch(/<[^>]+>|alert\(|onclick|pixel/);
  });

  it("removes markup from queue-safe summaries", () => {
    expect(plainPostingText("<p>Strong <strong>enterprise</strong> fit.</p>"))
      .toBe("Strong enterprise fit.");
  });

  it("rejects unsafe link protocols while preserving their labels", () => {
    expect(normalizePostingContent('<a href="javascript:alert(1)">Apply here</a>'))
      .toBe("Apply here");
  });
});
