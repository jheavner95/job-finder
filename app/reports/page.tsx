import { PageHeader } from "@/app/components/PageHeader";
import { getReportSummary } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const summary = await getReportSummary();
  return (
    <div className="page">
      <PageHeader
        title="Reports"
        subtitle="Local summaries based only on activity Job Finder has actually processed."
      />
      {summary.total === 0 ? (
        <div className="empty-state">
          <strong>Reports will appear after Job Finder has processed real activity.</strong>
          <p>Add a source or import an opportunity to begin building your private history.</p>
        </div>
      ) : (
        <article className="report-hero">
          <div>
            <p className="eyebrow">Current activity</p>
            <h2>Your opportunity summary</h2>
            <p>This summary uses only opportunities stored in your private workspace.</p>
          </div>
          <div className="report-score"><strong>{summary.strong}</strong><span>strong matches</span><small>of {summary.total} opportunities</small></div>
        </article>
      )}
    </div>
  );
}
