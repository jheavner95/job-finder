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
            {job.location}<i>·</i>
            {/* The work mode is already here; marking it in place says whether
                it suits the candidate without adding a fourth badge to a row
                that already carries a score, a tier, level fit and eligibility. */}
            <span className={job.workMode?.compatibility === "INCOMPATIBLE" ? "work-mode-mismatch" : undefined}>
              {job.workMode?.compatibility === "INCOMPATIBLE" ? "⚠ " : ""}{job.remoteStatus}
            </span>
            <i>·</i>{job.employmentType}
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
        <div className={`score score-${job.evidenceCoverage.sufficient ? tierTone(tier) : "unmeasured"}`}>
          <strong>{job.score}</strong><span>match</span>
        </div>
        {/* When most of the model went unmeasured, the tier is a claim the
            evidence does not support. Say what is actually true instead:
            we did not measure enough of this posting to place it. */}
        {job.evidenceCoverage.sufficient ? (
          <span className="confidence-label">{tier}</span>
        ) : (
          <span className="insufficient-evidence" title={`Only ${Math.round(job.evidenceCoverage.coverage * 100)}% of the scoring model could be measured from this posting.`}>
            Insufficient evidence
          </span>
        )}
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
