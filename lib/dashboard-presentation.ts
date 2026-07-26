import type { JobListItem } from "./view-models";

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

function attentionPriority(job: JobListItem) {
  if (
    job.score >= 85 &&
    (job.status === "New" || job.status === "Strong Match")
  ) {
    return 1;
  }
  if (
    job.score >= 50 &&
    job.score < 85 &&
    (job.status === "New" || job.status === "Possible")
  ) {
    return 2;
  }
  if (job.status === "Saved") return 3;
  if (ACTIVE_APPLICATION_STATUSES.includes(job.status)) return 4;
  return null;
}

export function presentDashboard(jobs: JobListItem[]) {
  const prioritized = jobs
    .map((job) => ({ job, priority: attentionPriority(job) }))
    .filter(
      (
        item,
      ): item is { job: JobListItem; priority: number } =>
        item.priority !== null,
    )
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        b.job.score - a.job.score ||
        a.job.title.localeCompare(b.job.title),
    );
  const attention = prioritized.slice(0, 2).map(({ job }) => job);
  const strongAttentionCount = prioritized.filter(
    ({ priority }) => priority === 1,
  ).length;
  const awaitingReview = statusCount(jobs, REVIEW_STATUSES);
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
            title: `${strongAttentionCount} strong ${strongAttentionCount === 1 ? "opportunity is" : "opportunities are"} ready for review.`,
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
        ? { label: "Open review queue", href: "/review" }
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
