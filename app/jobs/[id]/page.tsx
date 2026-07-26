import Link from "next/link";
import { notFound } from "next/navigation";
import { DecisionForm } from "@/app/components/DecisionForm";
import { StatusPill } from "@/app/components/JobRow";
import { getJob } from "@/lib/queries";
import type { IntelligenceGuidanceItem } from "@/lib/candidate-intelligence/types";

export const dynamic = "force-dynamic";

function scoreTone(score: number) {
  if (score >= 80) return "strong";
  if (score >= 50) return "possible";
  return "low";
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
          <div>
            <span>{item.status}</span>
            <h3>{item.title}</h3>
            <p>{item.explanation}</p>
          </div>
          <details>
            <summary>Why this recommendation</summary>
            {item.evidence.length ? (
              <ul>
                {item.evidence.map((evidence) => (
                  <li key={`${item.title}-${evidence.id}`}>
                    <strong>{evidence.label}</strong>
                    <span>{evidence.excerpt}</span>
                    <small>{evidence.source} · {evidence.confidence}</small>
                  </li>
                ))}
              </ul>
            ) : <p>No supporting evidence is recorded.</p>}
          </details>
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
  searchParams: Promise<{ import?: string }>;
}) {
  const { id } = await params;
  const importState = (await searchParams).import;
  const job = await getJob(id);
  if (!job) notFound();

  return (
    <div className="page detail-page">
      <Link className="back-button" href="/review">← Back to review queue</Link>
      {(importState === "created" || importState === "duplicate") && (
        <div className="import-success" role="status">
          <strong>{importState === "created" ? "Opportunity imported and evaluated." : "Duplicate matched and existing opportunity updated."}</strong>
          <span>{importState === "created" ? "It is now available in your Review Queue." : "The original record was preserved and a new import event and evaluation were added."}</span>
        </div>
      )}
      <header className="detail-hero">
        <span className="company-avatar large">{job.companyInitials}</span>
        <div className="detail-title">
          <div>
            <p>{job.company}</p>
            <h1>{job.title}</h1>
            <span>{job.location} · {job.remoteStatus} · {job.employmentType}</span>
          </div>
          <StatusPill status={job.status} />
        </div>
        <div className={`score hero-score score-${scoreTone(job.score)}`}>
          <strong>{job.score}</strong><span>overall match</span>
        </div>
      </header>
      <div className="detail-meta">
        <div><small>Compensation</small><strong>{job.compensation}</strong></div>
        <div><small>Posted</small><strong>{job.posted}</strong></div>
        <div><small>Source</small><strong>{job.source}</strong></div>
        <div><small>Match confidence</small><strong>{job.confidence}%</strong></div>
        <div><small>Eligibility</small><strong>{job.eligibility === "excluded" ? "Hard requirement conflict" : "No hard conflict found"}</strong></div>
        <div><small>Record type</small><strong>Imported opportunity</strong></div>
      </div>
      <div className="detail-layout">
        <div className="detail-content">
          <section>
            <p className="eyebrow">Match analysis</p>
            <h2>Why this role scored {job.score}</h2>
            <p className="lead">{job.summary}</p>
            {job.categoryResults.length ? (
              <div className="score-breakdown">
                {job.categoryResults.map((item) => (
                  <div key={item.category}>
                    <span className="category-label">
                      <strong>{item.label}</strong>
                      <small>
                        <span className={`evidence-state evidence-${item.evidenceState ?? "positive"}`}>
                          {(item.evidenceState ?? "positive").replace("_", " ")}
                        </span>
                        {item.contribution > 0 ? "+" : ""}{item.contribution} pts
                      </small>
                    </span>
                    <span className="bar" aria-label={`${item.label}: ${Math.round((item.rating ?? 0) * 100)} percent`}>
                      <i style={{ width: `${(item.rating ?? 0) * 100}%` }} className={item.category === "riskPenalty" ? "penalty" : ""} />
                    </span>
                    <p>{item.reason}</p>
                  </div>
                ))}
              </div>
            ) : <p>No match details are available.</p>}
          </section>
          {job.intelligence && (
            <>
              <section className="intelligence-intro">
                <p className="eyebrow">Match Insights</p>
                <h2>Why this matches</h2>
                <p className="lead">{job.intelligence.topReason}</p>
                <p>{job.intelligence.confidenceExplanation.replace("Candidate Intelligence", "Match Insights")}</p>
                <GuidanceList items={job.intelligence.strengths} empty="No structured strength is confirmed for this opportunity yet." />
              </section>
              <section>
                <p className="eyebrow">Supporting evidence</p>
                <h2>What you can substantiate</h2>
                <GuidanceList
                  items={[
                    ...job.intelligence.matchedSkills,
                    ...job.intelligence.matchedIndustries,
                    ...job.intelligence.matchedDomains,
                    ...job.intelligence.leadershipSignals,
                  ]}
                  empty="No structured evidence match is available."
                />
              </section>
              <section>
                <p className="eyebrow">Missing evidence</p>
                <h2>What to clarify before applying</h2>
                <GuidanceList items={job.intelligence.missingEvidence} empty="No explicit evidence gap was detected." />
              </section>
              <section>
                <p className="eyebrow">Recommended portfolio</p>
                <h2>Case studies to evaluate</h2>
                <GuidanceList items={job.intelligence.portfolioRecommendations} empty="No truthful portfolio context can be recommended yet." />
              </section>
              <section>
                <p className="eyebrow">Resume suggestions</p>
                <h2>What to emphasize truthfully</h2>
                <GuidanceList items={job.intelligence.resumeRecommendations} empty="No resume emphasis is supported yet." />
              </section>
              <section>
                <p className="eyebrow">Interview preparation</p>
                <h2>Stories and gaps to prepare</h2>
                <GuidanceList items={job.intelligence.interviewTopics} empty="No interview topics are available." />
              </section>
              <section>
                <p className="eyebrow">Preparation checklist</p>
                <h2>Before you apply</h2>
                <GuidanceList items={job.intelligence.preparationChecklist} empty="No preparation steps are available." />
              </section>
            </>
          )}
          <section>
            <p className="eyebrow">Original job description</p>
            <h2>Preserved source text</h2>
            <p>{job.description}</p>
            <p className="source-caption">Original listing · Imported opportunity</p>
          </section>
          <section>
            <p className="eyebrow">Role requirements</p>
            <h2>What the role asks for</h2>
            {job.requirements.length ? <ul className="check-list">{job.requirements.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No role requirements are recorded.</p>}
          </section>
          <section>
            <p className="eyebrow">Career evidence</p>
            <h2>Relevant verified context</h2>
            {job.evidence.length ? job.evidence.map((item) => (
              <div className="evidence-card" key={item.id}>
                <span>EP</span>
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.excerpt}</p>
                  <small>{item.contextFile} · {item.relevance}</small>
                </div>
              </div>
            )) : <p>No career evidence is attached to this evaluation.</p>}
          </section>
          <section>
            <p className="eyebrow">Concerns & penalties</p>
            <h2>What deserves scrutiny</h2>
            {job.concerns.length ? <ul className="concern-list">{job.concerns.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No concerns are recorded.</p>}
          </section>
          <section>
            <p className="eyebrow">Company information</p>
            <h2>{job.company}</h2>
            <p>{job.companyNotes}</p>
          </section>
          <section>
            <p className="eyebrow">Activity history</p>
            <h2>What happened</h2>
            {job.activity.length ? (
              <div className="timeline">
                {job.activity.map((item) => (
                  <div key={item.id}><span /><p><strong>{item.summary}</strong><small>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</small></p></div>
                ))}
              </div>
            ) : <p>No activity has been recorded.</p>}
          </section>
        </div>
        <DecisionForm jobId={job.id} currentStatus={job.status} />
      </div>
    </div>
  );
}
