import type { CareerLevel, RoleTrack } from "./types";

/**
 * The rungs, and how far apart they are.
 *
 * Staff and Lead share a rung deliberately. They are the same altitude reached
 * by different routes, and treating one as a promotion over the other would
 * reintroduce exactly the "higher title is better" assumption this dimension
 * exists to remove. Principal sits one above both; Director above that.
 */
export const LEVEL_RANK: Record<CareerLevel, number | null> = {
  junior: 1,
  mid: 2,
  senior: 3,
  staff: 4,
  lead: 4,
  principal: 5,
  director: 6,
  head: 7,
  executive: 8,
  unknown: null,
};

export const LEVEL_LABEL: Record<CareerLevel, string> = {
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
  staff: "Staff",
  lead: "Lead",
  principal: "Principal",
  director: "Director",
  head: "Head of function",
  executive: "Executive",
  unknown: "Not stated",
};

export const TRACK_LABEL: Record<RoleTrack, string> = {
  "individual-contributor": "Individual contributor",
  "player-coach": "Player-coach",
  "people-management": "People management",
  "executive-leadership": "Executive leadership",
  unknown: "Not stated",
};

export function rankOf(level: CareerLevel): number | null {
  return LEVEL_RANK[level];
}

/** Highest rung wins. Ties keep the first argument, so title order is stable. */
export function highestLevel(levels: CareerLevel[]): CareerLevel {
  let best: CareerLevel = "unknown";
  for (const level of levels) {
    const rank = rankOf(level);
    if (rank === null) continue;
    const bestRank = rankOf(best);
    if (bestRank === null || rank > bestRank) best = level;
  }
  return best;
}

export function lowestLevel(levels: CareerLevel[]): CareerLevel {
  let best: CareerLevel = "unknown";
  for (const level of levels) {
    const rank = rankOf(level);
    if (rank === null) continue;
    const bestRank = rankOf(best);
    if (bestRank === null || rank < bestRank) best = level;
  }
  return best;
}

/**
 * Multi-word level phrases, matched before single tokens.
 *
 * "Associate Design Director" is a Director-track title one notch down, not a
 * junior role — reading its first word alone would be the single worst
 * misclassification this module could make. "Senior Staff" and "Senior Lead"
 * are likewise compounds, not two competing signals.
 */
export const LEVEL_PHRASES: Array<{ pattern: RegExp; level: CareerLevel }> = [
  { pattern: /\bassociate\s+(?:\w+\s+){0,2}?director\b/i, level: "director" },
  { pattern: /\bassociate\s+(?:\w+\s+){0,2}?(?:vice president|vp)\b/i, level: "executive" },
  { pattern: /\bassociate\s+(?:\w+\s+){0,2}?principal\b/i, level: "principal" },
  { pattern: /\bsenior\s+staff\b/i, level: "staff" },
  { pattern: /\bsenior\s+lead\b/i, level: "lead" },
  { pattern: /\bsenior\s+(?:\w+\s+){0,2}?manager\b/i, level: "lead" },
  { pattern: /\bgroup\s+(?:\w+\s+){0,2}?manager\b/i, level: "director" },
  { pattern: /\bvice president\b/i, level: "executive" },
  { pattern: /\bchief\s+\w+\s+officer\b/i, level: "executive" },
  { pattern: /\bhead\s+of\b/i, level: "head" },
  { pattern: /\bentry[-\s]level\b/i, level: "junior" },
  { pattern: /\bmid[-\s]?(?:weight|level)\b/i, level: "mid" },
];

/**
 * Single level tokens.
 *
 * `mid` is absent on purpose: the corpus contains "Middle & High School Program
 * Designer", and no bare "mid"/"middle" token can distinguish a career stage
 * from a school. Only the explicit "midweight"/"mid-level" phrases above count.
 */
export const LEVEL_TOKENS: Array<{ pattern: RegExp; level: CareerLevel }> = [
  { pattern: /\b(?:vp|svp|evp|cdo|cpo|cto|ceo)\b/i, level: "executive" },
  { pattern: /\bexecutive\b/i, level: "executive" },
  { pattern: /\bhead\b/i, level: "head" },
  { pattern: /\bdirector\b/i, level: "director" },
  { pattern: /\bprincipal\b/i, level: "principal" },
  { pattern: /\bstaff\b/i, level: "staff" },
  // "Manager" is a rung on the management track roughly level with Lead, not a
  // promotion above Principal. The track, not the rung, is what differs.
  { pattern: /\bmanager\b/i, level: "lead" },
  { pattern: /\blead(?:er)?\b/i, level: "lead" },
  { pattern: /\b(?:senior|sr\.?|snr\.?)\b/i, level: "senior" },
  { pattern: /\b(?:junior|jr\.?|graduate|intern|apprentice)\b/i, level: "junior" },
  // Bare "associate" only reaches here when no "associate <director|vp>"
  // phrase matched, so it is genuinely the junior-grade usage.
  { pattern: /\bassociate\b/i, level: "junior" },
];

/**
 * Years of experience implied by each rung, used only as corroboration.
 *
 * Ranges are open at the top: a posting asking for 8+ years is asking for a
 * senior-or-above person, not for someone with exactly eight.
 */
export function levelFromYears(minYears: number | null): CareerLevel {
  if (minYears === null) return "unknown";
  if (minYears <= 2) return "junior";
  if (minYears <= 4) return "mid";
  if (minYears <= 7) return "senior";
  if (minYears <= 11) return "staff";
  return "principal";
}
