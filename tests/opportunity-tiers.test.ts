import { describe, expect, it } from "vitest";

import { presentDashboard } from "../lib/dashboard-presentation";
import type { JobListItem } from "../lib/view-models";
import {
  MAXIMUM_SCORE,
  MINIMUM_SCORE,
  OPPORTUNITY_TIERS,
  REVIEWABLE_TIERS,
  clampScore,
  compareByTier,
  isOpportunityTier,
  isReviewable,
  resolveTier,
  tierForScore,
  tierFromReasoning,
  tierRank,
  tierTone,
  toneForScore,
} from "../lib/opportunity-tiers";

describe("tierForScore band boundaries", () => {
  it("places every band boundary exactly", () => {
    expect(tierForScore(41)).toBe("Low Relevance");
    expect(tierForScore(42)).toBe("Stretch");
    expect(tierForScore(57)).toBe("Stretch");
    expect(tierForScore(58)).toBe("Worth Reviewing");
    expect(tierForScore(71)).toBe("Worth Reviewing");
    expect(tierForScore(72)).toBe("Strong Fit");
    expect(tierForScore(84)).toBe("Strong Fit");
    expect(tierForScore(85)).toBe("Excellent Fit");
  });

  it("covers the observed design-role score range with reviewable tiers", () => {
    for (let score = 65; score <= 87; score += 1) {
      expect(isReviewable(tierForScore(score))).toBe(true);
    }
  });

  it("assigns the floor and ceiling of the score range", () => {
    expect(tierForScore(MINIMUM_SCORE)).toBe("Low Relevance");
    expect(tierForScore(MAXIMUM_SCORE)).toBe("Excellent Fit");
  });
});

describe("clamping", () => {
  it("clamps 0 and 100 to themselves", () => {
    expect(clampScore(0)).toBe(0);
    expect(clampScore(100)).toBe(100);
  });

  it("clamps out-of-range scores into the 0-100 window", () => {
    expect(clampScore(-25)).toBe(0);
    expect(clampScore(250)).toBe(100);
    expect(tierForScore(-25)).toBe("Low Relevance");
    expect(tierForScore(250)).toBe("Excellent Fit");
  });

  it("rounds fractional scores before banding", () => {
    expect(clampScore(41.6)).toBe(42);
    expect(tierForScore(41.6)).toBe("Stretch");
    expect(tierForScore(41.4)).toBe("Low Relevance");
  });

  it("treats non-finite scores as the lowest tier", () => {
    expect(clampScore(Number.NaN)).toBe(0);
    expect(tierForScore(Number.NaN)).toBe("Low Relevance");
    expect(tierForScore(Number.POSITIVE_INFINITY)).toBe("Excellent Fit");
    expect(tierForScore(Number.NEGATIVE_INFINITY)).toBe("Low Relevance");
  });
});

describe("isReviewable", () => {
  it("returns the expected answer for all five tiers", () => {
    expect(isReviewable("Excellent Fit")).toBe(true);
    expect(isReviewable("Strong Fit")).toBe(true);
    expect(isReviewable("Worth Reviewing")).toBe(true);
    expect(isReviewable("Stretch")).toBe(true);
    expect(isReviewable("Low Relevance")).toBe(false);
  });

  it("exposes exactly one hidden tier", () => {
    expect(REVIEWABLE_TIERS).toEqual([
      "Excellent Fit",
      "Strong Fit",
      "Worth Reviewing",
      "Stretch",
    ]);
    expect(OPPORTUNITY_TIERS.filter((tier) => !isReviewable(tier))).toEqual([
      "Low Relevance",
    ]);
  });
});

describe("tierRank", () => {
  it("ranks excellent first and low relevance last", () => {
    expect(tierRank("Excellent Fit")).toBe(0);
    expect(tierRank("Strong Fit")).toBe(1);
    expect(tierRank("Worth Reviewing")).toBe(2);
    expect(tierRank("Stretch")).toBe(3);
    expect(tierRank("Low Relevance")).toBe(4);
  });

  it("orders a shuffled list strongest first", () => {
    const shuffled = [...OPPORTUNITY_TIERS].reverse();
    expect([...shuffled].sort((a, b) => tierRank(a) - tierRank(b))).toEqual([
      ...OPPORTUNITY_TIERS,
    ]);
  });

  it("keeps rank monotonic with descending score", () => {
    const scores = [100, 85, 84, 72, 71, 58, 57, 42, 41, 0];
    const ranks = scores.map((score) => tierRank(tierForScore(score)));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });
});

describe("tone mapping", () => {
  it("reuses the existing score tones", () => {
    expect(tierTone("Excellent Fit")).toBe("strong");
    expect(tierTone("Strong Fit")).toBe("strong");
    expect(tierTone("Worth Reviewing")).toBe("possible");
    expect(tierTone("Stretch")).toBe("possible");
    expect(tierTone("Low Relevance")).toBe("low");
    expect(toneForScore(90)).toBe("strong");
    expect(toneForScore(50)).toBe("possible");
    expect(toneForScore(10)).toBe("low");
  });
});

describe("persistence helpers", () => {
  it("recognizes valid tier strings only", () => {
    expect(isOpportunityTier("Stretch")).toBe(true);
    expect(isOpportunityTier("stretch")).toBe(false);
    expect(isOpportunityTier(null)).toBe(false);
    expect(isOpportunityTier(3)).toBe(false);
  });

  it("reads a tier out of a stored reasoning blob", () => {
    expect(tierFromReasoning({ summary: "x", tier: "Worth Reviewing" })).toBe(
      "Worth Reviewing",
    );
    expect(tierFromReasoning({ summary: "x" })).toBeNull();
    expect(tierFromReasoning({ tier: "Nonsense" })).toBeNull();
    expect(tierFromReasoning(null)).toBeNull();
    expect(tierFromReasoning(["Stretch"])).toBeNull();
  });

  it("falls back to the score when no tier was persisted", () => {
    expect(resolveTier(90, { tier: "Stretch" })).toBe("Stretch");
    expect(resolveTier(90, { summary: "legacy" })).toBe("Excellent Fit");
    expect(resolveTier(30)).toBe("Low Relevance");
  });
});

function fixture(
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
    matchReason: "Deterministic fit.",
    concerns: [],
    isSynthetic: true,
  };
}

describe("tier-driven dashboard attention", () => {
  it("keeps every reviewable tier in the attention list", () => {
    const result = presentDashboard([
      fixture("stretch", 45, "New"),
      fixture("worth", 60, "New"),
      fixture("strong", 75, "New"),
      fixture("excellent", 90, "New"),
    ]);
    expect(result.attention.map((item) => item.id)).toEqual([
      "excellent",
      "strong",
    ]);
    expect(result.awaitingReview).toBe(4);
  });

  it("counts exactly the opportunities the attention list can surface", () => {
    // A 45-point Stretch role used to be filtered out of the list while still
    // inflating the awaiting-review count.
    const jobs = [
      fixture("stretch", 45, "New"),
      fixture("low", 20, "New"),
      fixture("worth", 65, "Possible"),
    ];
    const result = presentDashboard(jobs);
    const reviewable = jobs.filter(
      (job) =>
        isReviewable(tierForScore(job.score)) &&
        ["New", "Strong Match", "Possible"].includes(job.status),
    );
    expect(result.awaitingReview).toBe(reviewable.length);
    expect(result.awaitingReview).toBe(2);
  });

  it("holds back only low relevance opportunities", () => {
    const result = presentDashboard([fixture("low", 20, "New")]);
    expect(result.attention).toEqual([]);
    expect(result.awaitingReview).toBe(0);
    expect(result.briefing.title).toBe("Nothing needs an immediate decision.");
  });
});

describe("compareByTier", () => {
  it("sorts by tier rank, then score descending, then title", () => {
    const items = [
      { tier: tierForScore(60), score: 60, title: "Worth reviewing" },
      { tier: tierForScore(30), score: 30, title: "Low" },
      { tier: tierForScore(88), score: 88, title: "Excellent" },
      { tier: tierForScore(80), score: 80, title: "Bravo strong" },
      { tier: tierForScore(80), score: 80, title: "Alpha strong" },
    ];
    expect([...items].sort(compareByTier).map((item) => item.title)).toEqual([
      "Excellent",
      "Alpha strong",
      "Bravo strong",
      "Worth reviewing",
      "Low",
    ]);
  });
});
