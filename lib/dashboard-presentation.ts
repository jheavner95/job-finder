import {
  type OpportunityTier,
  isReviewable,
  tierForScore,
  tierRank,
} from "./opportunity-tiers";
import type { JobListItem } from "./view-models";
import { countOpportunities } from "./opportunity-presentation";

const REVIEW_STATUSES: JobListItem["status"][] = [
  "New",
  "Strong Match",
  "Possible",
];
const ACTIVE_APPLICATION_STATUSES: JobListItem["status"][] = [
  "Applied",
  "Interviewing",
  "Offer",
];

function statusCount(
  jobs: JobListItem[],
  statuses: JobListItem["status"][],
) {
  return jobs.filter((job) => statuses.includes(job.status)).length;
}

function tierOf(job: JobListItem & { tier?: OpportunityTier }): OpportunityTier {
  return job.tier ?? tierForScore(job.score);
}

/**
 * A job needs review when the user has not decided on it yet and its tier is
 * worth their time. Only "Low Relevance" is held back — every other tier is
 * inspectable, so a 45-point Stretch role no longer vanishes from the list
 * while still being counted as awaiting review.
 */
function needsReview(job: JobListItem) {
  return REVIEW_STATUSES.includes(job.status) && isReviewable(tierOf(job));
}

function attentionPriority(job: JobListItem) {
  // Reviewable opportunities come first, strongest tier first (1-4).
  if (needsReview(job)) return tierRank(tierOf(job)) + 1;
  if (job.status === "Saved") return 5;
  if (ACTIVE_APPLICATION_STATUSES.includes(job.status)) return 6;
  return null;
}

export function presentDashboard<
  T extends JobListItem & { tier?: OpportunityTier },
>(jobs: T[]) {
  const prioritized = jobs
    .map((job) => ({ job, priority: attentionPriority(job) }))
    .filter(
      (item): item is { job: T; priority: number } => item.priority !== null,
    )
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        b.job.score - a.job.score ||
        a.job.title.localeCompare(b.job.title),
    );
  const attention = prioritized.slice(0, 2).map(({ job }) => job);
  // The count and the list are derived from the same predicate, so the number
  // shown can never disagree with what the attention list contains.
  const reviewable = prioritized.filter(({ job }) => needsReview(job));
  const strongAttentionCount = reviewable.filter(
    ({ job }) => tierOf(job) === "Excellent Fit",
  ).length;
  // The headline number is the shared one, so the dashboard and the queue
  // never describe the same pile of work with different totals.
  const awaitingReview = countOpportunities(jobs).needsReview;
  const saved = statusCount(jobs, ["Saved"]);
  const recentlyClosed = statusCount(jobs, ["Closed", "Rejected"]);
  const activeApplications = jobs
    .filter((job) => ACTIVE_APPLICATION_STATUSES.includes(job.status))
    .sort(
      (a, b) =>
        ACTIVE_APPLICATION_STATUSES.indexOf(b.status) -
          ACTIVE_APPLICATION_STATUSES.indexOf(a.status) ||
        b.score - a.score,
    );

  const briefing =
    jobs.length === 0
      ? {
          title: "Your private workspace is ready.",
          detail: "No opportunities have been added, and no search has run.",
        }
      : strongAttentionCount > 0
        ? {
            // "strong" used to mean Excellent Fit here, Excellent-or-Strong in
            // reports, and a provider total on the discovery page — three
            // numbers for one word. The tier is now named exactly.
            title: `${strongAttentionCount} Excellent Fit ${strongAttentionCount === 1 ? "opportunity is" : "opportunities are"} ready for review.`,
            detail: `${Math.max(awaitingReview - strongAttentionCount, 0)} more ${Math.max(awaitingReview - strongAttentionCount, 0) === 1 ? "opportunity is" : "opportunities are"} waiting for your decision.`,
          }
        : awaitingReview > 0
          ? {
              title: `${awaitingReview} ${awaitingReview === 1 ? "role is" : "roles are"} waiting for your decision.`,
              detail: "No strong match is currently available.",
            }
          : {
              title: "Nothing needs an immediate decision.",
              detail: "Your reviewed opportunities remain available in the queue.",
            };

  const primaryAction =
    strongAttentionCount > 0
      ? {
          label: "Review Today’s Matches",
          href: "/review?status=Strong+Match",
        }
      : awaitingReview > 0
        ? { label: "Open Opportunities", href: "/review" }
        : jobs.length > 0
          ? { label: "View opportunities", href: "/review" }
          : null;

  return {
    totalJobs: jobs.length,
    attention,
    strongAttentionCount,
    awaitingReview,
    saved,
    recentlyClosed,
    activeApplications,
    briefing,
    primaryAction,
  };
}
