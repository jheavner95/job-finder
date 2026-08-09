/**
 * Opportunity tiers replace the binary "strong match / not a match" mindset with
 * five visible bands. A tier is derived deterministically from an evaluation
 * score, assigned at evaluation time, and persisted alongside the evaluation so
 * the whole application agrees on one set of thresholds.
 *
 * Bands are grounded in the real score distribution: genuine design roles land
 * between 65 and 87, so the reviewable range has to stay wide.
 */

export const OPPORTUNITY_TIERS = [
  "Excellent Fit",
  "Strong Fit",
  "Worth Reviewing",
  "Stretch",
  "Low Relevance",
] as const;

export type OpportunityTier = (typeof OPPORTUNITY_TIERS)[number];

/** Visual tone reused from the existing score styling (`.score-strong` etc.). */
export type OpportunityTierTone = "strong" | "possible" | "low";

/** Any record decorated with the tier derived for it. */
export type Tiered<T> = T & { tier: OpportunityTier };

export const MINIMUM_SCORE = 0;
export const MAXIMUM_SCORE = 100;

/** The only tier that may be hidden by default. Everything else is inspectable. */
export const HIDDEN_TIER: OpportunityTier = "Low Relevance";

type TierBand = {
  tier: OpportunityTier;
  /** Inclusive lower bound of the band. */
  minimumScore: number;
  tone: OpportunityTierTone;
};

/** Ordered strongest first; the first band whose minimum is met wins. */
const TIER_BANDS: readonly TierBand[] = [
  { tier: "Excellent Fit", minimumScore: 85, tone: "strong" },
  { tier: "Strong Fit", minimumScore: 72, tone: "strong" },
  { tier: "Worth Reviewing", minimumScore: 58, tone: "possible" },
  { tier: "Stretch", minimumScore: 42, tone: "possible" },
  { tier: "Low Relevance", minimumScore: MINIMUM_SCORE, tone: "low" },
];

const LOWEST_BAND = TIER_BANDS[TIER_BANDS.length - 1];

/** Tiers that stay visible in review surfaces by default. */
export const REVIEWABLE_TIERS: readonly OpportunityTier[] = OPPORTUNITY_TIERS.filter(
  (tier) => tier !== HIDDEN_TIER,
);

/** Scores are clamped into 0–100; a missing or NaN score lands on the floor. */
export function clampScore(score: number): number {
  if (typeof score !== "number" || Number.isNaN(score)) return MINIMUM_SCORE;
  return Math.min(MAXIMUM_SCORE, Math.max(MINIMUM_SCORE, Math.round(score)));
}

export function tierForScore(score: number): OpportunityTier {
  const value = clampScore(score);
  const band = TIER_BANDS.find((item) => value >= item.minimumScore) ?? LOWEST_BAND;
  return band.tier;
}

/** True for every tier except "Low Relevance". */
export function isReviewable(tier: OpportunityTier): boolean {
  return tier !== HIDDEN_TIER;
}

/** 0 = "Excellent Fit". Use for sorting strongest first. */
export function tierRank(tier: OpportunityTier): number {
  const index = OPPORTUNITY_TIERS.indexOf(tier);
  return index === -1 ? OPPORTUNITY_TIERS.length - 1 : index;
}

/** Maps a tier onto the score tone already used by the stylesheet. */
export function tierTone(tier: OpportunityTier): OpportunityTierTone {
  return (TIER_BANDS.find((item) => item.tier === tier) ?? LOWEST_BAND).tone;
}

/** Convenience for surfaces that only hold a score. */
export function toneForScore(score: number): OpportunityTierTone {
  return tierTone(tierForScore(score));
}

export function isOpportunityTier(value: unknown): value is OpportunityTier {
  return (
    typeof value === "string" &&
    (OPPORTUNITY_TIERS as readonly string[]).includes(value)
  );
}

/**
 * Reads the tier out of a persisted `JobEvaluation.reasoning` blob. Returns null
 * for evaluations written before tiers existed so callers can fall back to the
 * score.
 */
export function tierFromReasoning(reasoning: unknown): OpportunityTier | null {
  if (typeof reasoning !== "object" || reasoning === null || Array.isArray(reasoning)) {
    return null;
  }
  const value = (reasoning as { tier?: unknown }).tier;
  return isOpportunityTier(value) ? value : null;
}

/** Resolves the tier for a stored evaluation, preferring the persisted value. */
export function resolveTier(score: number, reasoning?: unknown): OpportunityTier {
  return tierFromReasoning(reasoning) ?? tierForScore(score);
}

/** Sort comparator: strongest tier first, then score descending, then title. */
export function compareByTier(
  a: { tier: OpportunityTier; score: number; title?: string },
  b: { tier: OpportunityTier; score: number; title?: string },
): number {
  return (
    tierRank(a.tier) - tierRank(b.tier) ||
    b.score - a.score ||
    (a.title ?? "").localeCompare(b.title ?? "")
  );
}
