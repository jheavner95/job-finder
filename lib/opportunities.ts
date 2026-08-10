import { compareByDecision } from "./decision-order";
import { countOpportunities, needsReview, type OpportunityCounts } from "./opportunity-presentation";
import { OPPORTUNITY_TIERS, type OpportunityTier } from "./opportunity-tiers";
import { groupOpportunities, type GroupedOpportunity } from "./today";
import type { JobListItem } from "./view-models";

/**
 * The Opportunities workspace.
 *
 * Today curates five roles for this morning. This is the whole collection, and
 * it exists to browse, narrow and hand off — not to prioritise a second time.
 *
 * The old queue offered six tier tabs, a static "Sorted by fit" caption that
 * was not a control, and a summary line that reported the same three totals
 * whatever you were looking at. `?status=Applied` returned all 363 rows, and
 * `?tier=bogus` silently became the default view. Every filter here changes the
 * result set or is rejected.
 */

type Tiered = JobListItem & { tier?: OpportunityTier };

/* ------------------------------------------------------------------ *
 * Decision states
 * ------------------------------------------------------------------ */

/**
 * What the user has decided, in their words.
 *
 * Derived from the statuses `UserDecision` actually persists, collapsed to the
 * four a person would recognise. Interviewing and Offer sit under "Applied"
 * because the distinction is application lifecycle, which UX-4 owns; "Closed"
 * is the posting's state rather than a decision and is not offered as a filter.
 */
export const DECISION_STATES = ["to-review", "saved", "applied", "passed", "all"] as const;
export type DecisionState = (typeof DECISION_STATES)[number];

export const DECISION_LABEL: Record<DecisionState, string> = {
  "to-review": "To review",
  saved: "Saved",
  applied: "Applied",
  passed: "Passed",
  all: "Everything",
};

const IN_PROGRESS: JobListItem["status"][] = ["Applied", "Interviewing", "Offer"];

export function matchesDecisionState(job: Tiered, state: DecisionState): boolean {
  switch (state) {
    case "to-review":
      // The same predicate Today headlines, not a copy of it. Two definitions
      // of "to review" would drift, and the two screens would disagree.
      return needsReview(job);
    case "saved":
      return job.status === "Saved";
    case "applied":
      return IN_PROGRESS.includes(job.status);
    case "passed":
      return job.status === "Rejected" || job.status === "Closed";
    case "all":
      return true;
  }
}

/* ------------------------------------------------------------------ *
 * Refinements
 * ------------------------------------------------------------------ */

/**
 * A second, optional lens.
 *
 * Only dimensions that answer a question the user actually asks while
 * narrowing. Deliberately absent: work mode (unknown on 72% of postings, so it
 * would hide more than it reveals), provider/source (an ingestion detail), and
 * AI relevance — the data model cannot express it, and a filter built from the
 * letters "AI" in a title would be a decoration, not a signal.
 */
export const REFINEMENTS = [
  "any",
  ...OPPORTUNITY_TIERS,
  "needs-eligibility-check",
  "outside-level",
  "thin-evidence",
] as const;
export type Refinement = (typeof REFINEMENTS)[number];

export const REFINEMENT_LABEL: Record<string, string> = {
  any: "Any fit",
  "needs-eligibility-check": "Needs eligibility check",
  "outside-level": "Outside my level",
  "thin-evidence": "Thin evidence",
};

export function refinementLabel(refinement: Refinement): string {
  return REFINEMENT_LABEL[refinement] ?? refinement;
}

/** Asks the grouped row, not its members: see the ordering note below. */
export function matchesRefinement(opportunity: GroupedOpportunity, refinement: Refinement): boolean {
  switch (refinement) {
    case "any":
      return true;
    case "needs-eligibility-check":
      return opportunity.lenses.needsEligibilityCheck;
    case "outside-level":
      return opportunity.lenses.outsideLevel;
    case "thin-evidence":
      return opportunity.lenses.thinEvidence;
    default:
      return opportunity.tier === refinement;
  }
}

/* ------------------------------------------------------------------ *
 * Sorting
 * ------------------------------------------------------------------ */

export const SORTS = ["fit", "newest"] as const;
export type Sort = (typeof SORTS)[number];
export const SORT_LABEL: Record<Sort, string> = { fit: "Best fit", newest: "Most recent" };

/* ------------------------------------------------------------------ *
 * Query parsing
 * ------------------------------------------------------------------ */

export type OpportunityQuery = {
  state: DecisionState;
  refine: Refinement;
  q: string;
  sort: Sort;
  show: number;
  /** Set when a supplied parameter was not recognised, so the UI can say so. */
  rejected: string[];
};

/** How many rows one page renders. The old queue rendered all 363 — 29 screens. */
export const PAGE_SIZE = 50;

/**
 * Parse, and refuse quietly-wrong input.
 *
 * An unrecognised value is reported rather than silently swapped for the
 * default: `?status=Applied` used to return the entire unfiltered list, which
 * looks like a working filter that disagrees with you.
 */
export function parseOpportunityQuery(params: Record<string, string | undefined>): OpportunityQuery {
  const rejected: string[] = [];
  const pick = <T extends string>(raw: string | undefined, allowed: readonly T[], fallback: T, name: string): T => {
    if (!raw) return fallback;
    const match = allowed.find((value) => value.toLowerCase() === raw.toLowerCase());
    if (match) return match;
    rejected.push(`${name}=${raw}`);
    return fallback;
  };
  const show = Number(params.show);
  return {
    state: pick(params.state, DECISION_STATES, "to-review", "state"),
    refine: pick(params.refine, REFINEMENTS, "any", "refine"),
    q: (params.q ?? "").trim(),
    sort: pick(params.sort, SORTS, "fit", "sort"),
    show: Number.isFinite(show) && show > 0 ? Math.min(show, 1_000) : PAGE_SIZE,
    rejected,
  };
}

/* ------------------------------------------------------------------ *
 * The workspace model
 * ------------------------------------------------------------------ */

export type OpportunityWorkspace = {
  /** The page of grouped opportunities to render. */
  visible: GroupedOpportunity[];
  /** Distinct opportunities matching the query, before paging. */
  matched: number;
  /** Underlying postings those opportunities represent. */
  postings: number;
  /** True when more remain beyond this page. */
  hasMore: boolean;
  nextShow: number;
  /** Count per decision state, so the tabs are honest under the current search. */
  stateCounts: Record<DecisionState, number>;
  /** Count per refinement within the chosen state. Zero-count lenses are hidden. */
  refinementCounts: Record<string, number>;
  counts: OpportunityCounts;
};

function searchMatches(job: Tiered, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return `${job.title} ${job.company} ${job.location ?? ""}`.toLowerCase().includes(needle);
}

export function buildOpportunities(jobs: Tiered[], query: OpportunityQuery): OpportunityWorkspace {
  const searched = jobs.filter((job) => searchMatches(job, query.q));

  const stateCounts = Object.fromEntries(
    DECISION_STATES.map((state) => [
      state,
      // Counted as distinct opportunities, matching what the list renders.
      groupOpportunities(searched.filter((job) => matchesDecisionState(job, state))).length,
    ]),
  ) as Record<DecisionState, number>;

  /*
   * State filters postings; refinements filter opportunities. The order is not
   * arbitrary — the two are different kinds of thing.
   *
   * Decision state belongs to the posting. Jobgether advertises "Lead AI
   * Generative Designer" as 36 postings across 36 countries; applying to one
   * must leave a group of 35 still to review, not a row whose count no longer
   * matches its own contents. So state is applied before grouping.
   *
   * Fit, level and evidence belong to the opportunity, which is the grouped
   * row and is represented by its strongest posting. Applied before grouping,
   * a role with one Strong Fit posting and one Worth Reviewing posting counts
   * once under each lens, and the tier counts sum to more than the total —
   * 251 against 249 in the current corpus. Applied after, every opportunity
   * sits under exactly one tier, which is what "my Strong Fit roles" means.
   */
  const inState = groupOpportunities(searched.filter((job) => matchesDecisionState(job, query.state)));
  const refinementCounts = Object.fromEntries(
    REFINEMENTS.map((refinement) => [
      refinement,
      inState.filter((opportunity) => matchesRefinement(opportunity, refinement)).length,
    ]),
  );

  const grouped = inState.filter((opportunity) => matchesRefinement(opportunity, query.refine));

  const sorted =
    query.sort === "newest"
      ? [...grouped].sort((left, right) => right.importedAt.localeCompare(left.importedAt))
      : [...grouped].sort((left, right) =>
          compareByDecision(
            { tier: left.tier, score: left.score, title: left.title },
            { tier: right.tier, score: right.score, title: right.title },
          ),
        );

  return {
    visible: sorted.slice(0, query.show),
    matched: sorted.length,
    postings: grouped.reduce((total, opportunity) => total + opportunity.listings, 0),
    hasMore: sorted.length > query.show,
    nextShow: query.show + PAGE_SIZE,
    stateCounts,
    refinementCounts,
    counts: countOpportunities(jobs),
  };
}
