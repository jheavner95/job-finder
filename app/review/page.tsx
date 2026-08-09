import { JobRow } from "@/app/components/JobRow";
import { WorkspaceLayout } from "@/app/components/PageLayout";
import { PageHeader } from "@/app/components/PageHeader";
import { getJobs } from "@/lib/queries";
import { OPPORTUNITY_TIERS, isReviewable, type OpportunityTier } from "@/lib/opportunity-tiers";
import Link from "next/link";

export const dynamic = "force-dynamic";

// The queue is organised by how good the fit is, not by a decision the user has
// not made yet. Low Relevance is reachable but never the default view.
const filters = ["Reviewable", ...OPPORTUNITY_TIERS] as const;
type Filter = (typeof filters)[number];

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string; status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const requested = params.tier ?? params.status;
  const selected: Filter = filters.includes(requested as Filter)
    ? (requested as Filter)
    : "Reviewable";
  const query = params.q?.trim().toLowerCase() ?? "";
  const jobs = await getJobs();

  const inFilter = (tier: OpportunityTier, filter: Filter) =>
    filter === "Reviewable" ? isReviewable(tier) : tier === filter;

  const isBlocked = (job: (typeof jobs)[number]) =>
    job.eligibilityAssessment?.verdict === "INELIGIBLE";

  const filtered = jobs
    .filter((job) =>
      inFilter(job.tier, selected)
      && `${job.title} ${job.company} ${job.location}`.toLowerCase().includes(query))
    // Definitively ineligible roles stay in the queue but sink below the ones
    // that can actually be pursued. Removing them would hide a real posting and
    // make the discovered corpus look smaller than it is.
    .sort((left, right) => Number(isBlocked(left)) - Number(isBlocked(right)));
  const reviewable = jobs.filter((job) => isReviewable(job.tier)).length;
  const blocked = filtered.filter(isBlocked).length;
  const needsCheck = filtered.filter(
    (job) => job.eligibilityAssessment?.verdict === "REVIEW_REQUIRED",
  ).length;

  return (
    <WorkspaceLayout>
      <PageHeader
        title="Review queue"
        subtitle="Imported opportunities ranked against your saved career profile."
      />
      <div className="queue-tools">
        <div className="filter-tabs" role="group" aria-label="Filter opportunities by fit">
          {filters.map((filter) => {
            const count = jobs.filter((job) => inFilter(job.tier, filter)).length;
            const href = filter === "Reviewable"
              ? "/review"
              : `/review?tier=${encodeURIComponent(filter)}`;
            return (
              <a key={filter} href={href} className={selected === filter ? "selected" : ""} aria-current={selected === filter ? "page" : undefined}>
                {filter}<span>{count}</span>
              </a>
            );
          })}
        </div>
        <form className="search" action="/review">
          {selected !== "Reviewable" && <input type="hidden" name="tier" value={selected} />}
          <span aria-hidden="true">⌕</span>
          <label className="sr-only" htmlFor="job-search">Search opportunities</label>
          <input id="job-search" name="q" defaultValue={params.q} placeholder="Search title, company, location" />
          <button type="submit">Search</button>
        </form>
      </div>
      <div className="queue-summary" aria-live="polite">
        <span>
          <b>{filtered.length - blocked}</b> of {reviewable} you can pursue
          <small> · {jobs.length} discovered</small>
          {needsCheck > 0 && <small> · {needsCheck} need an eligibility check</small>}
          {blocked > 0 && <small> · {blocked} blocked by eligibility</small>}
        </span>
        <span>Sorted by fit <b>↓</b></span>
      </div>
      {filtered.length ? (
        <div className="job-list all-jobs">
          {filtered.map((job) => <JobRow key={job.id} job={job} />)}
        </div>
      ) : (
        <div className="empty-state">
          <strong>{jobs.length ? "No opportunities match this filter" : "No opportunities are waiting for review."}</strong>
          <p>{jobs.length ? "Try a broader tier or a different search term." : "Newly discovered opportunities will appear here."}</p>
          {!jobs.length && <Link className="primary-button button-link" href="/discovery">Discover opportunities</Link>}
        </div>
      )}
    </WorkspaceLayout>
  );
}
