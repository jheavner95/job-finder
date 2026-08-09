import { targetBand } from "./candidate-level";
import { LEVEL_LABEL, TRACK_LABEL, rankOf } from "./ladder";
import { LEVEL_DETECTOR_VERSION } from "./posting-level";
import type {
  CandidateLevelProfile,
  LevelFitAssessment,
  LevelFitVerdict,
  PostingLevel,
  RoleTrack,
} from "./types";

/**
 * Compare a posting's level against the candidate's band.
 *
 * Two symmetries the old score could not express are load-bearing here:
 *
 *   Too junior and too senior are both mismatches. A rung below the band is a
 *   miss in the same way a rung above it is, and neither is silence.
 *
 *   A management role is not a better version of an IC role. Track is checked
 *   separately, and only ever against a preference the candidate declared.
 */

/** Tracks that put a person in charge of other people. */
const MANAGEMENT_TRACKS: RoleTrack[] = ["people-management", "executive-leadership"];

function conflictsWithPreference(posting: RoleTrack, preferred: RoleTrack): boolean {
  if (posting === "unknown") return false;
  if (posting === preferred) return false;
  // Player-coach satisfies either intent, so it is never a mismatch.
  if (posting === "player-coach" || preferred === "player-coach") return false;
  const postingManages = MANAGEMENT_TRACKS.includes(posting);
  const prefersManaging = MANAGEMENT_TRACKS.includes(preferred);
  return postingManages !== prefersManaging;
}

export function assessLevelFit(
  posting: PostingLevel,
  profile: CandidateLevelProfile,
  now: Date,
): LevelFitAssessment {
  const band = targetBand(profile);
  const base = {
    posting,
    targetBand: band,
    currentLevel: profile.currentLevel,
    detectorVersion: LEVEL_DETECTOR_VERSION,
    assessedAt: now.toISOString(),
  };

  const postingRank = rankOf(posting.level);
  const minRank = band ? rankOf(band.min) : null;
  const maxRank = band ? rankOf(band.max) : null;

  if (postingRank === null) {
    return {
      ...base,
      verdict: "UNKNOWN",
      headline: "The posting does not state a career level.",
    };
  }
  if (minRank === null || maxRank === null) {
    return {
      ...base,
      verdict: "UNKNOWN",
      headline: `${LEVEL_LABEL[posting.level]} role. No target level is recorded in your career profile, so this cannot be judged.`,
    };
  }

  const trackMismatch =
    profile.trackPreference !== null &&
    conflictsWithPreference(posting.track, profile.trackPreference);

  // A clear level miss is reported as a level miss even when the track also
  // differs; the rung is the more actionable fact.
  if (postingRank < minRank) {
    return {
      ...base,
      verdict: "TOO_JUNIOR",
      headline: `${LEVEL_LABEL[posting.level]} role, below your ${LEVEL_LABEL[band!.min]}–${LEVEL_LABEL[band!.max]} target.`,
    };
  }
  if (postingRank >= maxRank + 2) {
    return {
      ...base,
      verdict: "TOO_SENIOR",
      headline: `${LEVEL_LABEL[posting.level]} role, well above your ${LEVEL_LABEL[band!.min]}–${LEVEL_LABEL[band!.max]} target.`,
    };
  }

  if (trackMismatch) {
    return {
      ...base,
      verdict: "TRACK_MISMATCH",
      headline: `The level fits, but this is a ${TRACK_LABEL[posting.track].toLowerCase()} role and you asked for ${TRACK_LABEL[profile.trackPreference!].toLowerCase()}.`,
    };
  }

  if (postingRank === maxRank + 1) {
    return {
      ...base,
      verdict: "STRETCH",
      headline: `${LEVEL_LABEL[posting.level]} role, one step above your ${LEVEL_LABEL[band!.max]} target.`,
    };
  }

  // A posting that disagrees with itself only needs the user's attention when
  // the two readings fall on opposite sides of the target band — one says
  // pursue, the other says skip. A Principal title quoting 7+ years lands
  // inside the band either way and needs no flag.
  const yearsRank = rankOf(posting.yearsImpliedLevel);
  const straddlesBand =
    posting.conflicted && yearsRank !== null && (yearsRank < minRank || yearsRank >= maxRank + 2);
  if (straddlesBand) {
    return {
      ...base,
      verdict: "REVIEW_REQUIRED",
      headline: `The title says ${LEVEL_LABEL[posting.level].toLowerCase()} but the stated ${posting.yearsRequiredMin}+ years suggests ${LEVEL_LABEL[posting.yearsImpliedLevel].toLowerCase()}.`,
    };
  }

  const currentRank = rankOf(profile.currentLevel);
  if (currentRank !== null && postingRank < currentRank - 1) {
    return {
      ...base,
      verdict: "COMPATIBLE",
      headline: `${LEVEL_LABEL[posting.level]} role, inside your target range but below your current ${LEVEL_LABEL[profile.currentLevel]} level.`,
    };
  }

  return {
    ...base,
    verdict: "IDEAL",
    headline: `${LEVEL_LABEL[posting.level]} role, squarely in your target range.`,
  };
}

export function levelVerdictLabel(verdict: LevelFitVerdict): string {
  switch (verdict) {
    case "IDEAL":
      return "Ideal";
    case "COMPATIBLE":
      return "Compatible";
    case "STRETCH":
      return "Stretch";
    case "TOO_JUNIOR":
      return "Too junior";
    case "TOO_SENIOR":
      return "Too senior";
    case "TRACK_MISMATCH":
      return "Track mismatch";
    case "REVIEW_REQUIRED":
      return "Review required";
    default:
      return "Level not stated";
  }
}

export function levelVerdictTone(
  verdict: LevelFitVerdict,
): "clear" | "warning" | "blocked" | "neutral" {
  switch (verdict) {
    case "IDEAL":
      return "clear";
    case "COMPATIBLE":
    case "STRETCH":
      return "neutral";
    case "TOO_JUNIOR":
    case "TOO_SENIOR":
    case "TRACK_MISMATCH":
      return "blocked";
    case "REVIEW_REQUIRED":
      return "warning";
    default:
      return "neutral";
  }
}
