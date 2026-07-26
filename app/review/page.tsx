import { JobRow } from "@/app/components/JobRow";
import { PageHeader } from "@/app/components/PageHeader";
import { getJobs } from "@/lib/queries";
import type { JobStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const filters = ["All jobs", "Strong Match", "Possible", "Rejected"] as const;
type Filter = (typeof filters)[number];

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const selected: Filter = filters.includes(params.status as Filter)
    ? (params.status as Filter)
    : "All jobs";
  const query = params.q?.trim().toLowerCase() ?? "";
  const jobs = await getJobs();
  const filtered = jobs.filter((job) => {
    const statusMatch = selected === "All jobs" || job.status === selected as JobStatus;
    const queryMatch = `${job.title} ${job.company} ${job.location}`
      .toLowerCase()
      .includes(query);
    return statusMatch && queryMatch;
  });

  return (
    <div className="page">
      <PageHeader
        title="Review queue"
        subtitle="Imported opportunities compared with your saved career profile."
      />
      <div className="queue-tools">
        <div className="filter-tabs" role="group" aria-label="Filter jobs by status">
          {filters.map((filter) => {
            const count = filter === "All jobs"
              ? jobs.length
              : jobs.filter((job) => job.status === filter).length;
            const href = filter === "All jobs" ? "/review" : `/review?status=${encodeURIComponent(filter)}`;
            return (
              <a key={filter} href={href} className={selected === filter ? "selected" : ""} aria-current={selected === filter ? "page" : undefined}>
                {filter}<span>{count}</span>
              </a>
            );
          })}
        </div>
        <form className="search" action="/review">
          {selected !== "All jobs" && <input type="hidden" name="status" value={selected} />}
          <span aria-hidden="true">⌕</span>
          <label className="sr-only" htmlFor="job-search">Search jobs</label>
          <input id="job-search" name="q" defaultValue={params.q} placeholder="Search title, company, location" />
          <button type="submit">Search</button>
        </form>
      </div>
      <div className="queue-summary" aria-live="polite">
        <span><b>{filtered.length}</b> of {jobs.length} opportunities</span>
        <span>Sorted by match score <b>↓</b></span>
      </div>
      {filtered.length ? (
        <div className="job-list all-jobs">
          {filtered.map((job) => <JobRow key={job.id} job={job} />)}
        </div>
      ) : (
        <div className="empty-state"><strong>{jobs.length ? "No jobs found" : "No opportunities are waiting for review."}</strong><p>{jobs.length ? "Try a broader filter or search term." : "Newly imported opportunities will appear here."}</p></div>
      )}
    </div>
  );
}
