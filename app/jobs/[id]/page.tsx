import Link from "next/link";
import { notFound } from "next/navigation";
import { DecisionForm } from "@/app/components/DecisionForm";
import { StatusPill } from "@/app/components/JobRow";
import { getJob } from "@/lib/queries";
import type { IntelligenceGuidanceItem } from "@/lib/candidate-intelligence/types";
import { PostingContent } from "@/app/components/PostingContent";

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
  searchParams: Promise<{ import?: string; inspect?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const importState = query.import;
  const canInspect = process.env.NODE_ENV === "development" || process.env.JOB_FINDER_DEVELOPER_MODE === "true";
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
      <section className="provenance-card" aria-labelledby="source-verification-heading">
        <div className="provenance-heading">
          <div>
            <p className="eyebrow">Trust & traceability</p>
            <h2 id="source-verification-heading">Source &amp; Verification</h2>
          </div>
          <span className={`verification-badge verification-${job.verification.tone}`}>
            {job.verification.tone === "verified" ? "✓ " : ""}{job.verification.label}
          </span>
        </div>
        <dl className="provenance-grid">
          <div><dt>Provider</dt><dd>{job.source}</dd></div>
          <div><dt>Company</dt><dd>{job.company}</dd></div>
          <div><dt>Official ATS</dt><dd>{job.verification.officialAts}</dd></div>
          <div><dt>Discovery method</dt><dd>{job.provenance.discoveryMethod}</dd></div>
          <div><dt>Imported at</dt><dd>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(job.verification.importedAt))}</dd></div>
          <div><dt>Last verified</dt><dd>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(job.verification.lastVerifiedAt))}</dd></div>
          <div><dt>Duplicate imports</dt><dd>{job.provenance.duplicateImports}</dd></div>
          <div><dt>Current availability</dt><dd>{job.provenance.availability}</dd></div>
          <div className="provenance-link"><dt>Original posting URL</dt><dd><Link href={job.sourceUrl} target="_blank" rel="noreferrer">{job.sourceUrl}</Link></dd></div>
          <div className="provenance-link"><dt>Canonical URL</dt><dd><Link href={job.provenance.canonicalUrl} target="_blank" rel="noreferrer">{job.provenance.canonicalUrl}</Link></dd></div>
        </dl>
      </section>
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
            <p className="eyebrow">Source record</p>
            <h2>Original Posting</h2>
            <dl className="posting-facts">
              <div><dt>Original title</dt><dd>{job.originalPosting.title}</dd></div>
              <div><dt>Original company</dt><dd>{job.originalPosting.company}</dd></div>
              <div><dt>Original location</dt><dd>{job.originalPosting.location}</dd></div>
              <div><dt>Employment type</dt><dd>{job.originalPosting.employmentType}</dd></div>
              <div><dt>Salary</dt><dd>{job.originalPosting.compensation}</dd></div>
              <div><dt>Remote status</dt><dd>{job.originalPosting.remoteStatus}</dd></div>
            </dl>
            <PostingContent content={job.originalPosting.description} />
            <p className="source-caption">Formatting normalized from the official source. Unsafe HTML and tracking content are removed.</p>
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
                  <div key={item.id}><span /><p><strong>{item.summary}</strong><small>{item.source} · {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</small>
                    {item.changes.map((change) => <em key={`${item.id}-${change.field}`}>{change.field}: {change.before} → {change.after}</em>)}
                  </p></div>
                ))}
              </div>
            ) : <p>No activity has been recorded.</p>}
          </section>
          {canInspect && (
            <section>
              <p className="eyebrow">Developer tools</p>
              <h2>Developer inspection</h2>
              {query.inspect === "1" ? (
                <>
                  <p><Link href={`/jobs/${job.id}`}>Hide developer inspection</Link></p>
                  <details open><summary>Raw provider payload</summary><pre>{JSON.stringify({ retained: false, reason: "Raw provider payloads are not persisted. Preserved posting content is available in the normalized record." }, null, 2)}</pre></details>
                  <details><summary>Normalized record</summary><pre>{JSON.stringify(job.originalPosting, null, 2)}</pre></details>
                  <details><summary>Scoring inputs</summary><pre>{JSON.stringify(job.categoryResults, null, 2)}</pre></details>
                  <details><summary>Evidence matches</summary><pre>{JSON.stringify(job.evidence, null, 2)}</pre></details>
                  <details><summary>Opportunity Intelligence</summary><pre>{JSON.stringify(job.intelligence, null, 2)}</pre></details>
                </>
              ) : <Link href={`/jobs/${job.id}?inspect=1`}>Inspect record</Link>}
            </section>
          )}
        </div>
        <DecisionForm jobId={job.id} currentStatus={job.status} />
      </div>
    </div>
  );
}
