import { PageHeader } from "@/app/components/PageHeader";
import { SubmitButton } from "@/app/components/SubmitButton";
import { prisma } from "@/lib/db";
import { mapError } from "@/lib/errors/app-error";
import { jobSourceRegistry } from "@/lib/job-sources/registry";
import { scheduleLabel } from "@/lib/scheduling/schedule";

import {
  addCompanyConnectorAction,
  runProviderDiscoveryAction,
  runScheduledDiscoveryAction,
  toggleConnectorAction,
} from "./actions";

export const dynamic = "force-dynamic";

function lastCrawl(value: Date | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function safeSourceError(value: string | null | undefined) {
  if (!value) return "—";
  const error = mapError(value, { route: "/sources" });
  return `${error.title} ${error.message}`;
}

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const connectors = await prisma.companyConnector.findMany({
    orderBy: { company: "asc" },
    include: {
      crawlRuns: {
        orderBy: { startedAt: "desc" },
        take: 5,
      },
      schedule: true,
    },
  });
  const batches = await prisma.discoveryBatch.findMany({
    orderBy: { startedAt: "desc" },
    take: 12,
  });
  const recentRuns = await prisma.connectorCrawl.findMany({
    include: { connector: true },
    orderBy: { startedAt: "desc" },
    take: 30,
  });
  const ran = params.companies !== undefined;
  const providers = jobSourceRegistry.list();
  const providerNames = new Map(
    providers.map((provider) => [provider.id, provider.name]),
  );

  return (
    <div className="page sources-page">
      <PageHeader
        title="Sources"
        subtitle="Private company sources that find matching jobs from public career pages."
      />

      {ran && (
        <div className="crawl-result" role="status">
          <strong>{params.scheduled ? "Scheduled" : "Manual"} discovery completed.</strong>
          <span>{params.companies} companies</span>
          <span>{params.found} matching jobs</span>
          <span>{params.imported} new imports</span>
          <span>{params.duplicates} duplicates</span>
          <span>{params.failures} failures</span>
        </div>
      )}
      {params.added && (
        <div className="crawl-result" role="status">
          <strong>Company source saved.</strong>
        </div>
      )}
      {params.error && (
        <div className="crawl-result crawl-error" role="alert">
          <strong>Check the company, URL, board token, and rate settings.</strong>
        </div>
      )}

      <section className="sources-toolbar" aria-labelledby="connector-status">
        <div>
          <p className="eyebrow">Company sources</p>
          <h2 id="connector-status">Source status</h2>
          <p>Each source is checked one at a time and follows the provider&apos;s published access rules.</p>
        </div>
        <div className="source-toolbar-actions">
          <form action={runScheduledDiscoveryAction}><SubmitButton pendingLabel="Running discovery…">Run due schedules</SubmitButton></form>
          <a className="secondary-button button-link" href="/searches">Manage searches</a>
        </div>
      </section>

      <div className="sources-table-wrap">
        <table className="sources-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Source</th>
              <th>Status</th>
              <th>Schedule</th>
              <th>Last check</th>
              <th>Jobs found</th>
              <th>New imports</th>
              <th>Duplicates</th>
              <th>Failures</th>
              <th>Last error</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {connectors.map((connector) => {
              const crawl = connector.crawlRuns[0];
              const recentFailures = connector.crawlRuns.filter((run) => run.failures > 0);
              const recentImports = connector.crawlRuns.reduce((total, run) => total + run.jobsImported, 0);
              return (
                <tr key={connector.id}>
                  <td><strong>{connector.company}</strong><small>{connector.connectorKey}</small></td>
                  <td>{providerNames.get(connector.atsType) ?? connector.atsType}</td>
                  <td><span className={`connector-health health-${connector.health.toLowerCase()}`}>{connector.enabled ? connector.health : "Disabled"}</span></td>
                  <td>{scheduleLabel(connector.schedule)}</td>
                  <td>{lastCrawl(crawl?.completedAt ?? connector.lastChecked)}</td>
                  <td>{crawl?.jobsDiscovered ?? "—"}</td>
                  <td>{crawl?.jobsImported ?? "—"}</td>
                  <td>{crawl?.duplicates ?? "—"}</td>
                  <td>{crawl?.failures ?? "—"}</td>
                  <td className="source-error">
                    {safeSourceError(crawl?.lastError)}
                    <small>{recentFailures.length} recent failed checks · {recentImports} recent imports</small>
                  </td>
                  <td className="source-actions">
                    <form action={runProviderDiscoveryAction}>
                      <input type="hidden" name="connectorId" value={connector.id} />
                      <SubmitButton className="source-run" pendingLabel="Running…" disabled={!connector.enabled} ariaLabel={`Run ${connector.company} now`}>Run now</SubmitButton>
                    </form>
                    <form action={toggleConnectorAction}>
                      <input type="hidden" name="connectorId" value={connector.id} />
                      <input type="hidden" name="enabled" value={connector.enabled ? "false" : "true"} />
                      <SubmitButton className="source-run" pendingLabel="Updating…" ariaLabel={`${connector.enabled ? "Disable" : "Enable"} ${connector.company}`}>{connector.enabled ? "Disable" : "Enable"}</SubmitButton>
                    </form>
                  </td>
                </tr>
              );
            })}
            {!connectors.length && (
              <tr><td colSpan={11} className="sources-empty">No job sources have been added.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="discovery-history" aria-labelledby="discovery-history-title">
        <div className="sources-toolbar">
          <div><p className="eyebrow">Search history</p><h2 id="discovery-history-title">Discovery history</h2><p>Every search run remains available locally.</p></div>
        </div>
        <div className="sources-table-wrap">
          <table className="sources-table">
            <thead><tr><th>Started</th><th>Trigger</th><th>Status</th><th>Sources</th><th>Found</th><th>Imports</th><th>Duplicates</th><th>Failures</th><th>Duration</th></tr></thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id}>
                  <td>{lastCrawl(batch.startedAt)}</td>
                  <td>{batch.trigger}</td>
                  <td>{batch.status}</td>
                  <td>{batch.connectorsRun}</td>
                  <td>{batch.jobsDiscovered}</td>
                  <td>{batch.jobsImported}</td>
                  <td>{batch.duplicates}</td>
                  <td>{batch.failures}</td>
                  <td>{batch.durationMs === null ? "—" : `${batch.durationMs} ms`}</td>
                </tr>
              ))}
              {!batches.length && <tr><td colSpan={9} className="sources-empty">No search runs recorded.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="sources-toolbar connector-run-heading">
          <div><p className="eyebrow">Source activity</p><h2>Recent runs</h2><p>Provider and company outcomes, including isolated failures.</p></div>
        </div>
        <div className="sources-table-wrap">
          <table className="sources-table">
            <thead><tr><th>Started</th><th>Completed</th><th>Provider</th><th>Company</th><th>Status</th><th>Discovered</th><th>Imports</th><th>Duplicates</th><th>Failures</th><th>Duration</th></tr></thead>
            <tbody>
              {recentRuns.map((run) => (
                <tr key={run.id}>
                  <td>{lastCrawl(run.startedAt)}</td>
                  <td>{run.completedAt ? lastCrawl(run.completedAt) : "Running"}</td>
                  <td>{providerNames.get(run.connector.atsType) ?? run.connector.atsType}</td>
                  <td>{run.connector.company}</td>
                  <td>{run.status}</td>
                  <td>{run.jobsDiscovered}</td>
                  <td>{run.jobsImported}</td>
                  <td>{run.duplicates}</td>
                  <td>{run.failures}</td>
                  <td>{run.durationMs === null ? "—" : `${run.durationMs} ms`}</td>
                </tr>
              ))}
              {!recentRuns.length && <tr><td colSpan={10} className="sources-empty">No source runs recorded.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="add-source" aria-labelledby="add-source-title">
        <div>
          <p className="eyebrow">Company registry</p>
          <h2 id="add-source-title">Add a company source</h2>
          <p>The source key is the company identifier used in its career-page URL.</p>
        </div>
        <form action={addCompanyConnectorAction}>
          <label>Company<input name="company" required maxLength={300} /></label>
          <label>Provider<select name="providerId" required>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
          <label>Career URL<input name="careerUrl" required type="url" placeholder="https://company-ats.example/jobs" /></label>
          <label>Source key<input name="connectorKey" required placeholder="company" /></label>
          <label>Request delay (ms)<input name="crawlDelay" type="number" min="0" max="60000" defaultValue="1000" /></label>
          <label>Rate limit (requests/min)<input name="rateLimit" type="number" min="1" max="600" defaultValue="60" /></label>
          <label className="source-notes">Notes<input name="notes" maxLength={2000} /></label>
          <SubmitButton pendingLabel="Saving source…">Save company</SubmitButton>
        </form>
      </section>
    </div>
  );
}
