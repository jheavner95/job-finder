import { compareByDecision } from "./decision-order";
import {
  countOpportunities,
  needsReview,
  groupKey,
  presentOpportunity,
  tierOf,
  type OpportunityCounts,
  type OpportunityPresentation,
} from "./opportunity-presentation";
import type { OpportunityTier } from "./opportunity-tiers";
import type { JobListItem } from "./view-models";

/**
 * Today is a decision brief, not a dashboard.
 *
 * It answers three questions and stops: what changed, what deserves attention,
 * what to do next. Everything the old dashboard and daily briefing carried that
 * answered none of them — crawl totals, duplicates prevented, provider
 * failures, boards fetching, four permanently-zero pipeline tiles — belongs to
 * System, and is not selected here.
 */

type Tiered = JobListItem & { tier?: OpportunityTier };

/** A day. The only window the data actually supports: `firstSeenAt` is real,
 *  and nothing records when the user last opened the product. */
export const RECENT_WINDOW_HOURS = 24;

/* ------------------------------------------------------------------ *
 * Grouping
 * ------------------------------------------------------------------ */

export { groupKey };

export type GroupedOpportunity = OpportunityPresentation & {
  /** How many postings this row stands for, including the one shown. */
  listings: number;
  /** Distinct locations across the group, when they differ. */
  locations: number;
};

/**
 * Collapse duplicates, keeping the strongest instance of each role.
 *
 * "Strongest" uses the same comparator as the review queue, so the survivor is
 * the one the queue would also have shown first.
 */
export function groupOpportunities(jobs: Tiered[]): GroupedOpportunity[] {
  const groups = new Map<string, Tiered[]>();
  for (const job of jobs) {
    const key = groupKey(job);
    const existing = groups.get(key);
    if (existing) existing.push(job);
    else groups.set(key, [job]);
  }
  return [...groups.values()].map((members) => {
    const [best] = [...members].sort((left, right) =>
      compareByDecision(
        { ...left, tier: tierOf(left) },
        { ...right, tier: tierOf(right) },
      ),
    );
    const locations = new Set(
      members.map((member) => (member.location ?? "").toLowerCase().trim()).filter(Boolean),
    );
    return { ...presentOpportunity(best), listings: members.length, locations: locations.size };
  });
}

/* ------------------------------------------------------------------ *
 * Selection
 * ------------------------------------------------------------------ */

/** Today shows a shortlist. The queue owns the full list. */
export const START_HERE_LIMIT = 5;
export const NEW_TODAY_LIMIT = 4;

export type AttentionItem = {
  id: string;
  label: string;
  href: string;
  count: number;
};

export type TodayModel = {
  counts: OpportunityCounts;
  /**
   * Postings that arrived in the window. Counted ungrouped and unfiltered, so
   * "new" means the same thing here as everywhere else — grouping changes what
   * the list shows, never what the number means.
   */
  newCount: number;
  /** The strongest undecided roles, deduplicated and bounded. */
  startHere: GroupedOpportunity[];
  /** Recent arrivals not already shown above, so the two lists never repeat. */
  newToday: GroupedOpportunity[];
  /** Things that need a decision beyond "read this role". */
  attention: AttentionItem[];
  /** Decisions the user has already recorded. Empty when there are none. */
  decided: { applied: number; saved: number };
};

export function buildToday(jobs: Tiered[], now: Date): TodayModel {
  const since = now.getTime() - RECENT_WINDOW_HOURS * 60 * 60 * 1000;
  const isRecent = (job: Tiered) => new Date(job.verification.importedAt).getTime() >= since;

  const counts = countOpportunities(jobs);
  const reviewable = jobs.filter(needsReview);

  const ranked = groupOpportunities(reviewable).sort(
    (left, right) =>
      compareByDecision(
        { tier: left.tier, score: left.score, title: left.title },
        { tier: right.tier, score: right.score, title: right.title },
      ),
  );
  const startHere = ranked.slice(0, START_HERE_LIMIT);

  const shown = new Set(startHere.map((item) => item.id));
  const recent = groupOpportunities(reviewable.filter(isRecent));
  const newToday = recent
    .filter((item) => !shown.has(item.id))
    .sort((left, right) => right.score - left.score)
    .slice(0, NEW_TODAY_LIMIT);

  /*
   * Only genuine decisions earn a line. A count of zero is not news.
   *
   * Counted as distinct opportunities, because the line is a link and the
   * destination counts them that way: a strip that promises 24 and delivers a
   * list of 18 reads as a broken filter rather than as two units of measure.
   */
  const eligibilityChecks = groupOpportunities(
    reviewable.filter((job) => job.eligibilityAssessment?.verdict === "REVIEW_REQUIRED"),
  ).length;
  const attention: AttentionItem[] = [];
  if (eligibilityChecks > 0) {
    attention.push({
      id: "eligibility",
      label: `${eligibilityChecks} need an eligibility check`,
      href: "/review?refine=needs-eligibility-check",
      count: eligibilityChecks,
    });
  }
  if (counts.outsideLevel > 0) {
    attention.push({
      id: "outside-level",
      label: `${counts.outsideLevel} outside your level`,
      // Off-level roles are excluded from "to review" by definition, so this
      // lands on the state that contains them rather than one that cannot.
      href: "/review?state=all&refine=outside-level",
      count: counts.outsideLevel,
    });
  }

  return {
    counts,
    newCount: jobs.filter(isRecent).length,
    startHere,
    newToday,
    attention,
    decided: { applied: counts.applied, saved: counts.saved },
  };
}
