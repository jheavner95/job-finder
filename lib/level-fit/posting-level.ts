import { plainPostingText } from "../job-content";
import {
  LEVEL_PHRASES,
  LEVEL_TOKENS,
  highestLevel,
  levelFromYears,
  lowestLevel,
  rankOf,
} from "./ladder";
import type { CareerLevel, LevelEvidence, PostingLevel, RoleTrack } from "./types";

export const LEVEL_DETECTOR_VERSION = "level-detector@1";

/* ------------------------------------------------------------------ *
 * Level from the title
 * ------------------------------------------------------------------ */

/**
 * Every level named in a title, highest first.
 *
 * Range titles are common and meaningful: "Senior / Staff Product Designer",
 * "Staff/Principal Product Designer", "Product Designer (Senior, Lead)". Both
 * ends are kept, because the posting will hire at either and the candidate is
 * being measured against the whole span.
 */
export function levelsFromTitle(title: string): { levels: CareerLevel[]; evidence: LevelEvidence[] } {
  const evidence: LevelEvidence[] = [];
  const found: CareerLevel[] = [];
  let remaining = title;

  // Phrases first, and their text is removed so the single-token pass cannot
  // read "Associate Design Director" a second time as a junior signal.
  for (const { pattern, level } of LEVEL_PHRASES) {
    const match = pattern.exec(remaining);
    if (!match) continue;
    found.push(level);
    evidence.push({ source: "title", text: match[0], signal: `${level} (phrase)` });
    remaining = remaining.replace(match[0], " ");
  }

  for (const { pattern, level } of LEVEL_TOKENS) {
    const match = pattern.exec(remaining);
    if (!match) continue;
    if (!found.includes(level)) {
      found.push(level);
      evidence.push({ source: "title", text: match[0], signal: level });
    }
    remaining = remaining.replace(match[0], " ");
  }

  const levels = found
    .filter((level) => rankOf(level) !== null)
    .sort((a, b) => (rankOf(b) ?? 0) - (rankOf(a) ?? 0));
  return { levels, evidence };
}

/* ------------------------------------------------------------------ *
 * Years of experience
 * ------------------------------------------------------------------ */

/**
 * A years figure only counts when it is attached to experience.
 *
 * Postings are full of unrelated numbers — "5 years ago", "a 3 year roadmap",
 * "10 years in business" — so the number has to sit next to a word that makes
 * it a requirement on the applicant.
 */
const YEARS_CONTEXT =
  /(?:experience|practice|designing|working|background|track record|in (?:product )?design)/i;

const YEARS_RANGE = /\b(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\s*\+?\s*years?\b/gi;
const YEARS_MINIMUM =
  /\b(?:at least|minimum(?: of)?|min\.?|over)?\s*(\d{1,2})\s*\+?\s*years?\b/gi;

export function yearsFromPosting(text: string): {
  min: number | null;
  max: number | null;
  evidence: LevelEvidence[];
} {
  const evidence: LevelEvidence[] = [];
  const mins: number[] = [];
  const maxes: number[] = [];

  const consider = (match: RegExpExecArray, low: number, high: number | null) => {
    // A 60-character window either side is enough to tell a requirement from a
    // stray number without pulling in the next sentence.
    const window = text.slice(Math.max(0, match.index - 60), match.index + match[0].length + 60);
    if (!YEARS_CONTEXT.test(window)) return;
    if (low < 0 || low > 40) return;
    mins.push(low);
    if (high !== null) maxes.push(high);
    evidence.push({
      source: "years-of-experience",
      text: match[0].trim(),
      signal: high === null ? `${low}+ years` : `${low}–${high} years`,
    });
  };

  const ranged: Array<[number, number]> = [];
  for (const match of text.matchAll(YEARS_RANGE)) {
    const low = Number(match[1]);
    const high = Number(match[2]);
    if (high < low) continue;
    ranged.push([match.index ?? 0, (match.index ?? 0) + match[0].length]);
    consider(match as RegExpExecArray, low, high);
  }

  for (const match of text.matchAll(YEARS_MINIMUM)) {
    const at = match.index ?? 0;
    // Skip the two halves of a range already counted above.
    if (ranged.some(([from, to]) => at >= from && at < to)) continue;
    consider(match as RegExpExecArray, Number(match[1]), null);
  }

  return {
    // The highest stated minimum is the bar, not the lowest. Postings list a
    // headline requirement plus narrower slices of the same career — "4+ years
    // of product design" alongside "2+ years with design systems" — and reading
    // the smallest number turned a mid-level role into a junior one. Erring
    // upward also protects against the worse mistake: calling a senior IC
    // posting junior.
    min: mins.length ? Math.max(...mins) : null,
    max: maxes.length ? Math.max(...maxes) : null,
    evidence: evidence.slice(0, 4),
  };
}

/* ------------------------------------------------------------------ *
 * Track
 * ------------------------------------------------------------------ */

/**
 * Direct-report language. Mentorship is deliberately absent: Staff and
 * Principal ICs are expected to mentor, and treating "mentor junior designers"
 * as management would reclassify most senior IC postings on the ladder.
 */
const MANAGEMENT_SIGNALS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bdirect reports?\b/i, label: "direct reports" },
  { pattern: /\bmanage\s+(?:a\s+)?(?:team|group|squad)\s+of\b/i, label: "manages a team" },
  { pattern: /\b(?:people|line)\s+manage(?:ment|r)?\b/i, label: "people management" },
  // Performance reviews need an owning verb. Unqualified, the phrase is a
  // perk: "career development through performance reviews, mentoring programs".
  { pattern: /\b(?:conduct|lead|deliver|own|run|write|give)(?:s|ing)?\s+(?:\w+\s+){0,2}?performance (?:reviews?|management)\b/i, label: "conducts performance reviews" },
  { pattern: /\bhir(?:e|ing)(?:,| and)\s+(?:develop|grow|retain|coach)/i, label: "hiring and developing" },
  { pattern: /\brecruit(?:ing)?,?\s+(?:and\s+)?(?:developing|growing|managing)\b/i, label: "recruiting and growing" },
  { pattern: /\bcareer (?:development|growth) of\b/i, label: "career development of reports" },
  { pattern: /\bmanager of managers\b/i, label: "manager of managers" },
  // "Growing the team" was removed: in this corpus it is company marketing
  // ("Figma is growing our team of passionate creatives"), not a duty.
];

/**
 * A denial of management duties is strong IC evidence, not weak management
 * evidence. "It does not include people management responsibilities" was being
 * read as the opposite of what it says.
 */
const NEGATION_BEFORE = /\b(?:no|not|without|never|free of|excludes?|exclud(?:ing)?)\b[^.;:]{0,40}$/i;

const IC_SIGNALS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bindividual contributor\b/i, label: "individual contributor" },
  { pattern: /\bno direct reports\b/i, label: "no direct reports" },
  { pattern: /\bnon-?managerial\b/i, label: "non-managerial" },
  { pattern: /\bthis is an? ic role\b/i, label: "IC role" },
];

const PLAYER_COACH_SIGNALS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bplayer[-\s]?coach\b/i, label: "player-coach" },
  { pattern: /\bhands[-\s]on lead(?:er|ership)?\b/i, label: "hands-on leadership" },
  { pattern: /\bboth (?:hands[-\s]on|ic) and (?:manage|lead)/i, label: "hands-on and managing" },
];

/**
 * Signals strong enough to call a role executive.
 *
 * "Owns the design org" and "partners with the executive team" appear in
 * ordinary Director postings and are deliberately excluded — a Director who
 * mentions the design organisation is still a Director. Only a reporting line
 * into the top of the company, or managing managers, moves the track.
 */
const EXECUTIVE_SIGNALS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\breport(?:s|ing)? (?:directly )?to the (?:ceo|founder|coo|president|chief)\b/i, label: "reports to the CEO" },
  { pattern: /\bmanager of managers\b/i, label: "manager of managers" },
  { pattern: /\bmanage (?:a team of |other )?(?:design )?managers\b/i, label: "manages managers" },
  { pattern: /\b(?:member of|on) the executive (?:team|leadership team)\b/i, label: "on the executive team" },
];

/** Title words that carry a track on their own. */
const MANAGEMENT_TITLES = /\b(?:manager|head of|director|vice president|vp|chief)\b/i;

export function trackFromPosting(
  title: string,
  body: string,
  level: CareerLevel,
): { track: RoleTrack; evidence: LevelEvidence[] } {
  const evidence: LevelEvidence[] = [];
  const denied: string[] = [];
  const collect = (
    signals: Array<{ pattern: RegExp; label: string }>,
    source: LevelEvidence["source"],
    honourNegation = false,
  ) => {
    const hits: string[] = [];
    for (const { pattern, label } of signals) {
      const match = pattern.exec(body);
      if (!match) continue;
      if (honourNegation && NEGATION_BEFORE.test(body.slice(0, match.index))) {
        denied.push(label);
        evidence.push({ source, text: match[0], signal: `explicitly not ${label}` });
        continue;
      }
      hits.push(label);
      evidence.push({ source, text: match[0], signal: label });
    }
    return hits;
  };

  const executive = collect(EXECUTIVE_SIGNALS, "responsibilities", true);
  const management = collect(MANAGEMENT_SIGNALS, "responsibilities", true);
  const playerCoach = collect(PLAYER_COACH_SIGNALS, "responsibilities");
  const ic = [...collect(IC_SIGNALS, "responsibilities"), ...denied];

  const titleManagement = MANAGEMENT_TITLES.exec(title);
  if (titleManagement) {
    evidence.push({ source: "title", text: titleManagement[0], signal: "management title" });
  }

  // A Director is not an executive. The rung has to be executive or head-of-
  // function before executive-track language can promote the track, otherwise
  // every Director posting that mentions the leadership team becomes C-level.
  if (level === "executive" || (executive.length && level === "head")) {
    return { track: "executive-leadership", evidence };
  }
  if (playerCoach.length) return { track: "player-coach", evidence };
  if (management.length && ic.length) return { track: "player-coach", evidence };
  if (ic.length) return { track: "individual-contributor", evidence };
  if (management.length || titleManagement) return { track: "people-management", evidence };

  // "Lead" alone says nothing about reports — it is the single most common
  // false read of a management title, and the corpus has Design Leads that are
  // senior ICs. Absent evidence stays absent.
  if (level === "lead") return { track: "unknown", evidence };

  // A Staff/Principal/Senior designer posting with no management language at
  // all is an IC posting; that is what those rungs mean.
  if (level === "staff" || level === "principal" || level === "senior" || level === "junior" || level === "mid") {
    return { track: "individual-contributor", evidence };
  }
  return { track: "unknown", evidence };
}

/* ------------------------------------------------------------------ *
 * Assembly
 * ------------------------------------------------------------------ */

export type PostingInput = {
  title: string;
  description: string;
  requirements: string[];
};

export function extractPostingLevel(posting: PostingInput): PostingLevel {
  const title = posting.title ?? "";
  const body = [
    plainPostingText(posting.description ?? ""),
    (posting.requirements ?? []).map(plainPostingText).join("\n"),
  ].join("\n");

  const fromTitle = levelsFromTitle(title);
  const years = yearsFromPosting(body);
  const yearsImplied = levelFromYears(years.min);

  const titleLevel = highestLevel(fromTitle.levels);
  // Title outranks the body. A single generic word buried in a description
  // must never override an explicit title, which is how "Staff" and
  // "Principal" leak onto postings that are neither.
  const level: CareerLevel = titleLevel !== "unknown" ? titleLevel : yearsImplied;

  const track = trackFromPosting(title, body, level);

  // Record the gap between what the title claims and what the years ask for.
  // Whether it matters is decided against the candidate's band, not here: a
  // Principal title advertising 7+ years is ordinary title variance, whereas a
  // "Senior" title advertising 2+ years changes whether the role is worth
  // pursuing at all.
  const titleFloor = lowestLevel(fromTitle.levels);
  const titleRank = rankOf(titleFloor);
  const yearsRank = rankOf(yearsImplied);
  const conflicted =
    titleRank !== null && yearsRank !== null && Math.abs(titleRank - yearsRank) >= 2;

  return {
    level,
    track: track.track,
    titleLevels: fromTitle.levels,
    yearsRequiredMin: years.min,
    yearsRequiredMax: years.max,
    yearsImpliedLevel: yearsImplied,
    conflicted,
    // Postings repeat themselves across the description and the requirements
    // list, so the same sentence would otherwise be cited twice.
    evidence: dedupeEvidence([...fromTitle.evidence, ...years.evidence, ...track.evidence]).slice(0, 12),
  };
}

function dedupeEvidence(items: LevelEvidence[]): LevelEvidence[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.source}|${item.text.trim().toLowerCase()}|${item.signal}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
