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
  portfolioEvidence: { label: "Portfolio evidence strength", weight: 12 },
  compensationFit: { label: "Compensation fit", weight: 8, optional: true },
  locationFit: { label: "Location & remote fit", weight: 7, optional: true },
  companyPreference: { label: "Company preference fit", weight: 6 },
  riskPenalty: { label: "Risk or concern penalties", weight: 10, isPenalty: true, optional: true },
};

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
  const knownPositiveWeight = knownCategories
    .filter((item) => !config[item.category].isPenalty)
    .reduce((sum, item) => sum + item.weight, 0);
  const positiveContribution = knownCategories
    .filter((item) => !config[item.category].isPenalty)
    .reduce((sum, item) => sum + item.contribution, 0);
  const penaltyContribution = knownCategories
    .filter((item) => config[item.category].isPenalty)
    .reduce((sum, item) => sum + item.contribution, 0);
  const normalizedPositiveScore =
    knownPositiveWeight > 0
      ? (positiveContribution / knownPositiveWeight) * 100
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
