import { describe, expect, it } from "vitest";

import {
  EVIDENCE_BEARING_WEIGHT,
  EVIDENCE_SUFFICIENCY_FLOOR,
  compareByDecision,
  evidenceCoverage,
  type Orderable,
} from "../lib/decision-order";
import { DEFAULT_SCORING_CONFIG } from "../lib/scoring";
import type { CategoryResult, ScoreCategory } from "../lib/types";

function role(over: Partial<Orderable> & { score: number; tier: Orderable["tier"] }): Orderable {
  return {
    title: `role-${over.score}`,
    levelFit: { verdict: "COMPATIBLE" },
    eligibilityAssessment: { verdict: "NO_CONSTRAINT_FOUND" },
    ...over,
  };
}

const order = (roles: Orderable[]) => [...roles].sort(compareByDecision).map((r) => r.title);

function categories(measured: ScoreCategory[]): CategoryResult[] {
  return (Object.keys(DEFAULT_SCORING_CONFIG) as ScoreCategory[]).map((category) => ({
    category,
    reason: "",
    weight: DEFAULT_SCORING_CONFIG[category].weight,
    label: DEFAULT_SCORING_CONFIG[category].label,
    contribution: 0,
    evidenceState: measured.includes(category) ? "positive" : "missing",
  }));
}

describe("evidence coverage", () => {
  it("measures against the evidence-bearing weight only", () => {
    // The four unimplemented dimensions are not evidence we are missing.
    expect(EVIDENCE_BEARING_WEIGHT).toBe(67);
    expect(evidenceCoverage(categories(["roleFit", "seniorityFit", "domainFit", "strategicScope", "handsOnDesign"])).coverage).toBe(1);
  });

  it("calls a posting insufficient once most of the model is imputed", () => {
    // roleFit + strategicScope = 32 of 67, so more than half was assumed.
    const thin = evidenceCoverage(categories(["roleFit", "strategicScope"]));
    expect(thin.coverage).toBeLessThan(EVIDENCE_SUFFICIENCY_FLOOR);
    expect(thin.sufficient).toBe(false);
  });

  it("accepts a posting once more than half is measured", () => {
    const enough = evidenceCoverage(categories(["roleFit", "strategicScope", "domainFit"]));
    expect(enough.coverage).toBeGreaterThan(EVIDENCE_SUFFICIENCY_FLOOR);
    expect(enough.sufficient).toBe(true);
  });

  it("separates the two roles DE-3K could not tell apart", () => {
    // Intercom AI Design Leader and Ionos2 Senior UX Designer both score 57
    // and both read "Stretch"; only one of them was actually measured.
    const intercom = evidenceCoverage(categories(["roleFit", "strategicScope"]));
    const ionos = evidenceCoverage(categories(["roleFit", "seniorityFit", "domainFit", "strategicScope", "handsOnDesign"]));
    expect(intercom.sufficient).toBe(false);
    expect(ionos.sufficient).toBe(true);
  });

  it("treats an unevaluated posting as unmeasured rather than bad", () => {
    const none = evidenceCoverage([]);
    expect(none.coverage).toBe(0);
    expect(none.sufficient).toBe(false);
  });
});

describe("queue ordering", () => {
  it("sinks an ineligible role below everything pursuable", () => {
    const ranked = order([
      role({ title: "ineligible-excellent", score: 88, tier: "Excellent Fit", eligibilityAssessment: { verdict: "INELIGIBLE" } }),
      role({ title: "eligible-stretch", score: 45, tier: "Stretch" }),
    ]);
    expect(ranked).toEqual(["eligible-stretch", "ineligible-excellent"]);
  });

  it("keeps craft quality ahead of level fit across tiers", () => {
    /*
     * Measured and rejected: sorting level above tier pushed Instrumentl's 86
     * Excellent Fit Senior role out of the top fifty purely for being Senior
     * rather than Staff. A strong role one rung down still outranks a weaker
     * role at the exact level.
     */
    const ranked = order([
      role({ title: "worth-ideal", score: 61, tier: "Worth Reviewing", levelFit: { verdict: "IDEAL" } }),
      role({ title: "excellent-compatible", score: 86, tier: "Excellent Fit", levelFit: { verdict: "COMPATIBLE" } }),
    ]);
    expect(ranked).toEqual(["excellent-compatible", "worth-ideal"]);
  });

  it("puts the candidate's own level first within a tier", () => {
    // This is where level fit is free: same band, so nothing strong is demoted.
    const ranked = order([
      role({ title: "strong-compatible-81", score: 81, tier: "Strong Fit", levelFit: { verdict: "COMPATIBLE" } }),
      role({ title: "strong-ideal-73", score: 73, tier: "Strong Fit", levelFit: { verdict: "IDEAL" } }),
    ]);
    expect(ranked).toEqual(["strong-ideal-73", "strong-compatible-81"]);
  });

  it("ranks an unanswered level behind an answered one, not below a mismatch", () => {
    const ranked = order([
      role({ title: "unknown", score: 75, tier: "Strong Fit", levelFit: { verdict: "UNKNOWN" } }),
      role({ title: "stretch-level", score: 72, tier: "Strong Fit", levelFit: { verdict: "STRETCH" } }),
      role({ title: "ideal", score: 72, tier: "Strong Fit", levelFit: { verdict: "IDEAL" } }),
    ]);
    expect(ranked).toEqual(["ideal", "stretch-level", "unknown"]);
  });

  it("falls back to score, then title, so the order is deterministic", () => {
    const ranked = order([
      role({ title: "b", score: 70, tier: "Worth Reviewing" }),
      role({ title: "a", score: 70, tier: "Worth Reviewing" }),
      role({ title: "c", score: 71, tier: "Worth Reviewing" }),
    ]);
    expect(ranked).toEqual(["c", "a", "b"]);
  });

  it("does not reorder on work mode", () => {
    // The persisted preference records no strength, so it cannot justify
    // moving a role down the queue. It is a warning, not a demotion.
    const ranked = order([
      role({ title: "lower-score", score: 72, tier: "Strong Fit" }),
      role({ title: "higher-score-onsite", score: 76, tier: "Strong Fit" }),
    ]);
    expect(ranked).toEqual(["higher-score-onsite", "lower-score"]);
  });

  it("does not reorder on evidence sufficiency", () => {
    // Modelled and found inert: thin postings already score low, so no
    // insufficiently-evidenced role reaches the top of the queue anyway.
    const ranked = order([
      role({ title: "thin-but-higher", score: 75, tier: "Strong Fit" }),
      role({ title: "measured-lower", score: 74, tier: "Strong Fit" }),
    ]);
    expect(ranked).toEqual(["thin-but-higher", "measured-lower"]);
  });
});
