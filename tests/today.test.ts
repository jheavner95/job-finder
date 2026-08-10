import { describe, expect, it } from "vitest";

import {
  NEW_TODAY_LIMIT,
  START_HERE_LIMIT,
  buildToday,
  groupKey,
  groupOpportunities,
} from "../lib/today";
import { buildOpportunities, parseOpportunityQuery } from "../lib/opportunities";
import type { JobListItem } from "../lib/view-models";
import type { OpportunityTier } from "../lib/opportunity-tiers";

const NOW = new Date("2026-08-10T12:00:00Z");
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000).toISOString();

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
      importedAt: hoursAgo(48),
      lastVerifiedAt: hoursAgo(48),
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

describe("duplicate grouping", () => {
  it("treats identical employer and title as one opportunity", () => {
    expect(groupKey(job({ company: "AlphaSense", title: "Staff Product Designer" })))
      .toBe(groupKey(job({ company: "alphasense", title: "Staff  Product Designer" })));
  });

  it("keeps genuinely different roles apart", () => {
    // Nothing fuzzy: one extra word usually means a different job.
    expect(groupKey(job({ title: "Staff Product Designer" })))
      .not.toBe(groupKey(job({ title: "Staff Product Designer, Growth" })));
    expect(groupKey(job({ company: "AlphaSense" })))
      .not.toBe(groupKey(job({ company: "Alpha Sense" })));
  });

  it("collapses one role listed in three cities into one row", () => {
    // AlphaSense lists the same Senior/Staff role in New York, the UK and
    // Helsinki, all scoring 88; it used to occupy both premium slots.
    const grouped = groupOpportunities([
      job({ location: "New York, New York, United States", score: 88 }),
      job({ location: "Remote - United Kingdom", score: 88 }),
      job({ location: "Helsinki, Uusimaa, Finland", score: 88 }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].listings).toBe(3);
    expect(grouped[0].locations).toBe(3);
  });

  it("keeps the strongest member of a group", () => {
    const grouped = groupOpportunities([
      job({ score: 60, tier: "Worth Reviewing", location: "A" }),
      job({ score: 84, tier: "Strong Fit", location: "B" }),
    ]);
    expect(grouped[0].score).toBe(84);
  });

  it("reports repeated listings at one location as listings, not locations", () => {
    // Jobgether posts one role dozens of times against the same place.
    const grouped = groupOpportunities([
      job({ company: "Jobgether", title: "Lead AI Generative Designer", location: "Remote" }),
      job({ company: "Jobgether", title: "Lead AI Generative Designer", location: "Remote" }),
    ]);
    expect(grouped[0].listings).toBe(2);
    expect(grouped[0].locations).toBe(1);
  });
});

describe("Today is bounded", () => {
  const many = Array.from({ length: 40 }, (_, index) =>
    job({ title: `Role ${index}`, score: 90 - index, importedAt: hoursAgo(2) } as never),
  );

  it("never renders the whole queue", () => {
    // The old briefing listed all 95 new opportunities on one page.
    const today = buildToday(many, NOW);
    expect(today.startHere.length).toBeLessThanOrEqual(START_HERE_LIMIT);
    expect(today.newToday.length).toBeLessThanOrEqual(NEW_TODAY_LIMIT);
  });

  it("does not repeat a role between its two lists", () => {
    const recent = Array.from({ length: 10 }, (_, index) =>
      job({
        title: `Role ${index}`,
        score: 90 - index,
        verification: { ...job().verification, importedAt: hoursAgo(2) },
      }),
    );
    const today = buildToday(recent, NOW);
    const startIds = new Set(today.startHere.map((item) => item.id));
    expect(today.newToday.some((item) => startIds.has(item.id))).toBe(false);
  });
});

describe("Today selects only what needs a decision", () => {
  it("leaves decided opportunities out of the shortlist", () => {
    const today = buildToday(
      [job({ status: "Applied", score: 95 }), job({ title: "Undecided", status: "New", score: 70 })],
      NOW,
    );
    expect(today.startHere.map((item) => item.title)).toEqual(["Undecided"]);
  });

  it("counts new arrivals ungrouped, so 'new' means the same everywhere", () => {
    const today = buildToday(
      [
        job({ verification: { ...job().verification, importedAt: hoursAgo(2) } }),
        job({ verification: { ...job().verification, importedAt: hoursAgo(3) } }),
        job({ verification: { ...job().verification, importedAt: hoursAgo(40) } }),
      ],
      NOW,
    );
    // Two arrived in the window even though they group into one row.
    expect(today.newCount).toBe(2);
    expect(today.startHere).toHaveLength(1);
  });
});

describe("attention lines appear only when there is something behind them", () => {
  it("stays silent when nothing needs a decision", () => {
    expect(buildToday([job()], NOW).attention).toEqual([]);
  });

  it("raises eligibility checks and off-level roles when present", () => {
    const today = buildToday(
      [
        job({ title: "A", eligibilityAssessment: { verdict: "REVIEW_REQUIRED", headline: "" } as never }),
        job({ title: "B", levelFit: { verdict: "TOO_JUNIOR", headline: "" } as never }),
      ],
      NOW,
    );
    expect(today.attention.map((item) => item.id)).toEqual(["eligibility", "outside-level"]);
  });

  it("links each line to a filter that actually holds what it counts", () => {
    /*
     * These used to point at `/review?tier=Off+level`, a parameter the queue
     * never read, so the link landed on the unfiltered list. Every destination
     * is parsed here rather than eyeballed, and off-level roles are looked for
     * in `all` because "to review" excludes them by definition.
     */
    const jobs = [
      job({ title: "A", eligibilityAssessment: { verdict: "REVIEW_REQUIRED", headline: "" } as never }),
      job({ title: "B", levelFit: { verdict: "TOO_JUNIOR", headline: "" } as never }),
    ];
    for (const item of buildToday(jobs, NOW).attention) {
      const params = Object.fromEntries(new URL(item.href, "http://x").searchParams);
      const parsed = parseOpportunityQuery(params);
      expect(parsed.rejected).toEqual([]);
      expect(buildOpportunities(jobs, { ...parsed, show: 50 }).matched).toBe(item.count);
    }
  });

  it("reports recorded decisions rather than an empty application table", () => {
    /*
     * Four opportunities are marked Applied through UserDecision while the
     * Application table holds nothing. Today reports the decisions it can
     * verify; showing "0 applications" beside them would be a contradiction.
     */
    const today = buildToday([job({ status: "Applied" }), job({ status: "Saved" })], NOW);
    expect(today.decided).toEqual({ applied: 1, saved: 1 });
  });
});

describe("quiet days", () => {
  it("produces nothing to render when there is nothing to show", () => {
    const today = buildToday([], NOW);
    expect(today.startHere).toEqual([]);
    expect(today.newToday).toEqual([]);
    expect(today.attention).toEqual([]);
    expect(today.counts.discovered).toBe(0);
  });

  it("shows no new section when nothing arrived in the window", () => {
    const today = buildToday([job()], NOW);
    expect(today.newCount).toBe(0);
    expect(today.newToday).toEqual([]);
    expect(today.startHere).toHaveLength(1);
  });
});
