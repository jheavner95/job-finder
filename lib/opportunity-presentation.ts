import { isReviewable, tierForScore, type OpportunityTier } from "./opportunity-tiers";
import type { JobListItem } from "./view-models";

/**
 * One opportunity means the same thing everywhere.
 *
 * Every surface used to describe the same job differently. The review queue
 * showed sixteen fields, the daily briefing four, a scan result three, and the
 * discovery page led with the ATS provider's logo. The counts disagreed too —
 * "strong" meant Excellent Fit on the dashboard, Excellent-or-Strong in
 * reports, and a provider-derived total on the discovery page, so the product
 * reported 4, 14 and 94 of the same thing.
 *
 * This module owns the vocabulary and the derivation. Surfaces choose how much
 * of it to render; none of them decides what any of it means.
 */

/* ------------------------------------------------------------------ *
 * Counting
 * ------------------------------------------------------------------ */

/** Statuses where the user has not yet decided anything. */
const UNDECIDED: JobListItem["status"][] = ["New", "Strong Match", "Possible"];
const ACTIVE_APPLICATION: JobListItem["status"][] = ["Applied", "Interviewing", "Offer"];

/**
 * The five counts the product is allowed to show.
 *
 * Each answers a question a job seeker actually asks, and none requires
 * knowing how many rows exist in any table.
 */
export type OpportunityCounts = {
  /** Everything Job Finder has found and kept. The corpus size. */
  discovered: number;
  /**
   * Undecided, worth the user's time, and at a level they actually want.
   * This is the headline number: it must equal what the review queue shows by
   * default, or the product is telling the user two different things about the
   * same pile of work.
   */
  needsReview: number;
  /** Undecided and reviewable, but at the wrong career level. Reachable, not hidden. */
  outsideLevel: number;
  /** Of those, the ones rated Strong Fit or better. */
  worthConsidering: number;
  /** Kept for later. */
  saved: number;
  /** Applied, interviewing, or holding an offer. */
  applied: number;
};

type Tiered = JobListItem & { tier?: OpportunityTier };

/**
 * One role, however many times it is listed.
 *
 * Jobgether advertises "Lead AI Generative Designer" as 36 separate postings
 * across 36 countries; AlphaSense lists one Senior/Staff role in three cities.
 * To a person that is one opportunity, so it is the unit every count uses.
 * Strict and literal: identical employer, identical title. Nothing fuzzy.
 */
export function groupKey(job: Tiered): string {
  const flatten = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
  return `${flatten(job.company)}|${flatten(job.title)}`;
}

/** Distinct opportunities, not postings. */
function distinct(jobs: Tiered[]): number {
  return new Set(jobs.map(groupKey)).size;
}

export function tierOf(job: Tiered): OpportunityTier {
  return job.tier ?? tierForScore(job.score);
}

/** Undecided and worth showing at all. */
function undecidedAndReviewable(job: Tiered): boolean {
  return UNDECIDED.includes(job.status) && isReviewable(tierOf(job));
}

/** Too junior, too senior, or the wrong track. Demoted from the default view. */
export function isOutsideLevel(job: Tiered): boolean {
  return ["TOO_JUNIOR", "TOO_SENIOR", "TRACK_MISMATCH"].includes(job.levelFit?.verdict ?? "");
}

/** True when the user still owes this opportunity a decision. */
export function needsReview(job: Tiered): boolean {
  return undecidedAndReviewable(job) && !isOutsideLevel(job);
}

export function countOpportunities(jobs: Tiered[]): OpportunityCounts {
  const reviewable = jobs.filter(needsReview);
  return {
    // Postings found. The only count that measures raw supply.
    discovered: jobs.length,
    // Everything else counts opportunities, so "to review" means the same
    // number on Today as it does in the Opportunities workspace.
    needsReview: distinct(reviewable),
    outsideLevel: distinct(jobs.filter((job) => undecidedAndReviewable(job) && isOutsideLevel(job))),
    worthConsidering: distinct(
      reviewable.filter((job) => ["Excellent Fit", "Strong Fit"].includes(tierOf(job))),
    ),
    saved: distinct(jobs.filter((job) => job.status === "Saved")),
    applied: distinct(jobs.filter((job) => ACTIVE_APPLICATION.includes(job.status))),
  };
}

/** The wording each count is allowed to use. Singular/plural handled here once. */
export const COUNT_LABEL: Record<keyof OpportunityCounts, (n: number) => string> = {
  discovered: (n) => `${n.toLocaleString()} found`,
  needsReview: (n) => `${n.toLocaleString()} to review`,
  outsideLevel: (n) => `${n.toLocaleString()} outside your level`,
  worthConsidering: (n) => `${n.toLocaleString()} worth considering`,
  saved: (n) => `${n.toLocaleString()} saved`,
  applied: (n) => `${n.toLocaleString()} in progress`,
};

/* ------------------------------------------------------------------ *
 * Exceptions
 * ------------------------------------------------------------------ */

/**
 * Only things that change the decision earn a badge.
 *
 * Previously every attribute was rendered whether or not it said anything:
 * a role at exactly the right level, with no eligibility constraint and a
 * compatible work mode, still carried three chips confirming that nothing was
 * wrong. Confirmation of normality is noise — it competes with the cases that
 * genuinely need attention, and there are far more normal rows than exceptional
 * ones.
 */
export type OpportunityException = {
  id: string;
  label: string;
  glyph: string;
  tone: "warning" | "blocked" | "quiet";
  detail: string;
};

export function exceptionsFor(job: JobListItem): OpportunityException[] {
  const found: OpportunityException[] = [];

  const level = job.levelFit;
  if (level && ["TOO_JUNIOR", "TOO_SENIOR", "TRACK_MISMATCH"].includes(level.verdict)) {
    found.push({
      id: "level",
      label: { TOO_JUNIOR: "Below your level", TOO_SENIOR: "Above your level", TRACK_MISMATCH: "Different track" }[
        level.verdict as "TOO_JUNIOR" | "TOO_SENIOR" | "TRACK_MISMATCH"
      ],
      glyph: level.verdict === "TOO_JUNIOR" ? "↓" : level.verdict === "TOO_SENIOR" ? "↑" : "⇄",
      tone: "warning",
      detail: level.headline,
    });
  }

  const eligibility = job.eligibilityAssessment;
  if (eligibility?.verdict === "INELIGIBLE") {
    found.push({ id: "eligibility", label: "Can't apply", glyph: "⊘", tone: "blocked", detail: eligibility.headline });
  } else if (eligibility?.verdict === "REVIEW_REQUIRED") {
    found.push({ id: "eligibility", label: "Check eligibility", glyph: "!", tone: "warning", detail: eligibility.headline });
  }

  if (job.workMode?.compatibility === "INCOMPATIBLE") {
    found.push({ id: "work-mode", label: "Work mode", glyph: "⚠", tone: "warning", detail: job.workMode.headline });
  }

  // Evidence sufficiency is deliberately not a flag: the fit column already
  // withholds the tier and says "Thin evidence" in its place, so a badge would
  // state the same thing twice on the same row.

  return found;
}

/* ------------------------------------------------------------------ *
 * Facts
 * ------------------------------------------------------------------ */

/**
 * The ordinary metadata line.
 *
 * Absent facts are omitted rather than announced. The product was rendering
 * "Location unavailable", "Work model unavailable", "Employment type
 * unavailable" and "Not listed" as though absence were a finding; four
 * placeholders on one row crowd out the two or three facts that are real.
 */
export function factsFor(job: JobListItem): string[] {
  const facts: string[] = [];
  const workMode = job.workMode?.postingMode;
  if (workMode && workMode !== "unknown") {
    facts.push({ remote: "Remote", hybrid: "Hybrid", onsite: "On-site" }[workMode]);
  }
  const place = cleanLocation(job.location);
  if (place) facts.push(place);
  if (stated(job.compensation)) facts.push(job.compensation);
  if (stated(job.employmentType)) facts.push(job.employmentType);
  return facts;
}

/**
 * Whether a field carries a fact rather than a stand-in for one.
 *
 * Applied to every field on the line, because the placeholders are not
 * field-specific: the corpus writes "Not listed" for pay and "n/a" for
 * employment type, and either could appear in the other's place tomorrow.
 */
function stated(value: string | null | undefined): value is string {
  if (!value) return false;
  const text = value.trim();
  // Two shapes: the whole field is a stand-in ("n/a"), or the product wrote a
  // sentence about the absence ("Employment type unavailable").
  if (/unavailable|not provided|not specified/i.test(text)) return false;
  return !/^(not listed|n\/?a|tbd|none|unknown|-|—)$/i.test(text);
}

/**
 * Locations arrive as raw ATS strings — sometimes a city, sometimes twenty-six
 * countries. Keep the first two segments so a row stays one line.
 */
export function cleanLocation(location: string | null | undefined): string | null {
  if (!location || /unavailable|not provided|^-$/i.test(location)) return null;
  const parts = location
    .split(/;|\band\b/)
    .map((part) =>
      part
        .replace(/\b(remote|hybrid|onsite|on-site)\b/gi, "")
        // Removing the work mode can leave the separator that joined it, at
        // either end: "Remote - United States" and "United States - Remote".
        .replace(/^[\s,|·–—-]+|[\s,|·–—-]+$/g, "")
        .trim(),
    )
    .filter(Boolean);
  // "New York, New York, United States; Remote - United States" collapses to
  // one place once the work mode is removed, so repeated segments are dropped
  // rather than printed twice.
  const unique = parts.filter(
    (part, index) => !parts.some((other, otherIndex) => otherIndex < index && other.includes(part)),
  );
  if (!unique.length) return null;

  const shown = unique.slice(0, 2).join("; ");
  const extra = unique.length - 2;
  // Truncate on a comma so a row never ends mid-place-name.
  let trimmed = shown;
  if (shown.length > 46) {
    const cut = shown.lastIndexOf(",", 46);
    trimmed = `${shown.slice(0, cut > 12 ? cut : 45).trimEnd()}…`;
  }
  return extra > 0 ? `${trimmed} +${extra} more` : trimmed;
}

/** "1d", "3h" — short enough to sit in a dense row. */
export function shortAge(importAge: string): string | null {
  const match = /(\d+)\s*(min|hr|hour|day)/i.exec(importAge);
  if (!match) return /just imported/i.test(importAge) ? "now" : null;
  const unit = match[2].toLowerCase().startsWith("min") ? "m" : match[2].toLowerCase().startsWith("h") ? "h" : "d";
  return `${match[1]}${unit}`;
}

/* ------------------------------------------------------------------ *
 * The row model
 * ------------------------------------------------------------------ */

/**
 * Everything a surface needs to render one opportunity consistently, derived
 * once so no page has to decide what matters.
 */
export type OpportunityPresentation = {
  id: string;
  title: string;
  company: string;
  href: string;
  tier: OpportunityTier;
  score: number;
  /** False when the tier claim is not supported; surfaces withhold it. */
  tierIsClaimable: boolean;
  facts: string[];
  exceptions: OpportunityException[];
  /** Only shown once the user has acted; "New" is the quiet default. */
  status: JobListItem["status"] | null;
  age: string | null;
  /** ISO timestamp, so surfaces can sort by recency rather than by a label. */
  importedAt: string;
  /** One line explaining the fit, when the engine produced one. */
  reason: string | null;
  /**
   * The decision flags a filter can narrow by, resolved for the posting this
   * row actually shows. Grouped rows stand for several postings, so a lens has
   * to ask the representative rather than the members — otherwise a role can
   * match two mutually exclusive lenses at once.
   */
  lenses: {
    needsEligibilityCheck: boolean;
    outsideLevel: boolean;
    thinEvidence: boolean;
  };
};

export function presentOpportunity(job: Tiered): OpportunityPresentation {
  const sufficient = job.evidenceCoverage.sufficient;
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    href: `/jobs/${job.id}`,
    tier: tierOf(job),
    score: job.score,
    tierIsClaimable: sufficient,
    facts: factsFor(job),
    exceptions: exceptionsFor(job),
    status: job.status === "New" ? null : job.status,
    age: shortAge(job.verification.importAge),
    importedAt: job.verification.importedAt,
    reason: job.matchReason && !/not yet evaluated/i.test(job.matchReason) ? job.matchReason : null,
    lenses: {
      needsEligibilityCheck: job.eligibilityAssessment?.verdict === "REVIEW_REQUIRED",
      outsideLevel: isOutsideLevel(job),
      thinEvidence: !sufficient,
    },
  };
}

/**
 * AI Product Experience relevance is deliberately absent.
 *
 * The data model cannot express it yet. `OpportunityIntelligence.matchedDomains`
 * carries four generic values — SaaS, developer tools, enterprise internal
 * products, regulated complexity — and no job in the corpus matches an AI
 * domain. AI appears only as a *missing-evidence* note ("the opportunity asks
 * for AI product experience, but the profile contains no confirmed evidence"),
 * which is a gap on the candidate's side rather than a property of the role.
 *
 * Deriving a badge from the letters "AI" in a title would invent a signal the
 * product does not have, so nothing is shown. Recorded as a limitation for a
 * later package.
 */
export const AI_RELEVANCE_SUPPORTED = false;
