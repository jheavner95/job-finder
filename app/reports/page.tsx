import Link from "next/link";
import { PageHeader } from "@/app/components/PageHeader";
import { getReportSummary } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const summary = await getReportSummary();
  return (
    <div className="page">
      <PageHeader
        title="Weekly intelligence foundation"
        subtitle="A provisional database summary—not a scheduled search or generated report."
        action={<button className="secondary-button" disabled>Generation not enabled</button>}
      />
      <article className="report-hero">
        <div>
          <p className="eyebrow">Current seeded dataset</p>
          <h2>Your strongest sample matches are in complex platform roles.</h2>
          <p>This preview summarizes the sample opportunities in your private workspace. No scheduled or outside job search has run.</p>
        </div>
        <div className="report-score"><strong>{summary.strong}</strong><span>strong matches</span><small>of {summary.total} database records</small></div>
      </article>
      <div className="report-grid">
        <section><span className="report-number">01</span><h2>What is in SQLite</h2><p>The seeded dataset supports end-to-end review and persistence testing.</p><ul><li>{summary.strong} strong matches</li><li>{summary.possible} possible matches</li><li>{summary.rejected} poor matches</li></ul></section>
        <section><span className="report-number">02</span><h2>Patterns to watch</h2><p>Strategic scope and hands-on systems work are positive signals. On-site requirements and consumer-growth focus create larger penalties.</p></section>
        <section><span className="report-number">03</span><h2>Context gaps</h2><p>Compensation targets and project-level portfolio evidence remain incomplete, reducing confidence.</p><Link className="text-button" href="/context">Review context gaps →</Link></section>
        <section><span className="report-number">04</span><h2>Suggested next move</h2><p>Review the two strongest sample opportunities and record your decisions.</p><Link className="primary-button button-link" href="/review?status=Strong+Match">Open strong matches</Link></section>
      </div>
      <div className="future-note"><span>i</span><p><strong>Foundational view only.</strong> Scheduled discovery, source ingestion, and automated weekly generation remain intentionally out of scope.</p></div>
    </div>
  );
}
