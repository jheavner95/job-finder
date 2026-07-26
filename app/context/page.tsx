import Link from "next/link";

import { PageHeader } from "@/app/components/PageHeader";
import { evaluateContextLibrary } from "@/lib/context-readiness";
import {
  getNextContextActions,
  presentContextDocument,
} from "@/lib/context-presentation";
import { prisma } from "@/lib/db";
import { getOnboardingState } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export default async function ContextPage() {
  const readiness = await evaluateContextLibrary();
  const onboarding = await getOnboardingState(prisma);
  const documents = readiness.documents.map(presentContextDocument);
  const actions = getNextContextActions(readiness.documents);
  const nextAction = actions[0];
  const readinessLabel = readiness.calibrated
    ? "Complete"
    : readiness.percentage >= 40
      ? "In progress"
      : "Needs review";
  const confidenceLabel = readiness.percentage >= 75
    ? "High"
    : readiness.percentage >= 40
      ? "Moderate"
      : "Building";
  const completionTime = readiness.counts.missing
    ? "10–15 minutes"
    : readiness.counts.partial
      ? "5–10 minutes"
      : "Up to date";

  return (
    <div className="page career-page">
      <PageHeader
        title="Job Finder"
        subtitle="Verified career evidence makes job matching more accurate, explainable, and useful."
        action={<span className="privacy-badge">● Local files · private workspace</span>}
      />

      {onboarding?.onboarding?.completedAt ? (
        <section className="completed-intelligence-hero" aria-labelledby="overview-title">
          <div className="completed-intelligence-copy">
            <p className="eyebrow" id="overview-title">Job Finder status</p>
            <h2>{readiness.calibrated ? "Your career evidence is ready to maintain." : "Your workspace is active, with evidence still worth strengthening."}</h2>
            <p>Status summarizes the verified information available for explainable opportunity guidance.</p>
            <dl className="intelligence-status-list">
              <div><dt>Overall status</dt><dd>{readiness.calibrated ? "Complete" : readiness.counts.missing ? "Needs review" : "In progress"}</dd></div>
              <div><dt>Confidence</dt><dd>{confidenceLabel}</dd></div>
              <div><dt>Estimated time</dt><dd>{completionTime}</dd></div>
            </dl>
          </div>
          <div className="completed-intelligence-score">
            <span>Profile completeness</span>
            <strong>{readiness.percentage}%</strong>
            <small>{readinessLabel}</small>
          </div>
          <Link className="overview-action" href={nextAction?.href ?? "/evidence"} aria-label={nextAction ? `${nextAction.actionLabel} for ${nextAction.name}` : "Review career evidence"}>
            <span>Next recommended action</span>
            <strong>{nextAction?.actionLabel ?? "Review Career Evidence"}</strong>
            <i aria-hidden="true">→</i>
          </Link>
        </section>
      ) : (
      <section className="intelligence-overview" aria-labelledby="overview-title">
        <div className="readiness-score">
          <p className="eyebrow" id="overview-title">Profile status</p>
          <strong>{readiness.percentage}%</strong>
          <span>{readinessLabel}</span>
        </div>
        <div className="readiness-explanation">
          <h2>The system understands several parts of your background.</h2>
          <p>Important evidence is still missing. Completing the highest-impact areas will improve matching confidence.</p>
          <p className="readiness-note">Profile completeness reflects the information available—not your professional quality or a job match score.</p>
        </div>
        <dl className="readiness-counts">
          <div><dt>Missing areas</dt><dd>{readiness.counts.missing}</dd></div>
          <div><dt>Partial areas</dt><dd>{readiness.counts.partial}</dd></div>
        </dl>
        {onboarding?.shouldShowPrimary ? (
          <Link className="overview-action" href="/getting-started" aria-label={onboarding.resumeImports.length ? "Continue onboarding" : "Import resume"}>
            <span>Next best action</span>
            <strong>{onboarding.resumeImports.length ? "Continue Onboarding" : "Import Resume"}</strong>
            <i aria-hidden="true">→</i>
          </Link>
        ) : nextAction ? (
          <Link className="overview-action" href={nextAction.href} aria-label={`Next best action: ${nextAction.actionLabel} for ${nextAction.name}`}>
            <span>Next best action</span><strong>{nextAction.actionLabel}</strong><i aria-hidden="true">→</i>
          </Link>
        ) : null}
      </section>
      )}

      <section className="career-section onboarding-maintenance">
        <div className="career-section-heading">
          <div><p className="eyebrow">Evidence maintenance</p><h2>Resume and onboarding</h2></div>
          <p>Replace your resume, review imports, or revisit any setup step.</p>
        </div>
        <Link className="secondary-button" href="/getting-started">
          {onboarding?.resumeImports.length ? "Manage resume and onboarding" : "Import Resume"}
        </Link>
      </section>

      <section className="career-section" aria-labelledby="actions-title">
        <div className="career-section-heading">
          <div>
            <p className="eyebrow">Prioritized for confidence</p>
            <h2 id="actions-title">Next best actions</h2>
          </div>
          <p>Start with the evidence that improves explainable matching most.</p>
        </div>
        {actions.length ? (
          <ol className="action-list">
            {actions.map((action, index) => (
              <li key={action.id}>
                <Link href={action.href} aria-label={`${action.actionLabel} for ${action.name}`}>
                  <span className="action-number">{String(index + 1).padStart(2, "0")}</span>
                  <div className="action-copy">
                    <span className={`readiness-pill readiness-${action.readiness}`}>{action.readinessLabel}</span>
                    <h3>{action.name}</h3>
                    <p>{action.purpose}</p>
                  </div>
                  <span className={`impact-label impact-${action.impact === "High impact" ? "high" : "medium"}`}>{action.impact}</span>
                  <strong className="action-label">{action.actionLabel}<span aria-hidden="true"> →</span></strong>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <div className="career-empty"><strong>Your Job Finder profile is complete.</strong><p>All career areas currently contain ready information.</p></div>
        )}
      </section>

      <section className="career-section" aria-labelledby="areas-title">
        <div className="career-section-heading">
          <div>
            <p className="eyebrow">Your verified context</p>
            <h2 id="areas-title">Knowledge areas</h2>
          </div>
          <p>Each area gives the matching system a different kind of career evidence.</p>
        </div>
        <div className="knowledge-grid">
          {documents.map((document, index) => (
            <article className="knowledge-card" key={document.id}>
              <div className="knowledge-topline">
                <span className="knowledge-number">{String(index + 1).padStart(2, "0")}</span>
                <span className={`readiness-pill readiness-${document.readiness}`}>{document.readinessLabel}</span>
              </div>
              <h3>{document.name}</h3>
              <p className="knowledge-purpose">{document.purpose}</p>
              <dl>
                <div><dt>Contribution</dt><dd>{document.impact}</dd></div>
                <div><dt>Still needed</dt><dd>{document.missingInformation}</dd></div>
              </dl>
              <Link href={document.href} aria-label={`${document.actionLabel} for ${document.name}`}>
                {document.actionLabel}<span aria-hidden="true"> →</span>
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="confidence-section" aria-labelledby="confidence-title">
        <div>
          <p className="eyebrow">Match confidence</p>
          <h2 id="confidence-title">Why match confidence is currently limited</h2>
          <p>These are gaps in your profile. They are not negative job signals, hard exclusions, or deductions from a match score.</p>
        </div>
        <ul>
          {documents.filter((document) => document.confidenceReason).map((document) => (
            <li key={document.id}><span aria-hidden="true">!</span>{document.confidenceReason}</li>
          ))}
        </ul>
        <div className="confidence-definitions">
          <p><strong>Match score</strong>How well a role aligns with known preferences and requirements.</p>
          <p><strong>Match confidence</strong>How complete the verified information behind that assessment is.</p>
          <p><strong>Hard exclusions</strong>Confirmed deal-breakers evaluated separately from scoring.</p>
        </div>
      </section>

      <section className="principles career-principles" aria-labelledby="principles-title">
        <p className="eyebrow">Context rules</p>
        <h2 id="principles-title">Persistent, factual, and always under your control.</h2>
        <div>
          <p><strong>Never invent experience</strong>Missing evidence lowers confidence. It is never replaced with fabricated detail.</p>
          <p><strong>Separate judgment</strong>Your decisions remain independent from automated evaluations.</p>
          <p><strong>Private by design</strong>Career context stays local and is never sent or published automatically.</p>
          <p><strong>Always explain</strong>Scores and recommendations must show the evidence behind them.</p>
        </div>
      </section>
    </div>
  );
}
