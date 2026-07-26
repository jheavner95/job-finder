import { describe, expect, it } from "vitest";
import { SYNTHETIC_JOBS } from "../lib/sample-opportunities";
import { DEFAULT_SCORING_CONFIG, scoreJob } from "../lib/scoring";
import type { CategoryInput } from "../lib/types";

describe("scoreJob", () => {
  it("scores strong fixtures above possible and poor fixtures", () => {
    const scores = Object.fromEntries(
      SYNTHETIC_JOBS.map((job) => [job.id, scoreJob(job.evaluationInputs).score]),
    );
    expect(scores["northstar-staff"]).toBeGreaterThanOrEqual(85);
    expect(scores["keystone-lead"]).toBeGreaterThan(scores["shopwave-growth"]);
    expect(scores["adforge-ui"]).toBeLessThan(30);
  });

  it("returns an explainable result for every category", () => {
    const result = scoreJob(SYNTHETIC_JOBS[0].evaluationInputs);
    expect(result.categories).toHaveLength(10);
    expect(result.categories.every((category) => category.reason.length > 0)).toBe(true);
    expect(result.summary).toContain("Strongest alignment");
  });

  it("rejects ratings outside the configured range", () => {
    const invalid = SYNTHETIC_JOBS[0].evaluationInputs.map((input) => ({ ...input }));
    invalid[0].rating = 1.2;
    expect(() => scoreJob(invalid)).toThrow(/between 0 and 1/);
  });

  it("reaches stable maximum and minimum score boundaries", () => {
    const maxInputs = Object.keys(DEFAULT_SCORING_CONFIG).map((category) => ({
      category,
      rating: category === "riskPenalty" ? 0 : 1,
      reason: "Boundary fixture",
    })) as CategoryInput[];
    const minInputs = maxInputs.map((input) => ({
      ...input,
      rating: input.category === "riskPenalty" ? 1 : 0,
    }));
    expect(scoreJob(maxInputs).score).toBe(100);
    expect(scoreJob(minInputs).score).toBe(0);
  });

  it("applies concern ratings as explicit negative contributions", () => {
    const inputs = SYNTHETIC_JOBS[0].evaluationInputs.map((input) => ({ ...input }));
    const withoutPenalty = inputs.map((input) =>
      input.category === "riskPenalty" ? { ...input, rating: 0 } : input,
    );
    const withPenalty = inputs.map((input) =>
      input.category === "riskPenalty" ? { ...input, rating: 1 } : input,
    );
    expect(scoreJob(withoutPenalty).score - scoreJob(withPenalty).score).toBe(10);
  });

  it("uses a zero contribution for missing optional inputs", () => {
    const inputs = SYNTHETIC_JOBS[0].evaluationInputs.filter(
      (input) => !["compensationFit", "locationFit", "riskPenalty"].includes(input.category),
    );
    const result = scoreJob(inputs);
    expect(result.categories.find((item) => item.category === "compensationFit")?.contribution).toBe(0);
    expect(result.categories.find((item) => item.category === "compensationFit")?.evidenceState).toBe("missing");
    expect(result.categories.find((item) => item.category === "riskPenalty")?.reason).toContain("No verified input");
    expect(result.confidence).toBeLessThan(100);
  });

  it("honors configuration changes without UI changes", () => {
    const config = {
      ...DEFAULT_SCORING_CONFIG,
      roleFit: { ...DEFAULT_SCORING_CONFIG.roleFit, weight: 5 },
    };
    expect(
      scoreJob(SYNTHETIC_JOBS[0].evaluationInputs, config).categories.find(
        (item) => item.category === "roleFit",
      )?.weight,
    ).toBe(5);
  });

  it("is deterministic for repeated identical inputs", () => {
    const inputs = SYNTHETIC_JOBS[1].evaluationInputs;
    expect(scoreJob(inputs)).toEqual(scoreJob(inputs));
  });

  it("keeps unknown compensation neutral while lowering confidence", () => {
    const known = scoreJob(SYNTHETIC_JOBS[0].evaluationInputs);
    const unknownInputs = SYNTHETIC_JOBS[0].evaluationInputs.map((input) =>
      input.category === "compensationFit"
        ? {
            category: input.category,
            reason: "Candidate compensation requirement is not supplied.",
            evidenceState: "missing" as const,
          }
        : input,
    );
    const unknown = scoreJob(unknownInputs);
    expect(unknown.score).toBeGreaterThanOrEqual(known.score);
    expect(unknown.confidence).toBeLessThan(known.confidence);
  });

  it("distinguishes positive, negative, missing, and not-applicable evidence", () => {
    const inputs = SYNTHETIC_JOBS[0].evaluationInputs.map((input) => {
      if (input.category === "roleFit") return { ...input, evidenceState: "positive" as const };
      if (input.category === "riskPenalty") return { ...input, rating: 0.5, evidenceState: "negative" as const };
      if (input.category === "compensationFit") return { category: input.category, reason: "Unknown", evidenceState: "missing" as const };
      if (input.category === "locationFit") return { category: input.category, reason: "Not applicable", evidenceState: "not_applicable" as const };
      return input;
    });
    const result = scoreJob(inputs);
    expect(new Set(result.categories.map((item) => item.evidenceState))).toEqual(
      new Set(["positive", "negative", "missing", "not_applicable"]),
    );
  });

  it("excludes not-applicable categories from the confidence denominator", () => {
    const withoutLocation = SYNTHETIC_JOBS[0].evaluationInputs.map((input) =>
      input.category === "locationFit"
        ? { category: input.category, reason: "No location constraint applies.", evidenceState: "not_applicable" as const }
        : input,
    );
    expect(scoreJob(withoutLocation).confidence).toBe(100);
  });

  it("keeps hard exclusions separate from the weighted match score", () => {
    const baseline = scoreJob(SYNTHETIC_JOBS[0].evaluationInputs);
    const excluded = scoreJob(SYNTHETIC_JOBS[0].evaluationInputs, DEFAULT_SCORING_CONFIG, [
      { id: "authorization", label: "Work authorization", violated: true, reason: "Requirement conflicts with supplied constraint." },
    ]);
    expect(excluded.score).toBe(baseline.score);
    expect(excluded.eligibility).toBe("excluded");
    expect(excluded.summary).toContain("hard requirement violation");
  });

  it("never turns a missing optional category into a rejection", () => {
    const inputs = SYNTHETIC_JOBS[0].evaluationInputs.filter(
      (input) => input.category !== "compensationFit",
    );
    const result = scoreJob(inputs);
    expect(result.eligibility).toBe("eligible");
    expect(result.categories.find((item) => item.category === "compensationFit")?.evidenceState).toBe("missing");
  });
});
