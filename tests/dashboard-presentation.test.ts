import { describe, expect, it } from "vitest";

import { presentDashboard } from "../lib/dashboard-presentation";
import type { JobListItem } from "../lib/view-models";

function job(
  id: string,
  score: number,
  status: JobListItem["status"],
): JobListItem {
  return {
    id,
    score,
    status,
    title: `Role ${id}`,
    company: "Example",
    companyInitials: "EX",
    location: "Chicago, IL",
    remoteStatus: "Remote",
    employmentType: "Full-time",
    compensation: "Not listed",
    posted: "Date unavailable",
    source: "Fixture",
    sourceUrl: "https://example.com/jobs/fixture",
    verification: {
      label: "Verified Today",
      tone: "verified",
      importedAt: "2026-07-26T12:00:00.000Z",
      lastVerifiedAt: "2026-07-26T12:00:00.000Z",
      importAge: "Just imported",
      officialAts: "Fixture",
    },
    confidence: 70,
    eligibility: "eligible",
    eligibilityAssessment: null,
    summary: "Deterministic test summary.",
    matchReason: "Strong deterministic fit.",
    concerns: [],
    isSynthetic: true,
  };
}

describe("dashboard presentation", () => {
  it("prioritizes strong matches before other attention states", () => {
    const result = presentDashboard([
      job("saved", 95, "Saved"),
      job("possible", 75, "Possible"),
      job("strong", 89, "Strong Match"),
    ]);
    expect(result.attention.map((item) => item.id)).toEqual([
      "strong",
      "possible",
    ]);
    expect(result.primaryAction?.label).toBe("Review Today’s Matches");
  });

  it("falls back to possible matches when no strong match needs review", () => {
    const result = presentDashboard([
      job("possible-low", 60, "Possible"),
      job("possible-high", 80, "New"),
    ]);
    expect(result.attention.map((item) => item.id)).toEqual([
      "possible-high",
      "possible-low",
    ]);
    expect(result.briefing.detail).toBe("No strong match is currently available.");
    expect(result.primaryAction?.label).toBe("Open review queue");
  });

  it("selects a calm foundational state for an empty database", () => {
    const result = presentDashboard([]);
    expect(result.attention).toEqual([]);
    expect(result.primaryAction).toBeNull();
    expect(result.briefing.title).toBe("Your private workspace is ready.");
  });

  it("uses a compact empty application state", () => {
    const result = presentDashboard([job("saved", 70, "Saved")]);
    expect(result.activeApplications).toEqual([]);
  });

  it("summarizes active applications by meaningful state", () => {
    const result = presentDashboard([
      job("applied", 80, "Applied"),
      job("offer", 78, "Offer"),
      job("interview", 90, "Interviewing"),
    ]);
    expect(result.activeApplications.map((item) => item.id)).toEqual([
      "offer",
      "interview",
      "applied",
    ]);
  });

  it("suppresses irrelevant zero decision counts deterministically", () => {
    const result = presentDashboard([job("closed", 40, "Closed")]);
    expect(result.awaitingReview).toBe(0);
    expect(result.saved).toBe(0);
    expect(result.recentlyClosed).toBe(1);
  });
});
