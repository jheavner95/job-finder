import { describe, expect, it } from "vitest";

import {
  AI_RELEVANCE_SUPPORTED,
  cleanLocation,
  countOpportunities,
  exceptionsFor,
  factsFor,
  presentOpportunity,
  shortAge,
} from "../lib/opportunity-presentation";
import type { JobListItem } from "../lib/view-models";
import type { OpportunityTier } from "../lib/opportunity-tiers";

/**
 * One opportunity should mean the same thing everywhere. These tests pin the
 * vocabulary and the derivation so surfaces cannot drift apart again.
 */

function job(over: Partial<JobListItem> & { tier?: OpportunityTier } = {}) {
  return {
    id: "job-1",
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
      importedAt: "2026-08-09T00:00:00Z",
      lastVerifiedAt: "2026-08-09T00:00:00Z",
      importAge: "1 day ago",
      officialAts: "Greenhouse",
    },
    status: "New" as const,
    score: 84,
    confidence: 67,
    eligibility: "eligible" as const,
    eligibilityAssessment: null,
    levelFit: null,
    workMode: null,
    evidenceCoverage: { coverage: 1, sufficient: true },
    summary: "",
    matchReason: "Strong enterprise software fit.",
    concerns: [],
    isSynthetic: false,
    tier: "Strong Fit" as OpportunityTier,
    ...over,
  } as JobListItem & { tier?: OpportunityTier };
}

describe("counting model", () => {
  // Distinct titles: counts are in opportunities, so same-employer-same-title
  // rows would legitimately collapse into one.
  const corpus = [
    job({ id: "a", title: "Role A", status: "New", tier: "Excellent Fit" }),
    job({ id: "b", title: "Role B", status: "New", tier: "Strong Fit" }),
    job({ id: "c", title: "Role C", status: "New", tier: "Worth Reviewing" }),
    job({ id: "d", title: "Role D", status: "New", tier: "Low Relevance" }),
    job({ id: "e", title: "Role E", status: "Saved", tier: "Strong Fit" }),
    job({ id: "f", title: "Role F", status: "Applied", tier: "Strong Fit" }),
    job({ id: "g", title: "Role G", status: "Rejected", tier: "Strong Fit" }),
  ];

  it("reports the counts the product is allowed to show", () => {
    expect(countOpportunities(corpus)).toEqual({
      discovered: 7,
      needsReview: 3,
      outsideLevel: 0,
      worthConsidering: 2,
      saved: 1,
      applied: 1,
    });
  });

  it("keeps off-level opportunities out of the headline count but still counts them", () => {
    // The queue demotes these to their own filter, so the dashboard must not
    // include them in the number it calls "to review".
    const withOffLevel = [
      ...corpus,
      job({ id: "h", title: "Role H", status: "New", tier: "Strong Fit", levelFit: { verdict: "TOO_JUNIOR", headline: "" } as never }),
    ];
    const counts = countOpportunities(withOffLevel);
    expect(counts.needsReview).toBe(3);
    expect(counts.outsideLevel).toBe(1);
    expect(counts.discovered).toBe(8);
  });

  it("excludes decided opportunities from the review count", () => {
    // Saved, applied and rejected roles are no longer waiting on the user.
    expect(countOpportunities(corpus).needsReview).toBe(3);
  });

  it("excludes low-relevance opportunities from the review count", () => {
    expect(countOpportunities([job({ status: "New", tier: "Low Relevance" })]).needsReview).toBe(0);
  });

  it("counts opportunities, not postings", () => {
    /*
     * Jobgether lists one role as 36 postings across 36 countries. A person
     * has one opportunity to review there, not thirty-six, and Today and the
     * Opportunities workspace must agree on which number that is.
     */
    const oneRoleManyListings = Array.from({ length: 36 }, (_, index) =>
      job({ id: `dup-${index}`, company: "Jobgether", title: "Lead AI Generative Designer", status: "New" }),
    );
    const counts = countOpportunities(oneRoleManyListings);
    expect(counts.discovered).toBe(36);
    expect(counts.needsReview).toBe(1);
  });

  it("keeps worth-considering a subset of needs-review", () => {
    const counts = countOpportunities(corpus);
    expect(counts.worthConsidering).toBeLessThanOrEqual(counts.needsReview);
  });
});

describe("exceptions only", () => {
  it("shows nothing when nothing is wrong", () => {
    // A role at the right level, with no eligibility constraint and a
    // compatible work mode, used to carry three chips confirming normality.
    expect(
      exceptionsFor(
        job({
          levelFit: { verdict: "IDEAL", headline: "" } as never,
          eligibilityAssessment: { verdict: "NO_CONSTRAINT_FOUND", headline: "" } as never,
          workMode: { compatibility: "COMPATIBLE", headline: "" } as never,
        }),
      ),
    ).toEqual([]);
  });

  it("stays quiet for level verdicts that are not a mismatch", () => {
    for (const verdict of ["IDEAL", "COMPATIBLE", "STRETCH", "UNKNOWN", "REVIEW_REQUIRED"]) {
      expect(exceptionsFor(job({ levelFit: { verdict, headline: "" } as never })), verdict).toEqual([]);
    }
  });

  it("flags each genuine mismatch once", () => {
    const flagged = exceptionsFor(
      job({
        levelFit: { verdict: "TOO_JUNIOR", headline: "Junior role." } as never,
        eligibilityAssessment: { verdict: "INELIGIBLE", headline: "UK right to work." } as never,
        workMode: { compatibility: "INCOMPATIBLE", headline: "On-site." } as never,
        evidenceCoverage: { coverage: 0.46, sufficient: false },
      }),
    );
    expect(flagged.map((item) => item.id)).toEqual(["level", "eligibility", "work-mode"]);
    expect(flagged.every((item) => item.detail.length > 0)).toBe(true);
  });

  it("marks an ineligible role as blocked rather than merely warned", () => {
    const [flag] = exceptionsFor(
      job({ eligibilityAssessment: { verdict: "INELIGIBLE", headline: "x" } as never }),
    );
    expect(flag.tone).toBe("blocked");
  });
});

describe("missing data is omitted, never announced", () => {
  it("drops unlisted compensation and unavailable metadata", () => {
    const facts = factsFor(job({ compensation: "Not listed", employmentType: "Employment type unavailable" }));
    expect(facts.join(" ")).not.toMatch(/not listed|unavailable/i);
  });

  it("suppresses a placeholder in whichever field it lands in", () => {
    /*
     * The corpus writes "Not listed" for pay and "n/a" for employment type, but
     * nothing constrains which field gets which stand-in, so the same test
     * applies to every field on the line.
     */
    for (const value of ["n/a", "N/A", "Not specified", "TBD", "unknown", " — "]) {
      expect(factsFor(job({ compensation: value, employmentType: value }))).toEqual([
        "United States",
      ]);
    }
  });

  it("renders a coherent row when everything optional is absent", () => {
    const bare = presentOpportunity(
      job({ location: undefined, compensation: "Not listed", employmentType: undefined, workMode: null, matchReason: "" }),
    );
    expect(bare.facts).toEqual([]);
    expect(bare.reason).toBeNull();
    // Identity and the decision signal always survive.
    expect(bare.title).toBe("Staff Product Designer");
    expect(bare.company).toBe("AlphaSense");
    expect(bare.score).toBe(84);
  });

  it("keeps facts in decision order when present", () => {
    const facts = factsFor(
      job({
        workMode: { postingMode: "hybrid" } as never,
        location: "London, England",
        compensation: "$180,000–$220,000",
        employmentType: "Full-time",
      }),
    );
    expect(facts).toEqual(["Hybrid", "London, England", "$180,000–$220,000", "Full-time"]);
  });

  it("suppresses placeholder locations", () => {
    for (const value of [null, "", "Location unavailable", "-"]) {
      expect(cleanLocation(value), String(value)).toBeNull();
    }
  });

  it("shortens a location list rather than letting it wrap a row", () => {
    // N8N lists twenty-six countries; a dense row cannot carry them.
    const long = cleanLocation("Germany; Bosnia; Norway; Estonia; Slovenia; Italy; Netherlands");
    expect(long).toMatch(/\+5 more$/);
    expect(long!.length).toBeLessThan(60);
  });

  it("strips a work mode already shown as its own fact", () => {
    expect(cleanLocation("Remote - United States")).toBe("United States");
  });
});

describe("the tier claim follows the evidence", () => {
  it("withholds the tier when the posting was too thin to support one", () => {
    const thin = presentOpportunity(job({ evidenceCoverage: { coverage: 0.46, sufficient: false } }));
    expect(thin.tierIsClaimable).toBe(false);
    expect(thin.score).toBe(84);
  });

  it("keeps the tier when the evidence supports it", () => {
    expect(presentOpportunity(job()).tierIsClaimable).toBe(true);
  });

  it("does not also raise a flag for thin evidence", () => {
    // The fit column already replaces the tier with "Thin evidence"; a badge
    // saying the same thing would be the row contradicting nobody twice.
    const thin = presentOpportunity(job({ evidenceCoverage: { coverage: 0.4, sufficient: false } }));
    expect(thin.exceptions.map((item) => item.id)).not.toContain("evidence");
  });
});

describe("quiet defaults", () => {
  it("does not render a status badge for an untouched opportunity", () => {
    expect(presentOpportunity(job({ status: "New" })).status).toBeNull();
  });

  it("does render a status once the user has acted", () => {
    expect(presentOpportunity(job({ status: "Saved" })).status).toBe("Saved");
  });

  it("abbreviates recency for a dense row", () => {
    expect(shortAge("1 day ago")).toBe("1d");
    expect(shortAge("3 hrs ago")).toBe("3h");
    expect(shortAge("42 min ago")).toBe("42m");
    expect(shortAge("Just imported")).toBe("now");
  });
});

describe("AI Product Experience relevance", () => {
  it("is not fabricated from titles", () => {
    /*
     * The data model cannot express it: matchedDomains carries four generic
     * values and no job in the corpus matches an AI domain. Deriving a badge
     * from the letters "AI" in a title would invent a signal, so nothing is
     * shown until the model can support one.
     */
    expect(AI_RELEVANCE_SUPPORTED).toBe(false);
    const aiRole = presentOpportunity(job({ title: "Staff AI Designer" }));
    expect(JSON.stringify(aiRole)).not.toMatch(/"ai"/i);
  });
});

describe("location cleanup on real corpus strings", () => {
  it("does not print the same place twice", () => {
    // The work mode and the office resolve to one location for this listing.
    expect(cleanLocation("New York, New York, United States; Remote - United States"))
      .toBe("New York, New York, United States");
  });

  it("truncates on a boundary rather than mid-place-name", () => {
    const original = "Germany, Bosnia, Norway, Estonia, Slovenia, Italy, Netherlands, Hungary";
    const many = cleanLocation(original)!;
    expect(many.endsWith("…")).toBe(true);
    // The visible text must be a whole number of place names: a prefix of the
    // original that stops exactly where a comma follows.
    const shown = many.slice(0, -1);
    expect(original.startsWith(shown)).toBe(true);
    expect(original[shown.length]).toBe(",");
  });

  it("keeps a single city intact", () => {
    expect(cleanLocation("Berlin Office")).toBe("Berlin Office");
    expect(cleanLocation("San Jose, California, USA")).toBe("San Jose, California, USA");
  });
});
