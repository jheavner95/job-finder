import { PageHeader } from "@/app/components/PageHeader";
import { WorkspaceLayout } from "@/app/components/PageLayout";
import {
  calculateCareerPerformance,
  type CpiGroup,
  type CpiMetric,
} from "@/lib/career-performance";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const sections = [
  "Overview",
  "Applications",
  "Interviews",
  "Offers",
  "Documents",
  "Providers",
  "Industries",
  "Titles",
  "Trends",
];

function metricValue(metric: CpiMetric) {
  if (!metric.sufficient || metric.value === null) return "Not enough historical data yet.";
  if (metric.unit === "percent") return `${metric.value}%`;
  if (metric.unit === "days") return `${metric.value} days`;
  return metric.value.toLocaleString("en-US");
}

function PerformanceTable({
  groups,
  threshold,
  includeResponse = false,
  includeScore = false,
}: {
  groups: CpiGroup[];
  threshold: number;
  includeResponse?: boolean;
  includeScore?: boolean;
}) {
  if (!groups.length) {
    return <div className="insight-empty"><strong>No factual records are available for this category.</strong><p>This insight becomes available after enough completed applications have been collected.</p></div>;
  }
  return (
    <div className="performance-table-wrap">
      <table className="performance-table">
        <thead><tr><th>Group</th><th>Applications</th>{includeResponse && <th>Responses</th>}<th>Interviews</th><th>Offers</th><th>Interview rate</th><th>Offer rate</th>{includeResponse && <th>Avg. response</th>}{includeScore && <th>Avg. match</th>}</tr></thead>
        <tbody>{groups.map((group) => (
          <tr key={group.label}>
            <td><strong>{group.label}</strong>{!group.sufficient && <small>More data required · minimum {threshold}</small>}</td>
            <td>{group.applications}</td>{includeResponse && <td>{group.responses}</td>}<td>{group.interviews}</td><td>{group.offers}</td>
            <td>{group.interviewRate === null ? "—" : `${group.interviewRate}%`}</td>
            <td>{group.offerRate === null ? "—" : `${group.offerRate}%`}</td>
            {includeResponse && <td>{group.averageResponseDays === null ? "—" : `${group.averageResponseDays} days`}</td>}
            {includeScore && <td>{group.averageMatchScore === null ? "—" : group.averageMatchScore}</td>}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export default async function InsightsPage() {
  const [applications, settings] = await Promise.all([
    prisma.application.findMany({
      include: {
        job: { include: { evaluations: { orderBy: { evaluatedAt: "desc" }, take: 1 } } },
        timeline: { orderBy: { eventAt: "asc" } },
        interviews: true,
        documents: true,
        followUps: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.careerPerformanceSettings.upsert({
      where: { id: "primary" },
      update: {},
      create: { id: "primary", minSampleSize: 5 },
    }),
  ]);
  const analytics = calculateCareerPerformance(
    applications.map((application) => ({
      id: application.id,
      status: application.status,
      outcome: application.outcome,
      appliedAt: application.appliedAt,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
      sourceProvider: application.sourceProvider,
      industry: application.industry,
      role: application.role,
      matchScore: application.job.evaluations[0]?.score ?? null,
      timeline: application.timeline,
      interviews: application.interviews,
      documents: application.documents,
      followUps: application.followUps,
    })),
    settings.minSampleSize,
  );
  const lastUpdated = applications[0]?.updatedAt ?? settings.updatedAt;
  const offerRate = analytics.overview.find((item) => item.label === "Offer rate")!;

  return (
    <WorkspaceLayout className="insights-page">
      <PageHeader
        title="Insights"
        subtitle="Factual patterns from your recorded application history. No predictions or generated recommendations."
      />
      <nav className="insights-section-nav" aria-label="Insights sections">
        {sections.map((section) => <a key={section} href={`#${section.toLowerCase()}`}>{section}</a>)}
      </nav>

      <section id="overview" className="insights-section" aria-labelledby="insights-overview-title">
        <div className="insights-heading">
          <div><p className="eyebrow">Overview</p><h2 id="insights-overview-title">Career performance at a glance</h2><p>Calculated only from activity recorded in Job Finder.</p></div>
          <small>Last updated {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(lastUpdated)}</small>
        </div>
        <div className="insight-metric-grid">
          {analytics.overview.map((metric) => (
            <article className={metric.sufficient ? "" : "metric-insufficient"} key={metric.label}>
              <span>{metric.label}</span><strong>{metricValue(metric)}</strong>
              <small>{metric.sufficient ? `${metric.sampleSize} factual records` : `Requires ${settings.minSampleSize} eligible records · currently ${metric.sampleSize}`}</small>
              <small className="metric-trend">{metric.trend === null ? "Trend available after two sufficient 90-day periods." : `${metric.trend > 0 ? "+" : ""}${metric.trend}${metric.unit === "percent" ? " percentage points" : metric.unit === "days" ? " days" : ""} vs. prior 90 days`}</small>
              <details><summary>How this is calculated</summary><p>{metric.definition}</p></details>
            </article>
          ))}
        </div>
      </section>

      <section id="applications" className="insights-section" aria-labelledby="application-insights-title">
        <div className="insights-heading"><div><p className="eyebrow">Applications</p><h2 id="application-insights-title">Application outcomes</h2></div></div>
        <dl className="factual-count-grid">
          {Object.entries({
            "Submitted": analytics.applicationMetrics.submitted,
            "Completed": analytics.applicationMetrics.completed,
            "Withdrawn": analytics.applicationMetrics.withdrawn,
            "Rejected": analytics.applicationMetrics.rejected,
            "Accepted": analytics.applicationMetrics.accepted,
            "No response": analytics.applicationMetrics.ghosted,
          }).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <div className="insight-support-row">
          <article><span>Average active application age</span><strong>{analytics.applicationMetrics.averageAgeDays === null ? "No active applications" : `${analytics.applicationMetrics.averageAgeDays} days`}</strong></article>
          <article><span>Average days until closure</span><strong>{analytics.applicationMetrics.averageClosureDays === null ? "Not enough historical data yet." : `${analytics.applicationMetrics.averageClosureDays} days`}</strong></article>
        </div>
      </section>

      <section id="interviews" className="insights-section" aria-labelledby="interview-insights-title">
        <div className="insights-heading"><div><p className="eyebrow">Interviews</p><h2 id="interview-insights-title">Recorded interview activity</h2></div></div>
        <div className="interview-type-grid">{analytics.interviewMetrics.types.map((item) => <article key={item.label}><strong>{item.count}</strong><span>{item.label}</span></article>)}</div>
        <div className="insight-support-row">
          <article><span>Interview-to-offer rate</span><strong>{analytics.interviewMetrics.interviewToOfferRate === null ? "Not enough historical data yet." : `${analytics.interviewMetrics.interviewToOfferRate}%`}</strong></article>
          <article><span>Average interviews per submitted application</span><strong>{analytics.interviewMetrics.averagePerApplication === null ? "Not enough historical data yet." : analytics.interviewMetrics.averagePerApplication}</strong></article>
        </div>
      </section>

      <section id="offers" className="insights-section" aria-labelledby="offer-insights-title">
        <div className="insights-heading"><div><p className="eyebrow">Offers</p><h2 id="offer-insights-title">Offer outcomes</h2><p>Offers are counted only when an Offer event or accepted outcome was recorded.</p></div></div>
        <div className="offer-insight-card"><span>Offer rate</span><strong>{metricValue(offerRate)}</strong><small>{offerRate.sufficient ? `${offerRate.sampleSize} submitted applications analyzed` : "This insight becomes available after enough submitted applications have been collected."}</small></div>
      </section>

      <section id="documents" className="insights-section" aria-labelledby="document-insights-title">
        <div className="insights-heading"><div><p className="eyebrow">Documents</p><h2 id="document-insights-title">Submitted document versions</h2><p>Versions below the configured threshold are never ranked.</p></div></div>
        <PerformanceTable groups={analytics.documents} threshold={analytics.threshold} />
      </section>

      <section id="providers" className="insights-section" aria-labelledby="provider-insights-title">
        <div className="insights-heading"><div><p className="eyebrow">Providers</p><h2 id="provider-insights-title">Personal outcomes by source provider</h2><p>These are your historical outcomes, not a judgment of provider quality.</p></div></div>
        <PerformanceTable groups={analytics.providers} threshold={analytics.threshold} includeResponse />
      </section>

      <section id="industries" className="insights-section" aria-labelledby="industry-insights-title">
        <div className="insights-heading"><div><p className="eyebrow">Industries</p><h2 id="industry-insights-title">Outcomes by recorded industry</h2><p>Applications without a factual industry label are excluded.</p></div></div>
        <PerformanceTable groups={analytics.industries} threshold={analytics.threshold} />
      </section>

      <section id="titles" className="insights-section" aria-labelledby="title-insights-title">
        <div className="insights-heading"><div><p className="eyebrow">Titles</p><h2 id="title-insights-title">Outcomes by role title</h2></div></div>
        <PerformanceTable groups={analytics.titles} threshold={analytics.threshold} includeResponse includeScore />
      </section>

      <section id="trends" className="insights-section" aria-labelledby="trend-insights-title">
        <div className="insights-heading"><div><p className="eyebrow">Trends</p><h2 id="trend-insights-title">Six-month activity</h2><p>Historical counts only. No future outcomes are predicted.</p></div></div>
        {analytics.trends.sufficient ? (
          <div className="trend-chart" role="img" aria-label="Applications, responses, interviews, and offers over the last six months">
            {analytics.trends.months.map((month) => {
              const max = Math.max(1, ...analytics.trends.months.map((item) => item.applications));
              return (
                <article key={month.label}>
                  <div className="trend-bars">
                    <span style={{ height: `${Math.max(3, (month.applications / max) * 100)}%` }} title={`${month.applications} applications`} />
                    <span style={{ height: `${Math.max(3, (month.responses / max) * 100)}%` }} title={`${month.responses} responses`} />
                    <span style={{ height: `${Math.max(3, (month.interviews / max) * 100)}%` }} title={`${month.interviews} interviews`} />
                    <span style={{ height: `${Math.max(3, (month.offers / max) * 100)}%` }} title={`${month.offers} offers`} />
                  </div>
                  <strong>{month.label}</strong><small>{month.applications} applications</small>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="insight-empty"><strong>Not enough historical data yet.</strong><p>This visualization becomes available after at least {settings.minSampleSize} submitted applications have been collected.</p></div>
        )}
      </section>

      <details className="insight-methodology">
        <summary>Calculation and data-governance notes</summary>
        <div>
          <p>All metrics are recomputed from local Application, Timeline, Interview, Document, Follow-up, and Opportunity records.</p>
          <p>The configured minimum sample size is {settings.minSampleSize}. Rates and comparisons below that threshold are suppressed.</p>
          <p>No hidden weighting, probabilistic scoring, language-model inference, recommendation, or prediction is used.</p>
        </div>
      </details>
    </WorkspaceLayout>
  );
}
