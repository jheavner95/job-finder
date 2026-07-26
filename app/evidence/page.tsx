import { PageHeader } from "@/app/components/PageHeader";
import { completeCandidateEvidence } from "@/lib/candidate-intelligence/evidence-completion";
import { EVIDENCE_QUALITY } from "@/lib/candidate-intelligence/readiness";
import { prisma } from "@/lib/db";

import { restoreArchivedProject } from "./actions";

export const dynamic = "force-dynamic";

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function value(item: string | null | undefined) {
  return item?.trim() || "Unknown";
}

export default async function EvidencePage() {
  const readinessExists = await prisma.candidateResumeReadiness.count();
  if (!readinessExists) await completeCandidateEvidence(prisma);
  const profile = await prisma.candidateProfile.findUniqueOrThrow({
    where: { id: "primary-candidate" },
    include: {
      evidence: {
        include: {
          projectLinks: { include: { project: true } },
          resumeLinks: { include: { resumeEvidence: true } },
        },
        orderBy: [{ category: "asc" }, { label: "asc" }],
      },
      portfolio: {
        include: { capabilityLinks: { include: { capability: true } } },
        orderBy: [{ portfolioReadiness: "desc" }, { name: "asc" }],
      },
      resumeEvidence: { orderBy: { startDate: "desc" } },
      resumeReadiness: true,
    },
  });
  const readiness = profile.resumeReadiness;
  const activePortfolio = profile.portfolio.filter((project) => !project.archivedAt);
  const archivedPortfolio = profile.portfolio.filter((project) => project.archivedAt);
  const grouped = Object.groupBy(profile.evidence, (item) => item.category);
  const distribution = readiness?.evidenceDistribution
    && typeof readiness.evidenceDistribution === "object"
    && !Array.isArray(readiness.evidenceDistribution)
    ? readiness.evidenceDistribution as Record<string, unknown>
    : {};

  return (
    <div className="page evidence-page">
      <PageHeader
        title="Career Evidence"
        subtitle="Browse structured career claims and answer one question: where is the proof?"
      />

      {!profile.evidence.length && !profile.resumeEvidence.length && !activePortfolio.length && (
        <div className="empty-state">
          <strong>No career evidence has been added.</strong>
          <p>Import and approve a resume, or add an optional portfolio project, to begin.</p>
        </div>
      )}

      <section className="evidence-readiness">
        <div><p className="eyebrow">Resume readiness</p><h2>Current coverage</h2><p>{profile.resumeEvidence.length ? `${profile.resumeEvidence.length} verified employment records imported.` : "No verified master resume has been supplied. Coverage remains zero rather than inferred."}</p></div>
        <dl>
          <div><dt>Strengths</dt><dd>{readiness?.capabilityCoverage ?? 0}%</dd></div>
          <div><dt>Industries</dt><dd>{readiness?.industryCoverage ?? 0}%</dd></div>
          <div><dt>Domains</dt><dd>{readiness?.domainCoverage ?? 0}%</dd></div>
          <div><dt>Leadership</dt><dd>{readiness?.leadershipCoverage ?? 0}%</dd></div>
          <div><dt>Portfolio support</dt><dd>{readiness?.portfolioSupport ?? 0}%</dd></div>
        </dl>
      </section>

      <section className="evidence-section">
        <div className="evidence-heading"><div><p className="eyebrow">Profile status</p><h2>Confidence distribution</h2></div><p>Stronger source records lead to clearer match recommendations.</p></div>
        <div className="quality-grid">
          {EVIDENCE_QUALITY.map((quality) => <div key={quality}><strong>{Number(distribution[quality] ?? 0)}</strong><span>{quality}</span></div>)}
        </div>
      </section>

      {[
        ["skill", "Strengths"],
        ["industry", "Industries"],
        ["domain", "Domains"],
        ["product", "Product types"],
        ["experience", "Experience"],
      ].map(([category, label]) => (
        <section className="evidence-section" key={category}>
          <div className="evidence-heading"><div><p className="eyebrow">{category}</p><h2>{label}</h2></div><p>Profile source, resume proof, and project proof are shown separately.</p></div>
          <div className="capability-grid">
            {(grouped[category] ?? []).map((item) => (
              <article className="capability-card" key={item.id}>
                <header><h3>{item.label}</h3><span className={`quality quality-${item.evidenceQuality.toLowerCase()}`}>{item.evidenceQuality}</span></header>
                <p>{item.sourceExcerpt}</p>
                <small>{item.sourceDocument}</small>
                <dl>
                  <div><dt>Resume proof</dt><dd>{item.resumeLinks.length ? item.resumeLinks.map((link) => `${link.resumeEvidence.employer}: ${link.resumeEvidence.title}`).join(", ") : "None"}</dd></div>
                  <div><dt>Portfolio proof</dt><dd>{item.projectLinks.some((link) => !link.project.archivedAt) ? item.projectLinks.filter((link) => !link.project.archivedAt).map((link) => link.project.name).join(", ") : "None"}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      ))}

      <section className="evidence-section">
        <div className="evidence-heading"><div><p className="eyebrow">Portfolio evidence</p><h2>Project readiness</h2></div><p>Unknown fields reduce readiness and are never filled through inference.</p></div>
        <div className="portfolio-evidence-list">
          {activePortfolio.map((project) => (
            <article key={project.id}>
              <header><div><h3>{project.name}</h3><span>{project.evidenceQuality} evidence</span></div><strong>{project.portfolioReadiness}% ready</strong></header>
              <div className="project-readiness">
                <span>Documentation <b>{project.documentationCompleteness}%</b></span>
                <span>Visuals <b>{project.visualEvidenceReadiness}%</b></span>
                <span>Outcomes <b>{project.outcomeEvidenceReadiness}%</b></span>
                <span>Interview <b>{project.interviewReadiness}%</b></span>
                <span>Confidence <b>{project.confidence}%</b></span>
              </div>
              <details>
                <summary>Where is the proof?</summary>
                <p>{project.sourceExcerpt}</p>
                <dl className="project-fields">
                  <div><dt>Employer</dt><dd>{value(project.employer)}</dd></div>
                  <div><dt>Timeframe</dt><dd>{value(project.timeframe)}</dd></div>
                  <div><dt>Role</dt><dd>{value(project.role)}</dd></div>
                  <div><dt>Responsibilities</dt><dd>{strings(project.responsibilities).join("; ") || "Unknown"}</dd></div>
                  <div><dt>Problem</dt><dd>{value(project.problem)}</dd></div>
                  <div><dt>Solution</dt><dd>{value(project.solution)}</dd></div>
                  <div><dt>Business outcome</dt><dd>{value(project.businessOutcome)}</dd></div>
                  <div><dt>Design outcome</dt><dd>{value(project.designOutcome)}</dd></div>
                  <div><dt>Research</dt><dd>{value(project.researchPerformed)}</dd></div>
                  <div><dt>Leadership</dt><dd>{value(project.leadershipDemonstrated)}</dd></div>
                  <div><dt>Industry</dt><dd>{value(project.industry)}</dd></div>
                  <div><dt>Product type</dt><dd>{value(project.productType)}</dd></div>
                  <div><dt>Platform</dt><dd>{value(project.platform)}</dd></div>
                  <div><dt>Enterprise scale</dt><dd>{value(project.enterpriseScale)}</dd></div>
                  <div><dt>Design systems</dt><dd>{value(project.designSystemUsage)}</dd></div>
                  <div><dt>Accessibility</dt><dd>{value(project.accessibilityWork)}</dd></div>
                  <div><dt>AI</dt><dd>{value(project.aiUsage)}</dd></div>
                  <div><dt>Artifacts</dt><dd>{strings(project.artifactsAvailable).join("; ") || "Unknown"}</dd></div>
                  <div><dt>Confidentiality</dt><dd>{value(project.confidentiality)}</dd></div>
                </dl>
              </details>
            </article>
          ))}
          {!activePortfolio.length && <div className="briefing-empty"><strong>No active portfolio projects.</strong><p>Add projects during onboarding or restore an archived project below.</p></div>}
        </div>
      </section>

      {archivedPortfolio.length > 0 && (
        <section className="evidence-section">
          <div className="evidence-heading"><div><p className="eyebrow">Recoverable projects</p><h2>Archived portfolio projects</h2></div><p>Archived projects do not affect readiness or recommendations.</p></div>
          <div className="archived-evidence-list">
            {archivedPortfolio.map((project) => (
              <article key={project.id}>
                <div><h3>{project.name}</h3><p>{project.evidenceQuality} evidence · {project.portfolioReadiness}% ready when archived</p></div>
                <form action={restoreArchivedProject}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <button type="submit">Restore project</button>
                </form>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="evidence-section">
        <div className="evidence-heading"><div><p className="eyebrow">Resume evidence</p><h2>Verified employment records</h2></div></div>
        {profile.resumeEvidence.length ? (
          <div className="resume-evidence-list">{profile.resumeEvidence.map((record) => <article key={record.id}><h3>{record.title}</h3><strong>{record.employer}</strong><p>{strings(record.responsibilities).join("; ") || "No responsibilities supplied."}</p><small>{record.evidenceQuality} · {record.sourceDocument}</small></article>)}</div>
        ) : <div className="briefing-empty"><strong>Resume not supplied.</strong><p>No employer, title, dates, responsibilities, or supported profile links have been imported.</p></div>}
      </section>
    </div>
  );
}
