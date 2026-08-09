/**
 * Eligibility is deliberately not a scoring input.
 *
 * A match score answers "how well does this role fit the candidate's craft?".
 * Eligibility answers a different question — "can this candidate actually
 * pursue it?" — and the two must never be averaged together, because a role
 * can be an excellent fit and still be unavailable.
 *
 * The model therefore keeps two layers apart:
 *
 *   1. POSTING CONSTRAINT — what the employer stated, with its evidence.
 *   2. CANDIDATE VERDICT  — whether that statement conflicts with facts the
 *      candidate has actually declared.
 *
 * A posting can carry a HARD constraint and still produce no verdict at all,
 * because the candidate side of the comparison is unknown. That is the point:
 * detecting a requirement is not the same as excluding a person.
 */

/** What kind of requirement the employer stated. */
export type ConstraintType =
  | "work-authorization"
  | "right-to-work"
  | "citizenship"
  | "export-control"
  | "residency"
  | "sponsorship-unavailable"
  | "sponsorship-available";

/**
 * How firmly the posting states it.
 *
 * HARD          an unconditional requirement ("must be authorized to work in X")
 * LIKELY        a real constraint stated as a preference, or one that only bites
 *               in combination with another ("we are prioritising applicants
 *               who…", "sponsorship is not available")
 * AMBIGUOUS     a requirement whose jurisdiction cannot be resolved from the
 *               text ("authorized to work in the country in which they apply")
 * INFORMATIONAL anti-discrimination language, statutory notices, and offers of
 *               sponsorship — text that mentions eligibility without imposing a
 *               requirement on this candidate
 */
export type ConstraintClassification =
  | "HARD"
  | "LIKELY"
  | "AMBIGUOUS"
  | "INFORMATIONAL";

/** Which part of the posting the evidence was found in. */
export type ConstraintField = "title" | "description" | "requirements";

export type PostingConstraint = {
  type: ConstraintType;
  classification: ConstraintClassification;
  /** ISO 3166-1 alpha-2, or a bloc code such as `EU`. Null when unresolved. */
  jurisdiction: string | null;
  jurisdictionLabel: string | null;
  /** True for supranational jurisdictions, which never produce an exclusion. */
  jurisdictionIsBloc: boolean;
  /** Verbatim posting text. Never paraphrased — the user has to be able to check. */
  evidence: string;
  field: ConstraintField;
  /** Character offset of the evidence within that field's plain text. */
  offset: number;
  /** Which detector rule fired, for auditability. */
  ruleId: string;
  /** Why this classification and not a firmer or weaker one. */
  reason: string;
};

/**
 * Four states, because collapsing them loses the distinction that matters.
 *
 * NO_CONSTRAINT_FOUND  the posting states no requirement this candidate has to
 *                      clear (informational notes may still be attached)
 * ELIGIBLE             every stated requirement is satisfied by declared facts
 * REVIEW_REQUIRED      a requirement exists that declared facts cannot resolve
 * INELIGIBLE           a hard requirement conflicts with declared facts
 *
 * INELIGIBLE is unreachable without candidate facts, by design. Guessing a
 * candidate's citizenship or immigration status is not permitted.
 */
export type EligibilityVerdict =
  | "NO_CONSTRAINT_FOUND"
  | "ELIGIBLE"
  | "REVIEW_REQUIRED"
  | "INELIGIBLE";

export type EligibilityAssessment = {
  verdict: EligibilityVerdict;
  /** One short sentence for the UI. Never invents a requirement. */
  headline: string;
  /** Every finding, including informational ones, so the evidence survives. */
  constraints: PostingConstraint[];
  /** The constraints driving an INELIGIBLE verdict. Empty otherwise. */
  blocking: PostingConstraint[];
  /** Constraints that could not be resolved against declared facts. */
  unresolved: PostingConstraint[];
  detectorVersion: string;
  /** Null when the candidate has declared nothing. */
  candidateFactsUpdatedAt: string | null;
};

/**
 * What the candidate has explicitly told us. Never inferred from a résumé, an
 * email domain, a job location, or anything else.
 */
export type CandidateEligibilityFacts = {
  version: 1;
  /** ISO 3166-1 alpha-2 codes the candidate has declared they may work in. */
  authorizedCountries: string[];
  /**
   * True only when the candidate confirms the list above is exhaustive.
   * Without it, an absent country means "unknown", not "not authorized" — so
   * no exclusion can be drawn from absence.
   */
  declarationComplete: boolean;
  updatedAt: string;
};
