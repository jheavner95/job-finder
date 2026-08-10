import type {
  CategoryInput,
  CategoryResult,
  EvidenceState,
  HardRequirementCheck,
  ScoringConfig,
} from "./types";

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  roleFit: { label: "Role & responsibility fit", weight: 19 },
  seniorityFit: { label: "Seniority fit", weight: 12 },
  domainFit: { label: "Relevant product-domain fit", weight: 12 },
  strategicScope: { label: "Strategic scope", weight: 13 },
  handsOnDesign: { label: "Hands-on design expectations", weight: 11 },
  // The four below are declared but never populated: no import path has ever
  // produced evidence for them on any job. They are marked so the score can
  // tell "we looked and found nothing" apart from "nothing ever looks".
  portfolioEvidence: { label: "Portfolio evidence strength", weight: 12, unimplemented: true },
  compensationFit: { label: "Compensation fit", weight: 8, optional: true, unimplemented: true },
  locationFit: { label: "Location & remote fit", weight: 7, optional: true, unimplemented: true },
  companyPreference: { label: "Company preference fit", weight: 6, unimplemented: true },
  riskPenalty: { label: "Risk or concern penalties", weight: 10, isPenalty: true, optional: true },
};

/**
 * What an unmeasured dimension is worth.
 *
 * The midpoint of the declared 0–1 rating domain, chosen a priori rather than
 * fitted to the corpus. It encodes the only defensible reading of absent
 * evidence: a dimension nobody measured is neither good nor bad.
 *
 * Not 0 — that would make silence equivalent to the worst possible finding,
 * inventing negative evidence the posting never supplied. Not the observed
 * mean either, which would make silence equivalent to a typical positive and
 * leave the original defect in place.
 */
export const NEUTRAL_RATING = 0.5;

/**
 * Categories that participate in the score's denominator.
 *
 * Always the same set, whatever a given posting happens to say. That constancy
 * is the whole correction: when the denominator shrinks to fit the evidence,
 * a posting improves its score by staying silent about a weakness.
 */
export function evidenceBearingCategories(config = DEFAULT_SCORING_CONFIG) {
  return (Object.keys(config) as Array<keyof ScoringConfig>).filter(
    (category) => !config[category].isPenalty && !config[category].unimplemented,
  );
}

export type ScoreResult = {
  score: number;
  confidence: number;
  eligibility: "eligible" | "excluded";
  summary: string;
  categories: CategoryResult[];
  hardRequirements: HardRequirementCheck[];
};

export function scoreJob(
  inputs: CategoryInput[],
  config = DEFAULT_SCORING_CONFIG,
  hardRequirements: HardRequirementCheck[] = [],
): ScoreResult {
  const inputByCategory = new Map(inputs.map((input) => [input.category, input]));
  const categories = Object.entries(config).map(([category, setting]) => {
    const foundInput = inputByCategory.get(category as keyof ScoringConfig);
    if (!foundInput && !setting.optional) {
      throw new Error(`Missing scoring input: ${category}`);
    }
    const input: CategoryInput = foundInput ?? {
      category: category as keyof ScoringConfig,
      reason: "No verified input is available for this optional category.",
      evidenceState: "missing",
    };
    const evidenceState: EvidenceState =
      input.evidenceState ??
      (setting.isPenalty && (input.rating ?? 0) > 0 ? "negative" : "positive");
    const rating = input.rating ?? 0;
    if (rating < 0 || rating > 1) {
      throw new Error(`Rating for ${category} must be between 0 and 1`);
    }
    const direction = evidenceState === "negative" ? -1 : 1;
    const contributes =
      evidenceState === "positive" || evidenceState === "negative";
    return {
      ...input,
      rating,
      evidenceState,
      label: setting.label,
      weight: setting.weight,
      contribution: contributes
        ? Number((rating * setting.weight * direction).toFixed(1))
        : 0,
    };
  });

  const knownCategories = categories.filter(
    (item) =>
      item.evidenceState === "positive" || item.evidenceState === "negative",
  );
  const applicableCategories = categories.filter(
    (item) => item.evidenceState !== "not_applicable",
  );
  /*
   * The denominator is fixed, not fitted to the evidence.
   *
   * It previously summed only the categories a posting happened to supply, so
   * the score was a mean over whatever was present. That let a posting improve
   * its own score by omitting a dimension it would have scored badly on:
   * dropping a weak category raises the mean of the rest. DE-3I caught it live
   * — an "Early Career" posting scored 75 / Strong Fit because saying nothing
   * about seniority removed seniority from the calculation.
   *
   * Now every evidence-bearing category is always in the denominator, and a
   * missing one contributes the neutral rating instead of vanishing. Absent
   * evidence therefore pulls the score toward neutral: it cannot lift the
   * score, and it does not invent a negative finding either.
   *
   * A posting that supplies every category is unaffected — there is nothing to
   * impute, so the arithmetic is identical to before.
   */
  const bearing = categories.filter(
    (item) => !config[item.category].isPenalty && !config[item.category].unimplemented,
  );
  const evidenceBearingWeight = bearing.reduce((sum, item) => sum + item.weight, 0);
  const positiveContribution = bearing.reduce(
    (sum, item) =>
      sum
      + (item.evidenceState === "positive" || item.evidenceState === "negative"
        ? item.contribution
        : NEUTRAL_RATING * item.weight),
    0,
  );
  const penaltyContribution = knownCategories
    .filter((item) => config[item.category].isPenalty)
    .reduce((sum, item) => sum + item.contribution, 0);
  const normalizedPositiveScore =
    evidenceBearingWeight > 0
      ? (positiveContribution / evidenceBearingWeight) * 100
      : 0;
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(normalizedPositiveScore + penaltyContribution),
    ),
  );
  const totalApplicableWeight = applicableCategories.reduce(
    (sum, item) => sum + item.weight,
    0,
  );
  const knownWeight = knownCategories.reduce(
    (sum, item) => sum + item.weight,
    0,
  );
  const confidence =
    totalApplicableWeight > 0
      ? Math.round((knownWeight / totalApplicableWeight) * 100)
      : 0;
  const violatedRequirements = hardRequirements.filter((item) => item.violated);
  const strongest = [...categories]
    .filter(
      (item) =>
        item.evidenceState === "positive" &&
        !config[item.category].isPenalty,
    )
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 2)
    .map((item) => item.label.toLowerCase());
  const penalty = categories.find((item) => item.category === "riskPenalty");
  const concern =
    penalty &&
    penalty.evidenceState === "negative" &&
    (penalty.rating ?? 0) >= 0.5
      ? ` Main watch-out: ${penalty.reason}`
      : "";
  const missingCount = categories.filter(
    (item) => item.evidenceState === "missing",
  ).length;
  const confidenceNote =
    missingCount > 0
      ? ` Confidence is ${confidence}% because ${missingCount} categor${missingCount === 1 ? "y is" : "ies are"} missing evidence.`
      : ` Confidence is ${confidence}%.`;
  const exclusionNote =
    violatedRequirements.length > 0
      ? ` ${violatedRequirements.length} hard requirement violation${violatedRequirements.length === 1 ? "" : "s"} require review.`
      : "";

  return {
    score,
    confidence,
    eligibility: violatedRequirements.length > 0 ? "excluded" : "eligible",
    summary: `Strongest alignment in ${strongest.join(" and ")}.${concern}${confidenceNote}${exclusionNote}`,
    categories,
    hardRequirements,
  };
}
