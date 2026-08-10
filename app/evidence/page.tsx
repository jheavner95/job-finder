import { PageHeader } from "@/app/components/PageHeader";
import { SubmitButton } from "@/app/components/SubmitButton";
import { completeCandidateEvidence } from "@/lib/candidate-intelligence/evidence-completion";
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
  const activePortfolio = profile.portfolio.filter((project) => !project.archivedAt);
  const archivedPortfolio = profile.portfolio.filter((project) => project.archivedAt);
  const grouped = Object.groupBy(profile.evidence, (item) => item.category);

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

      {/*
        * Two metric grids removed here.
        *
        * A coverage row read "Strengths 80% · Industries 80% · Domains 100% ·
        * Leadership 0% · Portfolio support 0%", and a five-cell confidence
        * distribution read "12 verified · 12 confirmed · 8 partial · 0 unknown
        * · 0 unsupported" — two permanently empty cells, and two labels for the
        * same twelve records. UX-6 removed exactly this kind of scoring readout
        * from Your Profile; leaving it one click away made the removal
        * cosmetic. What survives is the sentence a person would actually ask
        * for, and the claims themselves below it.
        */}
      <p className="evidence-summary">
        {profile.resumeEvidence.length
          ? `${profile.resumeEvidence.length} employment ${profile.resumeEvidence.length === 1 ? "record" : "records"} and ${activePortfolio.length} ${activePortfolio.length === 1 ? "project" : "projects"} support ${profile.evidence.length} ${profile.evidence.length === 1 ? "claim" : "claims"}.`
          : "No résumé has been imported yet, so nothing here is backed by a source document."}
      </p>

      {[
        ["skill", "Strengths"],
        ["industry", "Industries"],
        ["domain", "Domains"],
        ["product", "Product types"],
        ["experience", "Experience"],
      ].map(([category, label]) => (
        <section className="evidence-section" key={category}>
          {/* The eyebrow repeated the storage key ("skill") above the word it
              already spells out ("Strengths"), and the helper sentence said
              the same thing on all five sections. */}
          <div className="evidence-heading"><div><h2>{label}</h2></div></div>
          <div className="capability-grid">
            {(grouped[category] ?? []).map((item) => {
              const resumeProof = item.resumeLinks.map(
                (link) => `${link.resumeEvidence.employer}: ${link.resumeEvidence.title}`,
              );
              const projectProof = item.projectLinks
                .filter((link) => !link.project.archivedAt)
                .map((link) => link.project.name);
              return (
                <article className="capability-card" key={item.id}>
                  <header><h3>{item.label}</h3><span className={`quality quality-${item.evidenceQuality.toLowerCase()}`}>{item.evidenceQuality}</span></header>
                  <p>{item.sourceExcerpt}</p>
                  {/* Absent proof is omitted rather than announced. Every card
                      used to print "Portfolio proof: None", so the page listed
                      the same absence twenty times. */}
                  <dl>
                    {resumeProof.length > 0 && (
                      <div><dt>Résumé</dt><dd>{resumeProof.join(", ")}</dd></div>
                    )}
                    {projectProof.length > 0 && (
                      <div><dt>Project</dt><dd>{projectProof.join(", ")}</dd></div>
                    )}
                  </dl>
                  {resumeProof.length === 0 && projectProof.length === 0 && (
                    <small>Stated in your profile, not yet shown in a role or project.</small>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <section className="evidence-section">
        <div className="evidence-heading"><div><h2>Projects</h2></div><p>What each project can currently back up, and what it is missing.</p></div>
        <div className="portfolio-evidence-list">
          {activePortfolio.map((project) => {
            /*
             * Six percentages per project — documentation, visuals, outcomes,
             * interview, confidence and an overall "% ready" — put 36 numbers
             * on this page, none of which said what to do about them. The
             * fields behind those numbers are the answer, so the empty ones
             * are named instead.
             */
            const missing = ([
              ["the problem", project.problem],
              ["what you did", project.solution],
              ["the outcome", project.businessOutcome ?? project.designOutcome],
              ["your role", project.role],
              ["research", project.researchPerformed],
            ] as const).filter(([, field]) => !String(field ?? "").trim()).map(([label]) => label);
            return (
            <article key={project.id}>
              <header><div><h3>{project.name}</h3><span>{project.evidenceQuality} evidence</span></div></header>
              <p className="project-missing">
                {missing.length
                  ? `Still needs ${missing.join(", ")}.`
                  : "Documented well enough to talk through in an interview."}
              </p>
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
            );
          })}
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
                  <SubmitButton className="text-button" pendingLabel="Restoring…" ariaLabel={`Restore ${project.name}`}>Restore project</SubmitButton>
                </form>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="evidence-section">
        <div className="evidence-heading"><div><p className="eyebrow">Resume evidence</p><h2>Verified employment records</h2></div></div>
        {profile.resumeEvidence.length ? (
          <div className="resume-evidence-list">{profile.resumeEvidence.map((record) => <article key={record.id}><h3>{record.title}</h3><strong>{record.employer}</strong><p>{strings(record.responsibilities).join("; ") || "No responsibilities supplied."}</p><small>{record.evidenceQuality}</small></article>)}</div>
        ) : <div className="briefing-empty"><strong>Resume not supplied.</strong><p>No employer, title, dates, responsibilities, or supported profile links have been imported.</p></div>}
      </section>
    </div>
  );
}
