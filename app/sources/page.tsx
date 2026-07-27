import { PageHeader } from "@/app/components/PageHeader";
import { SubmitButton } from "@/app/components/SubmitButton";
import { WorkspaceLayout } from "@/app/components/PageLayout";
import { prisma } from "@/lib/db";
import { mapError } from "@/lib/errors/app-error";
import { jobSourceRegistry } from "@/lib/job-sources/registry";
import { PROVIDER_CAPABILITIES } from "@/lib/job-sources/capabilities";
import type { DiscoveryDiagnostics } from "@/lib/job-sources/types";
import { scheduleLabel } from "@/lib/scheduling/schedule";

import {
  addCompanyConnectorAction,
  bulkImportGreenhouseBoardsAction,
  compareMyGreenhouseUrlsAction,
  addMissingGreenhouseBoardAction,
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

function diagnosticsFrom(value: unknown): DiscoveryDiagnostics | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const diagnostics = (value as Record<string, unknown>).diagnostics;
  return diagnostics && typeof diagnostics === "object" && !Array.isArray(diagnostics)
    ? diagnostics as DiscoveryDiagnostics
    : null;
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
  const recentRuns = await prisma.connectorCrawl.findMany({
    include: { connector: true },
    orderBy: { startedAt: "desc" },
    take: 30,
  });
  const comparisons = await prisma.greenhouseComparisonItem.findMany({
    orderBy: { createdAt: "desc" },
    take: 250,
  });
  const ran = params.companies !== undefined;
  const providers = jobSourceRegistry.list();
  const providerNames = new Map(
    providers.map((provider) => [provider.id, provider.name]),
  );
  const greenhouseConnectors = connectors.filter((connector) => connector.atsType === "greenhouse");
  const latestGreenhouseRuns = recentRuns.filter((run) => run.connector.atsType === "greenhouse");
  const latestGreenhouseBatchId = latestGreenhouseRuns[0]?.batchId;
  const latestGreenhouseBatchRuns = latestGreenhouseBatchId
    ? latestGreenhouseRuns.filter((run) => run.batchId === latestGreenhouseBatchId)
    : [];
  const greenhouseCoverage = {
    enabled: greenhouseConnectors.filter((connector) => connector.enabled).length,
    checked: latestGreenhouseBatchRuns.length,
    discovered: latestGreenhouseBatchRuns.reduce((sum, run) => sum + run.jobsDiscovered, 0),
    imported: latestGreenhouseBatchRuns.reduce((sum, run) => sum + run.jobsImported, 0),
    excluded: latestGreenhouseBatchRuns.reduce((sum, run) => {
      const diagnostics = diagnosticsFrom(run.metadata);
      return sum + (diagnostics?.excludedJobs.length ?? 0);
    }, 0),
  };

  return (
    <WorkspaceLayout className="sources-page">
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
      {params.bulkAdded !== undefined && (
        <div className="crawl-result" role="status">
          <strong>Greenhouse directory imported.</strong>
          <span>{params.bulkAdded} added</span>
          <span>{params.bulkSkipped} skipped as duplicate or invalid</span>
        </div>
      )}
      {params.compared !== undefined && (
        <div className="crawl-result" role="status">
          <strong>MyGreenhouse URLs compared.</strong><span>{params.compared} checked</span>
        </div>
      )}
      {params.error && (
        <div className="crawl-result crawl-error" role="alert">
          <strong>Check the company, URL, board token, and rate settings.</strong>
        </div>
      )}

      <section className="coverage-panel" aria-labelledby="greenhouse-coverage-title">
        <div>
          <p className="eyebrow">Greenhouse coverage</p>
          <h2 id="greenhouse-coverage-title">Registered company boards</h2>
          <p>Greenhouse has no public global MyGreenhouse search API. Coverage is the set of enabled public company boards below.</p>
        </div>
        <dl className="coverage-stats">
          <div><dt>Companies enabled</dt><dd>{greenhouseCoverage.enabled}</dd></div>
          <div><dt>Boards checked last run</dt><dd>{greenhouseCoverage.checked}</dd></div>
          <div><dt>Jobs discovered</dt><dd>{greenhouseCoverage.discovered}</dd></div>
          <div><dt>Matches imported</dt><dd>{greenhouseCoverage.imported}</dd></div>
          <div><dt>Jobs excluded</dt><dd>{greenhouseCoverage.excluded}</dd></div>
        </dl>
      </section>

      <section className="sources-toolbar" aria-labelledby="connector-status">
        <div>
          <p className="eyebrow">Company sources</p>
          <h2 id="connector-status">Source status</h2>
          <p>Each source is checked one at a time and follows the provider&apos;s published access rules.</p>
        </div>
        <div className="source-toolbar-actions">
          <a className="primary-button button-link" href="/scan">Scan Jobs</a>
          <form action={runScheduledDiscoveryAction}><SubmitButton pendingLabel="Running schedules…">Run due schedules</SubmitButton></form>
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

      <section className="source-workflows" aria-labelledby="directory-tools-title">
        <div>
          <p className="eyebrow">Private directory tools</p>
          <h2 id="directory-tools-title">Greenhouse board directory</h2>
          <p>Bulk files are reviewed locally and stored only in SQLite. Use JSON objects with company, boardToken, canonicalBoardUrl, and enabled fields, or the same CSV headers.</p>
        </div>
        <form action={bulkImportGreenhouseBoardsAction}>
          <label>Reviewed JSON or CSV<input name="directory" type="file" accept=".json,.csv,application/json,text/csv" required /></label>
          <SubmitButton pendingLabel="Importing…">Bulk import boards</SubmitButton>
        </form>
      </section>

      <section className="source-workflows" aria-labelledby="comparison-title">
        <div>
          <p className="eyebrow">Private comparison</p>
          <h2 id="comparison-title">Compare MyGreenhouse URLs</h2>
          <p>Paste public job URLs only. Credentials are neither requested nor stored, and authenticated pages are not browsed.</p>
        </div>
        <form action={compareMyGreenhouseUrlsAction}>
          <label>One public job URL per line<textarea name="urls" rows={6} required /></label>
          <SubmitButton pendingLabel="Comparing…">Compare coverage</SubmitButton>
        </form>
        {comparisons.length > 0 && (
          <div className="comparison-results">
            {comparisons.map((item) => (
              <article key={item.id}>
                <span className={`capability capability-${item.status.toLowerCase().replaceAll(" ", "-")}`}>{item.status}</span>
                <strong>{item.companyName ?? item.boardToken ?? "Unresolved provider"}</strong>
                <p>{item.reason}</p>
                <small>{item.submittedUrl}</small>
                {item.status === "Missing board" && item.boardToken && (
                  <form action={addMissingGreenhouseBoardAction}>
                    <input type="hidden" name="boardToken" value={item.boardToken} />
                    <label>Company name<input name="company" required /></label>
                    <SubmitButton pendingLabel="Adding…">Add missing board</SubmitButton>
                  </form>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="provider-capabilities" aria-labelledby="provider-capabilities-title">
        <div className="sources-toolbar">
          <div><p className="eyebrow">Provider policy</p><h2 id="provider-capabilities-title">Verified provider capabilities</h2><p>Unsupported providers fail closed until an official or clearly permitted public path is verified.</p></div>
        </div>
        <div className="capability-grid">
          {PROVIDER_CAPABILITIES.map((provider) => (
            <article key={provider.id}>
              <div><strong>{provider.name}</strong><span className={`capability capability-${provider.capability.toLowerCase().replaceAll(" ", "-")}`}>{provider.capability}</span></div>
              <p>{provider.reason}</p>
            </article>
          ))}
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
    </WorkspaceLayout>
  );
}
