import Link from "next/link";

import { LocalGreeting } from "@/app/components/LocalGreeting";
import { evaluateContextLibrary } from "@/lib/context-readiness";
import {
  getNextContextActions,
} from "@/lib/context-presentation";
import { presentDashboard } from "@/lib/dashboard-presentation";
import { getDashboardSummary } from "@/lib/queries";

export const dynamic = "force-dynamic";

function scoreTone(score: number) {
  if (score >= 80) return "strong";
  if (score >= 50) return "possible";
  return "low";
}

export default async function DashboardPage() {
  const [summary, readiness] = await Promise.all([
    getDashboardSummary(),
    evaluateContextLibrary(),
  ]);
  const briefing = presentDashboard(summary.jobs);
  const contextActions = getNextContextActions(readiness.documents);
  const nextContextAction = contextActions[0];
  const readinessLabel = readiness.calibrated
    ? "Complete"
    : readiness.percentage >= 40
      ? "In progress"
      : "Needs review";
  const visibleDecisionCounts = [
    { label: "Awaiting review", value: briefing.awaitingReview },
    { label: "Saved opportunities", value: briefing.saved },
    { label: "Recently closed", value: briefing.recentlyClosed },
  ].filter((item) => item.value > 0);
  const syntheticCount = summary.jobs.filter((job) => job.isSynthetic).length;
  const importedCount = summary.jobs.length - syntheticCount;

  return (
    <div className="page briefing-page">
      <header className="briefing-header">
        <div>
          <p className="eyebrow">Private workspace</p>
          <h1><LocalGreeting /></h1>
          <p className="briefing-lead">{briefing.briefing.title}</p>
          <p className="briefing-detail">{briefing.briefing.detail}</p>
        </div>
        {briefing.primaryAction && (
          <Link className="primary-button button-link briefing-primary" href={briefing.primaryAction.href}>
            {briefing.primaryAction.label}<span aria-hidden="true">→</span>
          </Link>
        )}
      </header>

      <section className="attention-section" aria-labelledby="attention-title">
        <div className="briefing-section-heading">
          <div>
            <p className="eyebrow">Today&apos;s attention</p>
            <h2 id="attention-title">
              {briefing.attention.length
                ? "Start with these opportunities"
                : "Nothing needs immediate attention"}
            </h2>
          </div>
          {briefing.totalJobs > 0 && (
            <Link className="text-button briefing-link" href="/review">
              Review queue <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>

        {briefing.attention.length ? (
          <div className="attention-list">
            {briefing.attention.map((job) => (
              <article className="attention-card" key={job.id}>
                <div className="attention-score">
                  <div className={`score score-${scoreTone(job.score)}`}>
                    <strong>{job.score}</strong><span>match</span>
                  </div>
                  <span>{job.confidence}% match confidence</span>
                </div>
                <div className="attention-copy">
                  <p className="attention-status">{job.status}</p>
                  <h3>{job.title}</h3>
                  <strong className="attention-company">{job.company}</strong>
                  <p className="attention-meta">{job.remoteStatus} · {job.location}</p>
                  <p className="attention-summary">{job.matchReason}</p>
                  {job.concerns[0] && <p className="attention-concern"><span>Primary concern</span>{job.concerns[0]}</p>}
                </div>
                <div className="attention-action">
                  <span>{job.compensation}</span>
                  <Link href={`/jobs/${job.id}`} aria-label={`Review ${job.title} at ${job.company}`}>
                    Review opportunity <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="briefing-empty">
            <strong>
              {briefing.totalJobs === 0
                ? "No opportunities have been added."
                : "No high-priority opportunities are waiting."}
            </strong>
            <p>
              {briefing.totalJobs === 0
                ? "This workspace will remain quiet until you add records intentionally."
                : "Reviewed roles remain available in the Review Queue."}
            </p>
          </div>
        )}
      </section>

      <div className="briefing-secondary-grid">
        <section className="decision-summary" aria-labelledby="decisions-title">
          <div className="briefing-section-heading compact">
            <div><p className="eyebrow">Your judgment</p><h2 id="decisions-title">Decision summary</h2></div>
            <Link className="text-button briefing-link" href="/review">Open queue <span aria-hidden="true">→</span></Link>
          </div>
          {visibleDecisionCounts.length ? (
            <dl>
              {visibleDecisionCounts.map((item) => (
                <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>
              ))}
            </dl>
          ) : (
            <p className="compact-empty">No decisions are waiting right now.</p>
          )}
        </section>

        <section className="dashboard-intelligence" aria-labelledby="dashboard-intelligence-title">
          <div className="intelligence-summary">
            <p className="eyebrow">Match Insights</p>
            <strong>{readiness.percentage}%</strong>
            <span>{readinessLabel}</span>
          </div>
          <div>
            <h2 id="dashboard-intelligence-title">
              {nextContextAction
                ? `${nextContextAction.name} is the best next step for stronger recommendations.`
                : "Your Job Finder profile is ready."}
            </h2>
            <p>
              {nextContextAction
                ? nextContextAction.missingInformation
                : "Your profile has verified information across every career area."}
            </p>
            <Link href={nextContextAction?.href ?? "/context"} aria-label={nextContextAction ? `Continue profile setup with ${nextContextAction.name}` : "Review Job Finder"}>
              {nextContextAction ? "Continue profile setup" : "Review Job Finder"} <span aria-hidden="true">→</span>
            </Link>
            <small>Career evidence remains maintained in your private local workspace.</small>
          </div>
        </section>
      </div>

      <section className="application-activity" aria-labelledby="activity-title">
        <div className="briefing-section-heading compact">
          <div><p className="eyebrow">Application activity</p><h2 id="activity-title">Your active pipeline</h2></div>
        </div>
        {briefing.activeApplications.length ? (
          <ul>
            {briefing.activeApplications.map((job) => (
              <li key={job.id}>
                <span className="application-state">{job.status}</span>
                <div><strong>{job.title}</strong><span>{job.company}</span></div>
                <Link href={`/jobs/${job.id}`} aria-label={`View application activity for ${job.title} at ${job.company}`}>View role <span aria-hidden="true">→</span></Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="activity-empty"><strong>No active applications yet.</strong><p>Roles you mark as Applied will appear here.</p></div>
        )}
      </section>

      <p className="synthetic-note briefing-disclosure">
        {importedCount > 0
          ? `${importedCount} manually imported ${importedCount === 1 ? "opportunity is" : "opportunities are"} stored alongside ${syntheticCount} sample ${syntheticCount === 1 ? "opportunity" : "opportunities"}.`
          : "Current opportunities are sample records."} No outside job search has run.
      </p>
    </div>
  );
}
