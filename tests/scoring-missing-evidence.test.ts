import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCORING_CONFIG,
  NEUTRAL_RATING,
  evidenceBearingCategories,
  scoreJob,
} from "../lib/scoring";
import type { CategoryInput, ScoreCategory } from "../lib/types";

/**
 * The property this file exists to defend:
 *
 *   Removing evidence must never improve a score.
 *
 * The old denominator summed only the categories a posting supplied, making
 * the score a mean over whatever happened to be present. Dropping a weak
 * category raised the mean of the survivors, so a posting could score better
 * by saying less. DE-3I caught it on live market data.
 */

const BEARING = evidenceBearingCategories();

function inputs(ratings: Partial<Record<ScoreCategory, number | null>>): CategoryInput[] {
  return (Object.keys(DEFAULT_SCORING_CONFIG) as ScoreCategory[]).map((category) => {
    const rating = ratings[category];
    if (rating === undefined || rating === null) {
      return { category, reason: "No evidence.", evidenceState: "missing" as const };
    }
    return { category, rating, reason: "Evidence found.", evidenceState: "positive" as const };
  });
}

const score = (ratings: Partial<Record<ScoreCategory, number | null>>) => scoreJob(inputs(ratings)).score;

/** A complete, strong posting. Every evidence-bearing category is supplied. */
const COMPLETE: Partial<Record<ScoreCategory, number>> = {
  roleFit: 0.93,
  seniorityFit: 0.81,
  domainFit: 0.69,
  strategicScope: 0.81,
  handsOnDesign: 0.93,
};

describe("removing evidence cannot improve a score", () => {
  it("holds when the removed category was the weakest one", () => {
    // The decisive case: under the old mean-of-present-categories the weakest
    // category was the one a posting most benefited from omitting.
    const complete = score(COMPLETE);
    const withoutWeakest = score({ ...COMPLETE, domainFit: null });
    expect(withoutWeakest).toBeLessThan(complete);
  });

  it("holds for every evidence-bearing category, one at a time", () => {
    const complete = score(COMPLETE);
    for (const category of BEARING) {
      const reduced = score({ ...COMPLETE, [category]: null });
      expect(reduced, `omitting ${category}`).toBeLessThanOrEqual(complete);
    }
  });

  it("holds as evidence is removed cumulatively", () => {
    // Monotonically non-increasing, never a rebound.
    let previous = score(COMPLETE);
    const remaining: Partial<Record<ScoreCategory, number | null>> = { ...COMPLETE };
    for (const category of BEARING) {
      remaining[category] = null;
      const next = score(remaining);
      expect(next, `after omitting ${category}`).toBeLessThanOrEqual(previous);
      previous = next;
    }
  });

  it("is the property the previous equation violated", () => {
    // Reproduces the old arithmetic — a mean over supplied categories only —
    // and shows it rewarding omission, so the regression cannot silently
    // return without this test noticing.
    const meanOverSupplied = (ratings: Partial<Record<ScoreCategory, number>>) => {
      const supplied = BEARING.filter((category) => ratings[category] !== undefined);
      const weight = supplied.reduce((sum, c) => sum + DEFAULT_SCORING_CONFIG[c].weight, 0);
      const total = supplied.reduce((sum, c) => sum + ratings[c]! * DEFAULT_SCORING_CONFIG[c].weight, 0);
      return Math.round((total / weight) * 100);
    };
    const withoutWeakest = Object.fromEntries(
      Object.entries(COMPLETE).filter(([category]) => category !== "domainFit"),
    );
    expect(meanOverSupplied(withoutWeakest)).toBeGreaterThan(meanOverSupplied(COMPLETE));
    // The corrected equation reverses that relationship.
    expect(score(withoutWeakest)).toBeLessThan(score(COMPLETE));
  });
});

describe("the correction is confined to incomplete evidence", () => {
  it("changes nothing when every evidence-bearing category is supplied", () => {
    // Denominator equals the supplied weight either way, so the arithmetic is
    // untouched for complete postings.
    const bearingWeight = BEARING.reduce((sum, c) => sum + DEFAULT_SCORING_CONFIG[c].weight, 0);
    const contribution = BEARING.reduce(
      (sum, c) => sum + COMPLETE[c]! * DEFAULT_SCORING_CONFIG[c].weight,
      0,
    );
    expect(score(COMPLETE)).toBe(Math.round((contribution / bearingWeight) * 100));
  });

  it("keeps the denominator fixed regardless of what a posting supplies", () => {
    const fixed = BEARING.reduce((sum, c) => sum + DEFAULT_SCORING_CONFIG[c].weight, 0);
    expect(fixed).toBe(67);
    // One category known at the neutral rating scores the same as all five
    // known at the neutral rating: imputation and measurement agree at p.
    expect(score({ roleFit: NEUTRAL_RATING })).toBe(
      score(Object.fromEntries(BEARING.map((c) => [c, NEUTRAL_RATING]))),
    );
  });
});

describe("unknown is neutral, not negative", () => {
  it("scores an all-unknown posting at the neutral midpoint, not zero", () => {
    expect(score({})).toBe(Math.round(NEUTRAL_RATING * 100));
  });

  it("lifts a posting whose only known evidence is below neutral", () => {
    // Absent evidence is not proof of a bad fit, so it pulls upward here.
    const weakOnly = score({ roleFit: 0.1 });
    const weakEverywhere = score(Object.fromEntries(BEARING.map((c) => [c, 0.1])));
    expect(weakOnly).toBeGreaterThan(weakEverywhere);
  });

  it("never lets imputation reach a strong verdict on its own", () => {
    // Silence alone cannot clear the Strong Fit threshold of 72.
    expect(score({})).toBeLessThan(72);
  });
});

describe("dimensions nothing populates stay out of the score", () => {
  it("marks exactly the four categories no import path fills", () => {
    const unimplemented = (Object.keys(DEFAULT_SCORING_CONFIG) as ScoreCategory[])
      .filter((category) => DEFAULT_SCORING_CONFIG[category].unimplemented);
    expect(unimplemented.sort()).toEqual(
      ["companyPreference", "compensationFit", "locationFit", "portfolioEvidence"],
    );
  });

  it("excludes them from the denominator rather than imputing them", () => {
    // Imputing 33 points of weight that no job will ever populate would shift
    // every score by the same constant and discriminate between nothing.
    expect(BEARING).toEqual(["roleFit", "seniorityFit", "domainFit", "strategicScope", "handsOnDesign"]);
    const withThem = score({ ...COMPLETE, locationFit: 0.9, compensationFit: 0.9 });
    expect(withThem).toBe(score(COMPLETE));
  });
});

describe("the live regression case", () => {
  /** Captions — Product Designer, Early Career, exactly as persisted. */
  const CAPTIONS: CategoryInput[] = [
    { category: "roleFit", rating: 0.93, reason: "", evidenceState: "positive" },
    { category: "seniorityFit", reason: "", evidenceState: "missing" },
    { category: "domainFit", rating: 0.57, reason: "", evidenceState: "positive" },
    { category: "strategicScope", rating: 0.57, reason: "", evidenceState: "positive" },
    { category: "handsOnDesign", rating: 1, reason: "", evidenceState: "positive" },
    { category: "portfolioEvidence", reason: "", evidenceState: "missing" },
    { category: "compensationFit", reason: "", evidenceState: "missing" },
    { category: "locationFit", reason: "", evidenceState: "missing" },
    { category: "companyPreference", reason: "", evidenceState: "missing" },
    { category: "riskPenalty", rating: 0.35, reason: "", evidenceState: "negative" },
  ];

  it("no longer reads as a strong fit", () => {
    // No target score is asserted: the point is that the posting's silence
    // about seniority stops being worth eleven points.
    const result = scoreJob(CAPTIONS);
    expect(result.score).toBeLessThan(72);
  });

  it("caps what the posting's silence about seniority can be worth", () => {
    /*
     * Silence still helps this posting, and always will: we impute neutral
     * because we do not know the true rating, and here the honest rating is
     * below neutral. What changed is the size of the advantage.
     *
     * Under the old equation a missing category inherited the mean of the
     * categories that were present — 0.78 for this posting — so silence was
     * worth eleven points. Now it is worth 0.5 and no more, whatever the rest
     * of the posting scores. The advantage is bounded instead of amplifying.
     */
    const honest = CAPTIONS.map((input) =>
      input.category === "seniorityFit"
        ? { ...input, rating: 0.2, evidenceState: "positive" as const }
        : input,
    );
    const silentGain = scoreJob(CAPTIONS).score - scoreJob(honest).score;
    expect(silentGain).toBeGreaterThan(0);

    const oldEquation = (seniority: number | null) => {
      const supplied = BEARING.filter((c) => c !== "seniorityFit" || seniority !== null);
      const weight = supplied.reduce((sum, c) => sum + DEFAULT_SCORING_CONFIG[c].weight, 0);
      const ratings: Record<string, number> = {
        roleFit: 0.93, domainFit: 0.57, strategicScope: 0.57, handsOnDesign: 1,
        ...(seniority === null ? {} : { seniorityFit: seniority }),
      };
      const total = supplied.reduce((sum, c) => sum + ratings[c] * DEFAULT_SCORING_CONFIG[c].weight, 0);
      return Math.round((total / weight) * 100 - 3.5);
    };
    const oldSilentGain = oldEquation(null) - oldEquation(0.2);
    expect(oldEquation(null)).toBe(75);
    expect(silentGain).toBeLessThan(oldSilentGain);
  });

  it("no longer lets a missing category inherit the strength of the others", () => {
    // Raise every supplied category to its maximum. Under the old equation the
    // missing category rose with them; now it stays pinned at neutral.
    const stronger = CAPTIONS.map((input) =>
      input.evidenceState === "positive" ? { ...input, rating: 1 } : input,
    );
    const imputed = scoreJob(stronger).categories.find((c) => c.category === "seniorityFit");
    expect(imputed?.evidenceState).toBe("missing");
    // A perfect posting missing one of five categories cannot reach 100.
    expect(scoreJob(stronger).score).toBeLessThan(100 - 3);
  });
});
