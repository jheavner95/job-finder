import { describe, expect, it } from "vitest";

import {
  DECISION_STATES,
  PAGE_SIZE,
  REFINEMENTS,
  buildOpportunities,
  matchesDecisionState,
  parseOpportunityQuery,
} from "../lib/opportunities";
import { needsReview } from "../lib/opportunity-presentation";
import { OPPORTUNITY_TIERS } from "../lib/opportunity-tiers";
import type { OpportunityTier } from "../lib/opportunity-tiers";
import type { JobListItem } from "../lib/view-models";

function job(over: Partial<JobListItem> & { tier?: OpportunityTier } = {}) {
  return {
    id: `job-${Math.random().toString(36).slice(2, 9)}`,
    title: "Staff Product Designer",
    company: "AlphaSense",
    companyInitials: "AL",
    location: "Remote - United States",
    remoteStatus: "Remote",
    employmentType: "Full-time",
    compensation: "Not listed",
    posted: "Aug 1, 2026",
    source: "Greenhouse",
    sourceUrl: "https://example.test",
    verification: {
      label: "Verified Today",
      tone: "verified" as const,
      importedAt: "2026-08-08T12:00:00.000Z",
      lastVerifiedAt: "2026-08-08T12:00:00.000Z",
      importAge: "2 days ago",
      officialAts: "Greenhouse",
    },
    status: "New" as const,
    score: 80,
    confidence: 67,
    eligibility: "eligible" as const,
    eligibilityAssessment: null,
    levelFit: null,
    workMode: null,
    evidenceCoverage: { coverage: 1, sufficient: true },
    summary: "",
    matchReason: "Strong fit.",
    concerns: [],
    isSynthetic: false,
    tier: "Strong Fit" as OpportunityTier,
    ...over,
  } as JobListItem & { tier?: OpportunityTier };
}

const query = (over: Partial<ReturnType<typeof parseOpportunityQuery>> = {}) => ({
  ...parseOpportunityQuery({}),
  ...over,
});

describe("unsupported filters are refused, not reinterpreted", () => {
  it("reports the value it could not honour", () => {
    /*
     * The old queue answered `?status=Applied` with all 363 rows and
     * `?tier=bogus` with the default view — a filter that appears to work and
     * silently disagrees with you.
     */
    const parsed = parseOpportunityQuery({ state: "bogus", refine: "sparkly" });
    expect(parsed.rejected).toEqual(["state=bogus", "refine=sparkly"]);
    expect(parsed.state).toBe("to-review");
  });

  it("accepts every value it advertises", () => {
    for (const state of DECISION_STATES) {
      expect(parseOpportunityQuery({ state }).rejected).toEqual([]);
    }
    for (const refine of REFINEMENTS) {
      expect(parseOpportunityQuery({ refine }).rejected).toEqual([]);
    }
  });

  it("takes a valid value in any casing", () => {
    expect(parseOpportunityQuery({ state: "APPLIED" }).state).toBe("applied");
  });

  it("ignores a nonsense page size rather than rendering zero rows", () => {
    expect(parseOpportunityQuery({ show: "-5" }).show).toBe(PAGE_SIZE);
    expect(parseOpportunityQuery({ show: "banana" }).show).toBe(PAGE_SIZE);
  });
});

describe("decision states", () => {
  it("defines 'to review' exactly once, shared with Today", () => {
    // Two definitions would drift and the two screens would disagree.
    const candidates = [
      job({ status: "New" }),
      job({ status: "Applied" }),
      job({ status: "Saved" }),
      job({ tier: "Low Relevance", score: 20 }),
      job({ levelFit: { verdict: "TOO_JUNIOR", headline: "" } as never }),
    ];
    for (const candidate of candidates) {
      expect(matchesDecisionState(candidate, "to-review")).toBe(needsReview(candidate));
    }
  });

  it("keeps a decided opportunity out of the review queue", () => {
    expect(matchesDecisionState(job({ status: "Applied" }), "to-review")).toBe(false);
    expect(matchesDecisionState(job({ status: "Applied" }), "applied")).toBe(true);
  });

  it("treats interviewing and offer as applied, because they are", () => {
    expect(matchesDecisionState(job({ status: "Interviewing" }), "applied")).toBe(true);
    expect(matchesDecisionState(job({ status: "Offer" }), "applied")).toBe(true);
  });
});

describe("decision state filters postings, before grouping", () => {
  const listings = (status: JobListItem["status"], count: number) =>
    Array.from({ length: count }, () =>
      job({ company: "Jobgether", title: "Lead AI Generative Designer", status }),
    );

  it("never shows a group whose count contradicts its own contents", () => {
    /*
     * Jobgether advertises one role as 36 postings across 36 countries. If you
     * group first and filter after, applying to one leaves a row that still
     * claims 36 listings while only 35 remain to review.
     */
    const jobs = [...listings("New", 35), ...listings("Applied", 1)];
    const toReview = buildOpportunities(jobs, query({ state: "to-review" }));
    expect(toReview.matched).toBe(1);
    expect(toReview.visible[0].listings).toBe(35);

    const applied = buildOpportunities(jobs, query({ state: "applied" }));
    expect(applied.visible[0].listings).toBe(1);
  });

  it("reports opportunities and the postings behind them separately", () => {
    const workspace = buildOpportunities(listings("New", 36), query());
    expect(workspace.matched).toBe(1);
    expect(workspace.postings).toBe(36);
  });
});

describe("refinements narrow opportunities, not postings", () => {
  // One role posted twice, scored differently on each posting.
  const straddles = [
    job({ company: "Ramp", title: "Product Designer", tier: "Strong Fit", score: 78 }),
    job({ company: "Ramp", title: "Product Designer", tier: "Worth Reviewing", score: 61 }),
  ];

  it("places each opportunity under exactly one tier", () => {
    /*
     * Applied before grouping, this role counted once under Strong Fit and
     * once under Worth Reviewing, so the lens counts summed to 251 against a
     * total of 249. An opportunity has one tier: its strongest posting's.
     */
    const workspace = buildOpportunities(straddles, query());
    const tierTotal = OPPORTUNITY_TIERS.reduce(
      (total, tier) => total + (workspace.refinementCounts[tier] ?? 0),
      0,
    );
    expect(workspace.matched).toBe(1);
    expect(tierTotal).toBe(1);
    expect(workspace.refinementCounts["Strong Fit"]).toBe(1);
    expect(workspace.refinementCounts["Worth Reviewing"]).toBe(0);
  });

  it("never shows a row that contradicts the lens that found it", () => {
    const workspace = buildOpportunities(straddles, query({ refine: "Strong Fit" }));
    expect(workspace.visible[0].tier).toBe("Strong Fit");
    // The weaker posting is still part of the opportunity, just not its face.
    expect(workspace.visible[0].listings).toBe(2);
    expect(workspace.postings).toBe(2);
  });
});

describe("paging", () => {
  const many = Array.from({ length: 120 }, (_, index) => job({ title: `Role ${index}` }));

  it("renders a page, not the whole corpus", () => {
    // The old queue rendered all 363 rows: 29 screens of continuous scroll.
    const workspace = buildOpportunities(many, query());
    expect(workspace.visible).toHaveLength(PAGE_SIZE);
    expect(workspace.matched).toBe(120);
    expect(workspace.hasMore).toBe(true);
  });

  it("stops offering more once everything is shown", () => {
    const workspace = buildOpportunities(many, query({ show: 200 }));
    expect(workspace.visible).toHaveLength(120);
    expect(workspace.hasMore).toBe(false);
  });
});

describe("counts stay honest under the current query", () => {
  it("recounts every state against the active search", () => {
    // A tab reading "Applied 4" beside a search that matches none of them is a
    // count of something the user is not looking at.
    const jobs = [
      job({ title: "Design Systems Lead", status: "Applied" }),
      job({ title: "Product Designer, Payments", status: "New" }),
    ];
    const workspace = buildOpportunities(jobs, query({ q: "payments" }));
    expect(workspace.stateCounts.applied).toBe(0);
    expect(workspace.stateCounts["to-review"]).toBe(1);
  });

  it("searches location as well as role and company", () => {
    const jobs = [job({ location: "Berlin, Germany" }), job({ title: "Other", location: "Austin" })];
    expect(buildOpportunities(jobs, query({ q: "berlin" })).matched).toBe(1);
  });
});
