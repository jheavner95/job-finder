import Link from "next/link";
import type { JobListItem } from "@/lib/view-models";

function scoreTone(score: number) {
  if (score >= 80) return "strong";
  if (score >= 50) return "possible";
  return "low";
}
export function StatusPill({ status }: { status: JobListItem["status"] }) {
  return (
    <span className={`status status-${status.toLowerCase().replace(" ", "-")}`}>
      {status}
    </span>
  );
}

export function JobRow({ job }: { job: JobListItem }) {
  return (
    <article className="job-row">
      <Link
        className="job-main"
        href={`/jobs/${job.id}`}
        aria-label={`Open ${job.title} at ${job.company}`}
      >
        <span className="provider-avatar" aria-label={`${job.source} provider`}>{job.source.slice(0, 1).toUpperCase()}</span>
        <span className="job-copy">
          <span className="job-topline">
            <strong>{job.title}</strong>
            <StatusPill status={job.status} />
          </span>
          <span className="company-name">{job.company}</span>
          <span className="job-meta">
            {job.location}<i>·</i>{job.remoteStatus}<i>·</i>{job.employmentType}
          </span>
          <span className="match-line">{job.matchReason}</span>
          <span
            className={`verification-badge verification-${job.verification.tone}`}
            title={`Imported from ${job.source}. ${job.verification.label}.`}
          >
            {job.verification.tone === "verified" ? "✓ " : ""}{job.verification.label}
          </span>
          {job.concerns[0] && <span className="concern-line">Watch: {job.concerns[0]}</span>}
        </span>
      </Link>
      <div className="job-side">
        <div className={`score score-${scoreTone(job.score)}`}>
          <strong>{job.score}</strong><span>match</span>
        </div>
        <span className="confidence-label">{job.confidence}% confidence</span>
        {job.eligibility === "excluded" && (
          <span className="eligibility-label">Hard requirement conflict</span>
        )}
        <span className="comp">{job.compensation}</span>
        <span className="source">{job.verification.officialAts} · {job.verification.importAge}</span>
      </div>
    </article>
  );
}
