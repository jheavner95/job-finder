import Link from "next/link";
import { notFound } from "next/navigation";

import { DecisionForm } from "@/app/components/DecisionForm";
import { ReadingLayout } from "@/app/components/PageLayout";
import { StatusPill } from "@/app/components/JobRow";
import type { IntelligenceGuidanceItem } from "@/lib/candidate-intelligence/types";
import { getJob } from "@/lib/queries";
import { prisma } from "@/lib/db";
import type { JobDetailModel } from "@/lib/view-models";
import { OpportunityActions } from "./OpportunityActions";
import { SearchablePosting } from "./SearchablePosting";

export const dynamic = "force-dynamic";

function matchLabel(score: number) {
  if (score >= 85) return "Excellent Match";
  if (score >= 65) return "Good Match";
  return "Possible Match";
}

function guidanceText(item: IntelligenceGuidanceItem) {
  return item.explanation || item.title;
}

function strongestReasons(job: JobDetailModel) {
  const intelligence = job.intelligence;
  const candidates = [
    ...(intelligence?.strengths ?? []).map(guidanceText),
    ...(intelligence?.matchedSkills ?? []).map(guidanceText),
    ...(intelligence?.matchedDomains ?? []).map(guidanceText),
    ...job.categoryResults.filter((item) => item.contribution > 0).map((item) => item.reason),
  ];
  return [...new Set(candidates)].slice(0, 3);
}

function mainConcerns(job: JobDetailModel) {
  const candidates = [
    ...job.concerns,
    ...(job.intelligence?.concerns ?? []).map(guidanceText),
    ...(job.intelligence?.missingEvidence ?? []).map(guidanceText),
  ];
  return [...new Set(candidates)].slice(0, 2);
}

const readinessCategories = [
  { label: "Resume", terms: /resume|career narrative/i },
  { label: "Portfolio", terms: /portfolio|case stud/i },
  { label: "Enterprise Experience", terms: /enterprise|complex workflow/i },
  { label: "Leadership", terms: /leadership|lead |mentor|stakeholder/i },
  { label: "Domain Experience", terms: /industry|domain|healthcare|finance|government/i },
  { label: "Design Systems", terms: /design system/i },
  { label: "Accessibility", terms: /accessib|wcag/i },
  { label: "AI Experience", terms: /\bai\b|artificial intelligence|machine learning/i },
] as const;

function readiness(job: JobDetailModel) {
  const supported = [
    ...(job.intelligence?.strengths ?? []),
    ...(job.intelligence?.matchedSkills ?? []),
    ...(job.intelligence?.matchedIndustries ?? []),
    ...(job.intelligence?.matchedDomains ?? []),
    ...(job.intelligence?.leadershipSignals ?? []),
  ];
  const attention = [
    ...(job.intelligence?.missingEvidence ?? []),
    ...(job.intelligence?.concerns ?? []),
  ];
  const text = (item: IntelligenceGuidanceItem) =>
    `${item.title} ${item.explanation} ${item.evidence.map((evidence) => `${evidence.label} ${evidence.excerpt}`).join(" ")}`;
  return readinessCategories.map((category) => {
    const hasSupport = supported.some((item) => category.terms.test(text(item)));
    const needsAttention = attention.some((item) => category.terms.test(text(item)));
    return {
      label: category.label,
      status: hasSupport ? "Strong" : needsAttention ? "Needs Attention" : "Good",
    };
  });
}

function recommendedActions(job: JobDetailModel) {
  const items = [
    ...(job.intelligence?.resumeRecommendations ?? []),
    ...(job.intelligence?.portfolioRecommendations ?? []),
    ...(job.intelligence?.interviewTopics ?? []),
    ...(job.intelligence?.preparationChecklist ?? []),
  ];
  return [...new Map(items.map((item) => [item.title, item])).values()].slice(0, 4);
}

function GuidanceList({
  items,
  empty,
}: {
  items: IntelligenceGuidanceItem[];
  empty: string;
}) {
  if (!items.length) return <p>{empty}</p>;
  return (
    <div className="guidance-list">
      {items.map((item) => (
        <article className={`guidance-card guidance-${item.status}`} key={`${item.title}-${item.explanation}`}>
          <div><span>{item.status}</span><h3>{item.title}</h3><p>{item.explanation}</p></div>
          <details><summary>Supporting evidence</summary>{item.evidence.length
            ? <ul>{item.evidence.map((evidence) => <li key={`${item.title}-${evidence.id}`}><strong>{evidence.label}</strong><span>{evidence.excerpt}</span><small>{evidence.source} · {evidence.confidence}</small></li>)}</ul>
            : <p>No supporting evidence is recorded.</p>}</details>
        </article>
      ))}
    </div>
  );
}

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ import?: string; inspect?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const [job, application] = await Promise.all([
    getJob(id),
    prisma.application.findUnique({ where: { jobId: id }, select: { id: true, status: true } }),
  ]);
  if (!job) notFound();

  const canInspect = process.env.NODE_ENV === "development"
    || process.env.JOB_FINDER_DEVELOPER_MODE === "true";
  const reasons = strongestReasons(job);
  const concerns = mainConcerns(job);
  const readinessItems = readiness(job);
  const actions = recommendedActions(job);
  const evidence = job.evidence.slice(0, 5);
  const requirements = job.requirements.slice(0, 5);

  return (
    <ReadingLayout className="detail-page opportunity-review-page">
      <Link className="back-button" href="/review">← Back to review queue</Link>
      {(query.import === "created" || query.import === "duplicate") && (
        <div className="import-success" role="status">
          <strong>{query.import === "created" ? "Opportunity imported and evaluated." : "This opportunity was already in your library."}</strong>
        </div>
      )}

      <header className="opportunity-hero">
        <div className="opportunity-identity">
          <p>{job.company}</p>
          <h1>{job.title}</h1>
          <div className="opportunity-meta">
            <span>{job.location}</span><span>{job.remoteStatus}</span><span>{job.employmentType}</span>
            <StatusPill status={job.status} />
          </div>
          <small>Discovered {job.verification.importAge} · {job.verification.label}</small>
        </div>
        <div className="opportunity-score">
          <strong>{job.score}</strong><span>Match</span><small>{matchLabel(job.score)}</small>
        </div>
        <OpportunityActions jobId={job.id} sourceUrl={job.sourceUrl} application={application} />
      </header>

      <div className="opportunity-coaching">
        <section className="match-summary" aria-labelledby="match-summary-title">
          <div>
            <p className="eyebrow">Should you apply?</p>
            <h2 id="match-summary-title">{matchLabel(job.score)}</h2>
            <p className="coaching-lead">{job.intelligence?.topReason ?? job.summary}</p>
          </div>
          <div className="match-summary-columns">
            <div><h3>Why this is worth your time</h3>{reasons.length
              ? <ul>{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              : <p>No strong match reason is available yet.</p>}</div>
            <div className="summary-concerns"><h3>What to consider</h3>{concerns.length
              ? <ul>{concerns.map((concern) => <li key={concern}>{concern}</li>)}</ul>
              : <p>No material concern was detected.</p>}</div>
          </div>
        </section>

        <section className="readiness-section" aria-labelledby="readiness-title">
          <div className="section-intro"><p className="eyebrow">Application readiness</p><h2 id="readiness-title">Where you are ready—and where to strengthen</h2></div>
          <div className="readiness-grid">{readinessItems.map((item) => (
            <article key={item.label} className={`readiness-${item.status.toLowerCase().replaceAll(" ", "-")}`}>
              <span /><strong>{item.label}</strong><small>{item.status}</small>
            </article>
          ))}</div>
          <Link className="secondary-button button-link" href="/evidence">Improve Readiness</Link>
        </section>

        <div className="coaching-split">
          <section className="why-match-section" aria-labelledby="why-match-title">
            <p className="eyebrow">Why this matches</p><h2 id="why-match-title">Your strongest supporting evidence</h2>
            {evidence.length ? <ol>{evidence.map((item) => (
              <li key={item.id}><strong>{item.label}</strong><p>{item.excerpt}</p><small>{item.contextFile}</small></li>
            ))}</ol> : <p>No verified evidence is attached yet.</p>}
            <a className="text-button" href="#candidate-intelligence">View All Evidence →</a>
          </section>

          <section className="recommended-actions" aria-labelledby="recommended-actions-title">
            <p className="eyebrow">Recommended actions</p><h2 id="recommended-actions-title">Strengthen this application</h2>
            {actions.length ? <ol>{actions.map((item) => <li key={item.title}><strong>{item.title}</strong><p>{item.explanation}</p></li>)}</ol> : <p>No additional preparation is recommended.</p>}
            <div className="prep-time"><span>Estimated preparation</span><strong>{Math.max(10, actions.length * 5)} minutes</strong></div>
          </section>
        </div>

        <section className="job-summary-section" aria-labelledby="job-summary-title">
          <div className="section-intro"><p className="eyebrow">Job summary</p><h2 id="job-summary-title">What this role is really asking for</h2></div>
          <div className="job-summary-grid">
            <div><h3>Role overview</h3><p>{job.summary}</p></div>
            <div><h3>Qualifications</h3>{requirements.length ? <ul>{requirements.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Not clearly specified.</p>}</div>
            <div><h3>Interview focus</h3><p>{job.intelligence?.interviewTopics[0]?.explanation ?? "Expect discussion of the core responsibilities and your relevant experience."}</p></div>
            <div><h3>Potential concerns</h3><p>{concerns[0] ?? "No material concern was detected."}</p></div>
          </div>
          <a className="text-button" href="#full-job-description">View Full Job Description →</a>
        </section>

        <section className="company-snapshot" aria-labelledby="company-snapshot-title">
          <div><p className="eyebrow">Company snapshot</p><h2 id="company-snapshot-title">{job.company}</h2><p>{job.companyNotes}</p></div>
          <dl>
            <div><dt>Industry</dt><dd>Not recorded</dd></div>
            <div><dt>Company size</dt><dd>Not recorded</dd></div>
            <div><dt>Remote policy</dt><dd>{job.remoteStatus}</dd></div>
            <div><dt>Compensation</dt><dd>{job.compensation}</dd></div>
          </dl>
          <Link href={job.sourceUrl} target="_blank" rel="noreferrer">View careers page →</Link>
        </section>

        <details className="opportunity-disclosure" id="full-job-description">
          <summary><span>Full Job Description</span><small>Search and read the complete official posting</small></summary>
          <div><SearchablePosting content={job.originalPosting.description} /></div>
        </details>

        <details className="opportunity-disclosure" id="candidate-intelligence">
          <summary><span>Candidate Intelligence</span><small>Detailed strengths, gaps, evidence, and recommendations</small></summary>
          <div className="disclosure-content">
            <h3>Strengths</h3><GuidanceList items={job.intelligence?.strengths ?? []} empty="No structured strengths are available." />
            <h3>Matched skills and domains</h3><GuidanceList items={[
              ...(job.intelligence?.matchedSkills ?? []),
              ...(job.intelligence?.matchedIndustries ?? []),
              ...(job.intelligence?.matchedDomains ?? []),
              ...(job.intelligence?.leadershipSignals ?? []),
            ]} empty="No detailed evidence matches are available." />
            <h3>Gaps and preparation</h3><GuidanceList items={[
              ...(job.intelligence?.missingEvidence ?? []),
              ...(job.intelligence?.concerns ?? []),
              ...(job.intelligence?.preparationChecklist ?? []),
            ]} empty="No preparation gaps are available." />
          </div>
        </details>

        <details className="opportunity-disclosure">
          <summary><span>AI Analysis</span><small>Scoring explanation and generated analysis</small></summary>
          <div className="disclosure-content">
            <p>{job.intelligence?.confidenceExplanation ?? job.summary}</p>
            <div className="analysis-list">{job.categoryResults.map((item) => <article key={item.category}><strong>{item.label}</strong><p>{item.reason}</p></article>)}</div>
          </div>
        </details>

        <details className="opportunity-disclosure">
          <summary><span>Activity</span><small>{job.activity.length} recorded events</small></summary>
          <div className="disclosure-content">{job.activity.length ? <div className="timeline">{job.activity.map((item) => (
            <div key={item.id}><span /><p><strong>{item.summary}</strong><small>{item.source} · {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</small></p></div>
          ))}</div> : <p>No activity has been recorded.</p>}</div>
        </details>

        <details className="opportunity-disclosure" id="decision-notes">
          <summary><span>Notes and Status</span><small>Record your private decision</small></summary>
          <div className="disclosure-content"><DecisionForm jobId={job.id} currentStatus={job.status} /></div>
        </details>

        {canInspect && (
          <details className="opportunity-disclosure developer-disclosure">
            <summary><span>Developer Information</span><small>Raw extraction, normalized fields, metadata, and diagnostics</small></summary>
            <div className="disclosure-content">
              <dl className="developer-facts">
                <div><dt>Provider</dt><dd>{job.source}</dd></div><div><dt>Discovery</dt><dd>{job.provenance.discoveryMethod}</dd></div>
                <div><dt>Availability</dt><dd>{job.provenance.availability}</dd></div><div><dt>Duplicate imports</dt><dd>{job.provenance.duplicateImports}</dd></div>
                <div><dt>Canonical URL</dt><dd>{job.provenance.canonicalUrl}</dd></div><div><dt>Last verified</dt><dd>{job.verification.lastVerifiedAt}</dd></div>
              </dl>
              {query.inspect === "1" ? <>
                <pre>{JSON.stringify({ originalPosting: job.originalPosting, categoryResults: job.categoryResults, evidence: job.evidence, intelligence: job.intelligence }, null, 2)}</pre>
                <Link href={`/jobs/${job.id}`}>Hide JSON</Link>
              </> : <Link href={`/jobs/${job.id}?inspect=1`}>Inspect normalized JSON</Link>}
            </div>
          </details>
        )}
      </div>
    </ReadingLayout>
  );
}
