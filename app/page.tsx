import Link from "next/link";
import { WorkspaceLayout } from "@/app/components/PageLayout";

import { LocalGreeting } from "@/app/components/LocalGreeting";
import { evaluateContextLibrary } from "@/lib/context-readiness";
import {
  getNextContextActions,
} from "@/lib/context-presentation";
import { presentDashboard } from "@/lib/dashboard-presentation";
import { getDashboardSummary } from "@/lib/queries";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function scoreTone(score: number) {
  if (score >= 80) return "strong";
  if (score >= 50) return "possible";
  return "low";
}

export default async function DashboardPage() {
  const [summary, readiness, lastScan, nextSchedule, applications] = await Promise.all([
    getDashboardSummary(),
    evaluateContextLibrary(),
    prisma.discoveryBatch.findFirst({
      where: { status: { not: "Running" } },
      orderBy: { startedAt: "desc" },
    }),
    prisma.connectorSchedule.findFirst({
      where: { nextRunAt: { not: null }, connector: { enabled: true } },
      orderBy: { nextRunAt: "asc" },
    }),
    prisma.application.findMany({
      include: {
        followUps: { where: { completedAt: null }, orderBy: { dueAt: "asc" } },
        interviews: { orderBy: { scheduledAt: "asc" } },
      },
      orderBy: { updatedAt: "desc" },
    }),
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
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const endOfWeek = new Date(now);
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  const applicationsInProgress = applications.filter((item) =>
    !["Accepted", "Declined", "Rejected", "Withdrawn", "Closed"].includes(item.status),
  );
  const interviewsThisWeek = applications.reduce(
    (sum, item) => sum + item.interviews.filter((interview) =>
      interview.scheduledAt >= now && interview.scheduledAt <= endOfWeek,
    ).length,
    0,
  );
  const followUpsDueToday = applications.reduce(
    (sum, item) => sum + item.followUps.filter((followUp) => followUp.dueAt <= endOfToday).length,
    0,
  );
  return (
    <WorkspaceLayout className="briefing-page">
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

      <section className="dashboard-pipeline" aria-labelledby="dashboard-pipeline-title">
        <div><p className="eyebrow">Application intelligence</p><h2 id="dashboard-pipeline-title">Your career pipeline</h2></div>
        <dl>
          <div><dt>New opportunities</dt><dd>{briefing.awaitingReview}</dd></div>
          <div><dt>Applications in progress</dt><dd>{applicationsInProgress.length}</dd></div>
          <div><dt>Interviews this week</dt><dd>{interviewsThisWeek}</dd></div>
          <div><dt>Follow-ups due today</dt><dd>{followUpsDueToday}</dd></div>
          <div><dt>Offers</dt><dd>{applications.filter((item) => item.status === "Offer").length}</dd></div>
        </dl>
        <Link className="secondary-button button-link" href="/applications">Open Applications</Link>
      </section>

      <section className="dashboard-scan-card" aria-labelledby="dashboard-scan-title">
        <div>
          <p className="eyebrow">Discovery status</p>
          <h2 id="dashboard-scan-title">{lastScan ? "Job discovery is up to date" : "Job Finder has not scanned for opportunities yet."}</h2>
        </div>
        <dl>
          <div><dt>Last scan</dt><dd>{lastScan?.completedAt ? new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(lastScan.completedAt) : "Never"}</dd></div>
          <div><dt>New matches</dt><dd>{lastScan ? lastScan.jobsImported + lastScan.duplicates : "—"}</dd></div>
          <div><dt>Next scan</dt><dd>{nextSchedule?.nextRunAt ? new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(nextSchedule.nextRunAt) : "Manual only"}</dd></div>
        </dl>
        <Link className="primary-button button-link" href="/scan">{lastScan ? "Scan Jobs" : "Run Your First Scan"}</Link>
      </section>

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
                ? "No opportunities yet."
                : "No high-priority opportunities are waiting."}
            </strong>
            <p>
              {briefing.totalJobs === 0
                ? "Set up a job source, import an opportunity, or complete your profile to get started."
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
        {applicationsInProgress.length ? (
          <ul>
            {applicationsInProgress.slice(0, 6).map((application) => (
              <li key={application.id}>
                <span className="application-state">{application.status}</span>
                <div><strong>{application.role}</strong><span>{application.company}</span></div>
                <Link href={`/applications/${application.id}`} aria-label={`View application activity for ${application.role} at ${application.company}`}>View application <span aria-hidden="true">→</span></Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="activity-empty"><strong>No active applications yet.</strong><p>Begin from an opportunity when you are ready to prepare an application.</p></div>
        )}
      </section>

      {briefing.totalJobs === 0 && (
        <div className="empty-state-actions">
          <Link className="primary-button button-link" href="/sources">Set up job sources</Link>
          <Link className="secondary-button button-link" href="/import">Import a job</Link>
          <Link className="text-button" href="/getting-started">Complete your profile →</Link>
        </div>
      )}
    </WorkspaceLayout>
  );
}
