import Link from "next/link";

import { PageHeader } from "@/app/components/PageHeader";
import { prisma } from "@/lib/db";
import {
  deserializeOpportunityIntelligence,
  ensureOpportunityIntelligence,
} from "@/lib/candidate-intelligence/service";

export const dynamic = "force-dynamic";

function elapsed(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export default async function DailyBriefingPage() {
  // This dynamic server page intentionally anchors its briefing window to request time.
  // eslint-disable-next-line react-hooks/purity
  const since = new Date(Date.now() - 24 * 60 * 60 * 1_000);
  await ensureOpportunityIntelligence(prisma);
  const [newJobs, crawls, connectors, reviewCount, attentionJobs] = await Promise.all([
    prisma.job.findMany({
      where: { firstSeenAt: { gte: since }, isSynthetic: false },
      include: {
        company: true,
        source: true,
        evaluations: { orderBy: { evaluatedAt: "desc" }, take: 1 },
        intelligence: true,
      },
      orderBy: { firstSeenAt: "desc" },
    }),
    prisma.connectorCrawl.findMany({
      where: { startedAt: { gte: since } },
      include: { connector: true },
      orderBy: { startedAt: "desc" },
    }),
    prisma.companyConnector.findMany({
      orderBy: [{ health: "asc" }, { company: "asc" }],
    }),
    prisma.job.count({
      where: { status: "NEW", isSynthetic: false },
    }),
    prisma.job.findMany({
      where: { status: "NEW", isSynthetic: false },
      include: {
        company: true,
        evaluations: { orderBy: { evaluatedAt: "desc" }, take: 1 },
        intelligence: true,
      },
    }),
  ]);
  const ranked = [...newJobs].sort(
    (a, b) => (b.evaluations[0]?.score ?? 0) - (a.evaluations[0]?.score ?? 0),
  );
  const failures = crawls.filter(
    (crawl) => crawl.failures > 0 || ["Failed", "Blocked"].includes(crawl.status),
  );
  const duplicates = crawls.reduce((total, crawl) => total + crawl.duplicates, 0);
  const companies = [...new Set(newJobs.map((job) => job.company.name))];
  const healthy = connectors.filter((connector) => connector.enabled && connector.health === "Healthy").length;
  const warning = connectors.filter((connector) => connector.enabled && connector.health !== "Healthy").length;
  const disabled = connectors.filter((connector) => !connector.enabled).length;
  const attention = attentionJobs.sort(
    (a, b) => (b.evaluations[0]?.score ?? 0) - (a.evaluations[0]?.score ?? 0),
  )[0];
  const attentionIntelligence = attention?.intelligence
    ? deserializeOpportunityIntelligence(attention.intelligence)
    : null;

  return (
    <div className="page daily-briefing-page">
      <PageHeader
        title="Daily briefing"
        subtitle="What changed across scheduled and manual discovery in the last 24 hours."
      />

      {attention && (
        <section className="daily-priority">
          <div>
            <p className="eyebrow">Today&apos;s highest-value opportunity</p>
            <h2>{attention.title}</h2>
            <strong>{attention.company.name}</strong>
            <p>{attentionIntelligence?.topReason ?? "Open the opportunity to review its certified match analysis."}</p>
          </div>
          <dl>
            <div><dt>Preparation</dt><dd>{attentionIntelligence?.preparationChecklist.length ?? 0} steps</dd></div>
            <div><dt>Portfolio</dt><dd>{attentionIntelligence?.portfolioRecommendations.length ? "Needs project confirmation" : "Not ready"}</dd></div>
            <div><dt>Resume</dt><dd>{attentionIntelligence?.resumeRecommendations.length ? "Guidance ready" : "Not ready"}</dd></div>
          </dl>
          <Link href={`/jobs/${attention.id}`}>Prepare this opportunity →</Link>
        </section>
      )}

      <section className="briefing-summary-line" aria-label="Daily discovery summary">
        <div><strong>{newJobs.length}</strong><span>new opportunities</span></div>
        <div><strong>{duplicates}</strong><span>duplicates prevented</span></div>
        <div><strong>{failures.length}</strong><span>provider failures</span></div>
        <div><strong>{reviewCount}</strong><span>requiring review</span></div>
      </section>

      <div className="daily-briefing-grid">
        <section className="briefing-panel briefing-panel-wide">
          <div className="panel-heading">
            <div><p className="eyebrow">New opportunities</p><h2>Since yesterday</h2></div>
            <Link href="/review">Open review queue →</Link>
          </div>
          {newJobs.length ? (
            <ul className="briefing-job-list">
              {newJobs.map((job) => (
                <li key={job.id}>
                  <div>
                    <strong>{job.title}</strong>
                    <span>{job.company.name} · {job.location ?? "Location unavailable"}</span>
                  </div>
                  <b>{job.evaluations[0]?.score ?? 0}</b>
                  <Link href={`/jobs/${job.id}`}>Review →</Link>
                </li>
              ))}
            </ul>
          ) : <p className="panel-empty">No new opportunities were imported in the last 24 hours.</p>}
        </section>

        <section className="briefing-panel">
          <div className="panel-heading"><div><p className="eyebrow">Highest scoring</p><h2>Best new matches</h2></div></div>
          {ranked.length ? (
            <ol className="ranked-list">
              {ranked.slice(0, 5).map((job) => (
                <li key={job.id}>
                  <span><strong>{job.title}</strong><small>{job.company.name}</small></span>
                  <b>{job.evaluations[0]?.score ?? 0}</b>
                </li>
              ))}
            </ol>
          ) : <p className="panel-empty">No new scored opportunities.</p>}
        </section>

        <section className="briefing-panel">
          <div className="panel-heading"><div><p className="eyebrow">Source status</p><h2>Current status</h2></div></div>
          <dl className="health-summary">
            <div><dt>Healthy</dt><dd>{healthy}</dd></div>
            <div><dt>Needs attention</dt><dd>{warning}</dd></div>
            <div><dt>Disabled</dt><dd>{disabled}</dd></div>
          </dl>
          <Link className="panel-link" href="/sources">Manage sources →</Link>
        </section>

        <section className="briefing-panel">
          <div className="panel-heading"><div><p className="eyebrow">Recently imported</p><h2>Companies</h2></div></div>
          {companies.length ? (
            <ul className="company-list">{companies.map((company) => <li key={company}>{company}</li>)}</ul>
          ) : <p className="panel-empty">No companies added new opportunities.</p>}
        </section>

        <section className="briefing-panel briefing-panel-wide">
          <div className="panel-heading"><div><p className="eyebrow">Failure isolation</p><h2>Providers that failed</h2></div></div>
          {failures.length ? (
            <ul className="failure-list">
              {failures.map((crawl) => (
                <li key={crawl.id}>
                  <span className="connector-health health-warning">{crawl.connector.atsType}</span>
                  <div><strong>{crawl.connector.company}</strong><small>{crawl.lastError ?? "Unknown source issue"} · {elapsed(crawl.startedAt)}</small></div>
                </li>
              ))}
            </ul>
          ) : <p className="panel-empty">No provider failures in the last 24 hours.</p>}
        </section>
      </div>
    </div>
  );
}
