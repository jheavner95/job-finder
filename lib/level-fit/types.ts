/**
 * Level fit is a third, separate dimension.
 *
 * Match score answers "how well does the craft match?". Eligibility answers
 * "can this candidate pursue it?". Level fit answers a question neither of them
 * can express: "is this appropriate for where the candidate is in their career?"
 *
 * DE-3D showed why it cannot live inside the score. `seniorityFit` only ever
 * adds evidence, so "Junior Product Designer" produces no seniority signal at
 * all — the category goes missing and drops out of the denominator instead of
 * counting against the role. That is how a junior posting scored 77 while a
 * Principal posting scored 55.
 *
 * Two things are modelled separately here, because conflating them is the other
 * half of the same mistake:
 *
 *   CAREER LEVEL — how senior the role is
 *   ROLE TRACK   — whether it is an IC, a player-coach, or a people manager
 *
 * A Lead can be any of the three. A Director is not automatically wrong. A
 * management role is not a promotion from an IC role.
 */

export type CareerLevel =
  | "junior"
  | "mid"
  | "senior"
  | "staff"
  | "lead"
  | "principal"
  | "director"
  | "head"
  | "executive"
  | "unknown";

export type RoleTrack =
  | "individual-contributor"
  | "player-coach"
  | "people-management"
  | "executive-leadership"
  | "unknown";

/** Where a level or track conclusion came from. */
export type LevelEvidence = {
  /** Title evidence outranks body evidence and is never overridden by it. */
  source: "title" | "years-of-experience" | "responsibilities" | "profile";
  /** Verbatim matched text. */
  text: string;
  /** What the evidence indicates. */
  signal: string;
};

export type PostingLevel = {
  level: CareerLevel;
  track: RoleTrack;
  /** Every level token found in the title, highest first. Range titles keep both. */
  titleLevels: CareerLevel[];
  /** Minimum years the posting asks for, when stated. */
  yearsRequiredMin: number | null;
  yearsRequiredMax: number | null;
  /** Level implied by the stated years, independent of the title. */
  yearsImpliedLevel: CareerLevel;
  /** True when title evidence and years evidence disagree by two or more rungs. */
  conflicted: boolean;
  evidence: LevelEvidence[];
};

/**
 * Eight states, matching the semantics the brief requires.
 *
 * IDEAL           squarely in the target band, at or near the current level
 * COMPATIBLE      inside the stated target band but below the current level
 * STRETCH         one rung above the target band
 * TOO_JUNIOR      below the target band
 * TOO_SENIOR      two or more rungs above the target band
 * TRACK_MISMATCH  the level works but the IC/management track does not
 * REVIEW_REQUIRED the posting's own evidence disagrees with itself
 * UNKNOWN         no level signal in the posting, or no target band declared
 */
export type LevelFitVerdict =
  | "IDEAL"
  | "COMPATIBLE"
  | "STRETCH"
  | "TOO_JUNIOR"
  | "TOO_SENIOR"
  | "TRACK_MISMATCH"
  | "REVIEW_REQUIRED"
  | "UNKNOWN";

export type LevelFitAssessment = {
  verdict: LevelFitVerdict;
  headline: string;
  posting: PostingLevel;
  /** Null when the candidate profile carries no usable level target. */
  targetBand: { min: CareerLevel; max: CareerLevel } | null;
  currentLevel: CareerLevel;
  detectorVersion: string;
  assessedAt: string;
};

/**
 * The candidate side, derived from persisted profile data — never from this
 * brief, and never invented.
 */
export type CandidateLevelProfile = {
  /** From CandidateProfile.yearsExperience. Null when not recorded. */
  yearsExperience: number | null;
  /** Levels named in CandidateCareerPreferences.preferredRoles. */
  targetLevels: CareerLevel[];
  /** Most recent role's level, from resume evidence. */
  currentLevel: CareerLevel;
  /**
   * Declared IC/management preference. Null when the candidate has not said,
   * in which case no TRACK_MISMATCH can be drawn — an absent preference is not
   * a refusal to manage, and years of experience never imply one.
   */
  trackPreference: RoleTrack | null;
  evidence: LevelEvidence[];
};
