import { tierRank, type OpportunityTier } from "./opportunity-tiers";
import type { CategoryResult } from "./types";
import { DEFAULT_SCORING_CONFIG } from "./scoring";

/**
 * How the review queue decides what to show next.
 *
 * Job Finder now measures six things about an opportunity, and they are
 * different statements that regularly disagree. Ordering has to encode which
 * one wins, and until now that was decided implicitly: the comparator sorted by
 * tier then score, which — because a tier is derived from its score — is simply
 * score order. Everything else the product knows had no effect on what the user
 * saw first.
 *
 * The hierarchy below is lexicographic and deliberately shallow. There is no
 * second composite number: a rank the user cannot decompose is exactly what
 * made the old score untrustworthy.
 */

/** The five evidence-bearing categories, which are what "coverage" is measured over. */
const EVIDENCE_BEARING = (Object.keys(DEFAULT_SCORING_CONFIG) as Array<keyof typeof DEFAULT_SCORING_CONFIG>)
  .filter((category) => !DEFAULT_SCORING_CONFIG[category].isPenalty && !DEFAULT_SCORING_CONFIG[category].unimplemented);

export const EVIDENCE_BEARING_WEIGHT = EVIDENCE_BEARING.reduce(
  (sum, category) => sum + DEFAULT_SCORING_CONFIG[category].weight,
  0,
);

/**
 * Below half the model measured, the score is mostly the neutral prior rather
 * than anything observed about the posting.
 *
 * The boundary is structural, not a round number picked for looks: DE-3J
 * imputes the neutral rating for every unmeasured category, so once measured
 * weight falls under half, most of what the number reports was assumed. On this
 * corpus the split is almost perfectly clean — postings under the line carry
 * 9–37% confidence and those above carry 36–70%, overlapping by a single point.
 */
export const EVIDENCE_SUFFICIENCY_FLOOR = 0.5;

export type EvidenceCoverage = {
  /** Measured share of the evidence-bearing weight, 0–1. */
  coverage: number;
  /** False when most of the score came from imputation rather than measurement. */
  sufficient: boolean;
};

export function evidenceCoverage(categories: CategoryResult[]): EvidenceCoverage {
  const bearing = categories.filter((item) =>
    (EVIDENCE_BEARING as string[]).includes(item.category),
  );
  const measured = bearing
    .filter((item) => item.evidenceState === "positive" || item.evidenceState === "negative")
    .reduce((sum, item) => sum + item.weight, 0);
  const coverage = EVIDENCE_BEARING_WEIGHT > 0 ? measured / EVIDENCE_BEARING_WEIGHT : 0;
  return { coverage, sufficient: coverage >= EVIDENCE_SUFFICIENCY_FLOOR };
}

/* ------------------------------------------------------------------ *
 * Ordering
 * ------------------------------------------------------------------ */

/** Level fit, ranked by how directly it answers "is this my level?". */
function levelRank(verdict: string | null | undefined): number {
  switch (verdict) {
    case "IDEAL":
      return 0;
    case "COMPATIBLE":
      return 1;
    case "STRETCH":
      return 2;
    default:
      // UNKNOWN and REVIEW_REQUIRED are absence of an answer, not a bad one,
      // so they sit behind the answered cases rather than at the bottom.
      return 3;
  }
}

export type Orderable = {
  tier: OpportunityTier;
  score: number;
  title?: string;
  levelFit?: { verdict: string } | null;
  eligibilityAssessment?: { verdict: string } | null;
};

/**
 * Eligibility → tier → level fit → score.
 *
 * *Eligibility first* because a role the candidate cannot take is not a
 * candidate for their attention at all. It sinks rather than disappears.
 *
 * *Tier before level* because the alternative was measured and rejected.
 * Sorting level fit above tier promoted a mediocre role at the right level over
 * a strong one a rung below, and pushed Instrumentl's 86 Excellent Fit Senior
 * Product Designer out of the top fifty for the sole reason that it is Senior
 * rather than Staff. Craft quality still leads.
 *
 * *Level fit inside the tier* because that is where it costs nothing and says
 * something true: among equally strong roles, the ones at the candidate's own
 * level come first. On this corpus it lifts the ideal-level share of the top
 * fifty from 28 to 40, and staff and principal roles from 26 to 35, without
 * demoting a single Excellent Fit.
 *
 * Evidence sufficiency is deliberately absent. Ordering on it was modelled and
 * changes nothing — no insufficiently-evidenced posting reaches the top hundred
 * under any strategy, because thin postings already score low. It needs to be
 * *said*, not sorted.
 *
 * Work mode is absent too. The persisted preference records no strength, so it
 * cannot justify moving a role down the queue; it is shown as a warning.
 */
export function compareByDecision(left: Orderable, right: Orderable): number {
  const ineligible = (item: Orderable) =>
    item.eligibilityAssessment?.verdict === "INELIGIBLE" ? 1 : 0;
  return (
    ineligible(left) - ineligible(right)
    || tierRank(left.tier) - tierRank(right.tier)
    || levelRank(left.levelFit?.verdict) - levelRank(right.levelFit?.verdict)
    || right.score - left.score
    || (left.title ?? "").localeCompare(right.title ?? "")
  );
}
