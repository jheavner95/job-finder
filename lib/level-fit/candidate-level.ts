import { highestLevel, lowestLevel, rankOf } from "./ladder";
import { levelsFromTitle } from "./posting-level";
import type { CandidateLevelProfile, CareerLevel, LevelEvidence, RoleTrack } from "./types";

/**
 * Build the candidate's level profile from what is actually persisted.
 *
 * Sources, in the order they are trusted:
 *   1. `CandidateCareerPreferences.preferredRoles` — an explicit statement of
 *      what they want, which outranks inference from history.
 *   2. `CandidateResumeEvidence` — the most recent role, for current level.
 *   3. `CandidateProfile.yearsExperience` — corroboration only.
 *
 * Nothing is read from this module's own assumptions about the user.
 */

/**
 * Preference text is hand-typed, so it is parsed more forgivingly than a
 * posting. "Principle Product Designer" is a spelling of Principal.
 *
 * This tolerance must never reach the posting parser: "design principles"
 * appears in a large share of job descriptions and would misread as a
 * Principal-level requirement.
 */
const PREFERENCE_TYPOS: Array<[RegExp, CareerLevel]> = [
  [/\bprincip(?:le|el|al)\b/i, "principal"],
  [/\bsenoir\b/i, "senior"],
];

function levelsFromPreference(role: string): CareerLevel[] {
  const found = new Set<CareerLevel>(levelsFromTitle(role).levels);
  for (const [pattern, level] of PREFERENCE_TYPOS) {
    if (pattern.test(role)) found.add(level);
  }
  return [...found];
}

export type ResumeRole = {
  title: string;
  startDate: string | null;
  endDate: string | null;
};

/**
 * The role held now.
 *
 * A role marked "Present" wins over any dated role, because an overlapping
 * contract with a later start date is not a promotion.
 */
export function currentRoleLevel(roles: ResumeRole[]): {
  level: CareerLevel;
  evidence: LevelEvidence[];
} {
  if (!roles.length) return { level: "unknown", evidence: [] };
  const present = roles.filter((role) => /present|current/i.test(role.endDate ?? ""));
  const pool = present.length ? present : roles;

  const dated = [...pool].sort(
    (left, right) => monthValue(right.startDate) - monthValue(left.startDate),
  );
  for (const role of dated) {
    const level = highestLevel(levelsFromTitle(role.title).levels);
    if (level !== "unknown") {
      return {
        level,
        evidence: [{ source: "profile", text: role.title, signal: `current level: ${level}` }],
      };
    }
  }
  return { level: "unknown", evidence: [] };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Apr 2025" → a sortable integer. Unparseable dates sort last. */
function monthValue(value: string | null): number {
  if (!value) return -1;
  const year = /\b(19|20)\d{2}\b/.exec(value);
  if (!year) return -1;
  const month = MONTHS.findIndex((name) => new RegExp(`\\b${name}`, "i").test(value));
  return Number(year[0]) * 12 + (month < 0 ? 0 : month);
}

export function parseTrackPreference(value: unknown): RoleTrack | null {
  const allowed: RoleTrack[] = [
    "individual-contributor",
    "player-coach",
    "people-management",
    "executive-leadership",
  ];
  return typeof value === "string" && (allowed as string[]).includes(value)
    ? (value as RoleTrack)
    : null;
}

export function buildCandidateLevelProfile(input: {
  yearsExperience: number | null;
  preferredRoles: string[];
  resumeRoles: ResumeRole[];
  trackPreference: unknown;
}): CandidateLevelProfile {
  const evidence: LevelEvidence[] = [];
  const targetLevels: CareerLevel[] = [];

  for (const role of input.preferredRoles) {
    for (const level of levelsFromPreference(role)) {
      if (!targetLevels.includes(level)) {
        targetLevels.push(level);
        evidence.push({ source: "profile", text: role, signal: `target level: ${level}` });
      }
    }
  }

  const current = currentRoleLevel(input.resumeRoles);
  evidence.push(...current.evidence);

  if (input.yearsExperience !== null) {
    evidence.push({
      source: "profile",
      text: `${input.yearsExperience} years`,
      // Years say how long, not how high. A long career in IC work is not a
      // qualification for running a design organisation.
      signal: "years of experience (corroboration only)",
    });
  }

  return {
    yearsExperience: input.yearsExperience,
    targetLevels: targetLevels
      .filter((level) => rankOf(level) !== null)
      .sort((a, b) => (rankOf(a) ?? 0) - (rankOf(b) ?? 0)),
    currentLevel: current.level,
    trackPreference: parseTrackPreference(input.trackPreference),
    evidence,
  };
}

export function targetBand(
  profile: CandidateLevelProfile,
): { min: CareerLevel; max: CareerLevel } | null {
  if (!profile.targetLevels.length) return null;
  return { min: lowestLevel(profile.targetLevels), max: highestLevel(profile.targetLevels) };
}
