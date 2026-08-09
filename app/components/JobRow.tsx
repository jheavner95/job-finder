import Link from "next/link";
import { EligibilityBadge } from "@/app/components/EligibilityBadge";
import { LevelFitBadge } from "@/app/components/LevelFitBadge";
import {
  type OpportunityTier,
  tierForScore,
  tierTone,
} from "@/lib/opportunity-tiers";
import type { JobListItem } from "@/lib/view-models";

type JobRowItem = JobListItem & { tier?: OpportunityTier };

export function StatusPill({ status }: { status: JobListItem["status"] }) {
  return (
    <span className={`status status-${status.toLowerCase().replace(" ", "-")}`}>
      {status}
    </span>
  );
}

export function JobRow({ job }: { job: JobRowItem }) {
  const tier = job.tier ?? tierForScore(job.score);
  // Kept visible, marked blocked. Deleting the row would hide a real posting
  // and silently shrink the discovered corpus.
  const blocked = job.eligibilityAssessment?.verdict === "INELIGIBLE";
  return (
    <article className={`job-row${blocked ? " job-row-blocked" : ""}`}>
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
        <div className={`score score-${tierTone(tier)}`}>
          <strong>{job.score}</strong><span>match</span>
        </div>
        <span className="confidence-label">{tier}</span>
        <span className="confidence-label">{job.confidence}% confidence</span>
        {/* Three independent readings, side by side. They are allowed to
            disagree — that disagreement is the useful part. */}
        <LevelFitBadge assessment={job.levelFit} compact />
        <EligibilityBadge assessment={job.eligibilityAssessment} compact />
        {job.eligibility === "excluded" && (
          <span className="eligibility-label">Hard requirement conflict</span>
        )}
        <span className="comp">{job.compensation}</span>
        <span className="source">{job.verification.officialAts} · {job.verification.importAge}</span>
      </div>
    </article>
  );
}
