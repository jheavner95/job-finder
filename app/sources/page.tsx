import Link from "next/link";

import { PageHeader } from "@/app/components/PageHeader";
import { SubmitButton } from "@/app/components/SubmitButton";
import { WorkspaceLayout } from "@/app/components/PageLayout";
import { prisma } from "@/lib/db";
import { mapError } from "@/lib/errors/app-error";
import { jobSourceRegistry } from "@/lib/job-sources/registry";
import { PROVIDER_CAPABILITIES } from "@/lib/job-sources/capabilities";
import { scheduleLabel } from "@/lib/scheduling/schedule";

import { AddCompanyForm } from "./AddCompanyForm";
import {
  configureTeamtailorCredentialAction,
  removeTeamtailorCredentialAction,
  testTeamtailorCredentialAction,
} from "./teamtailor-credential-actions";
import {
  configureJobviteFeedAction,
  removeJobviteFeedAction,
} from "./jobvite-feed-actions";
import {
  addMissingGreenhouseBoardAction,
  bulkImportGreenhouseBoardsAction,
  compareMyGreenhouseUrlsAction,
  removeConnectorAction,
  runProviderDiscoveryAction,
  runScheduledDiscoveryAction,
  toggleConnectorAction,
  validateConnectorAction,
} from "./actions";

export const dynamic = "force-dynamic";

function dateTime(value: Date | null | undefined) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function relativeTime(value: Date | null | undefined) {
  if (!value) return "Never checked";
  const minutes = Math.max(0, Math.round((Date.now() - value.getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

function safeError(value: string | null | undefined) {
  if (!value) return null;
  const error = mapError(value, { route: "/sources" });
  return { title: error.title, message: error.message };
}

function companyHealth(connector: {
  enabled: boolean;
  health: string;
  lastChecked: Date | null;
  crawlRuns: Array<{ lastError: string | null; failures: number }>;
}) {
  if (!connector.enabled) return { label: "Disabled", className: "disabled" };
  if (!connector.lastChecked && !connector.crawlRuns.length) {
    return { label: "Never checked", className: "unchecked" };
  }
  const error = connector.crawlRuns[0]?.lastError?.toLowerCase() ?? "";
  if (/robots|authentication|required|forbidden|blocked/.test(error)) {
    return { label: "Blocked", className: "blocked" };
  }
  if (connector.health === "Healthy") return { label: "Healthy", className: "healthy" };
  return { label: "Warning", className: "warning" };
}

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const [connectors, recentRuns, comparisons] = await Promise.all([
    prisma.companyConnector.findMany({
      orderBy: { company: "asc" },
      include: {
        crawlRuns: { orderBy: { startedAt: "desc" }, take: 8 },
        schedule: true,
      },
    }),
    prisma.connectorCrawl.findMany({
      include: { connector: true },
      orderBy: { startedAt: "desc" },
      take: 30,
    }),
    prisma.greenhouseComparisonItem.findMany({
      orderBy: { createdAt: "desc" },
      take: 250,
    }),
  ]);
  const providerNames = new Map(
    jobSourceRegistry.list().map((provider) => [provider.id, provider.name]),
  );
  const latestBatchId = recentRuns.find((run) => run.batchId)?.batchId;
  const lastScanRuns = latestBatchId
    ? recentRuns.filter((run) => run.batchId === latestBatchId)
    : recentRuns.slice(0, connectors.length || 1);
  const health = connectors.map(companyHealth);
  const validationRuns = recentRuns.filter((run) =>
    run.status.toLowerCase().includes("validation"),
  );
  const lastScan = recentRuns.find((run) => run.completedAt)?.completedAt;

  return (
    <WorkspaceLayout className="sources-page company-sources-page">
      <PageHeader
        title="Companies"
        subtitle="Follow the companies you care about. Their public career platforms are detected automatically."
      />

      {(params.added || params.validated || params.validationFailed || params.removed) && (
        <div className={`crawl-result ${params.validationFailed ? "crawl-error" : ""}`} role={params.validationFailed ? "alert" : "status"}>
          <strong>
            {params.added && "Company added to discovery."}
            {params.validated && `${params.company ?? "Company"} is verified.`}
            {params.validationFailed && `${params.company ?? "Company"} could not be verified.`}
            {params.removed && "Company removed from discovery."}
          </strong>
        </div>
      )}
      {params.companies !== undefined && (
        <div className="crawl-result" role="status">
          <strong>Company discovery completed.</strong>
          <span>{params.companies} checked</span>
          <span>{params.found} public jobs</span>
          <span>{params.imported} new opportunities</span>
          <span>{params.failures} warnings</span>
        </div>
      )}

      <section className="company-discovery-hero" aria-labelledby="discovery-overview-title">
        <div className="company-overview-heading">
          <div>
            <p className="eyebrow">Discovery overview</p>
            <h2 id="discovery-overview-title">Your company watchlist</h2>
            <p>Career platforms and public endpoints are handled automatically.</p>
          </div>
          <div className="company-overview-actions">
            <a className="primary-button button-link" href="#add-company">Add Company</a>
            <Link className="secondary-button button-link" href="/scan">Scan Jobs</Link>
            <Link className="text-button" href="/scan#schedule">Manage Schedule</Link>
          </div>
        </div>
        <dl className="company-overview-metrics">
          <div><dt>Companies followed</dt><dd>{connectors.length}</dd></div>
          <div><dt>Companies healthy</dt><dd>{health.filter((item) => item.className === "healthy").length}</dd></div>
          <div><dt>Need attention</dt><dd>{health.filter((item) => ["warning", "blocked"].includes(item.className)).length}</dd></div>
          <div><dt>Jobs discovered</dt><dd>{lastScanRuns.reduce((sum, run) => sum + run.jobsDiscovered, 0)}</dd><small>Last scan</small></div>
          <div><dt>New opportunities</dt><dd>{lastScanRuns.reduce((sum, run) => sum + run.jobsImported, 0)}</dd><small>Last scan</small></div>
          <div><dt>Last scan</dt><dd className="metric-time">{relativeTime(lastScan)}</dd></div>
        </dl>
      </section>

      <section className="followed-companies" aria-labelledby="followed-companies-title">
        <div className="sources-section-heading">
          <div><p className="eyebrow">Followed companies</p><h2 id="followed-companies-title">Companies you monitor</h2></div>
          <form action={runScheduledDiscoveryAction}>
            <SubmitButton pendingLabel="Checking companies…">Run due checks</SubmitButton>
          </form>
        </div>
        <div className="company-card-list">
          {connectors.map((connector) => {
            const latest = connector.crawlRuns[0];
            const status = companyHealth(connector);
            const error = safeError(latest?.lastError);
            const lastImport = connector.crawlRuns.find((run) => run.jobsImported > 0);
            let consecutiveFailures = 0;
            for (const run of connector.crawlRuns) {
              if (run.failures < 1) break;
              consecutiveFailures += 1;
            }
            return (
              <article className={`company-source-card company-health-${status.className}`} key={connector.id}>
                <header>
                  <div className="company-identity">
                    <span aria-hidden="true">{connector.company.slice(0, 1).toUpperCase()}</span>
                    <div><h3>{connector.company}</h3><small>{connector.careerUrl}</small></div>
                  </div>
                  <span className={`company-health-pill health-${status.className}`}>{status.label}</span>
                </header>
                <div className="company-source-summary">
                  <div><strong>{latest?.jobsDiscovered ?? "—"}</strong><span>public jobs</span></div>
                  <div><strong>{relativeTime(latest?.completedAt ?? connector.lastChecked)}</strong><span>last checked</span></div>
                  <div><strong>{scheduleLabel(connector.schedule)}</strong><span>schedule</span></div>
                  <div><strong>{consecutiveFailures}</strong><span>consecutive failures</span></div>
                </div>
                {error && (
                  <div className="company-warning">
                    <strong>{error.title}</strong><p>{error.message}</p>
                    <small>Suggested action: validate the public career URL, then retry.</small>
                  </div>
                )}
                {connector.atsType === "teamtailor" && (
                  <details className="company-technical-details">
                    <summary>
                      Teamtailor authorization · {connector.credentialStatus}
                    </summary>
                    <p>
                      Use an employer-issued Public read API key. The key is stored only
                      in this Mac&apos;s Keychain and is never written to the database.
                    </p>
                    <form action={configureTeamtailorCredentialAction}>
                      <input type="hidden" name="connectorId" value={connector.id} />
                      <label>
                        API key
                        <input name="apiKey" type="password" autoComplete="new-password" required />
                      </label>
                      <label>
                        Data region
                        <select name="region" defaultValue={connector.credentialRegion ?? "eu"}>
                          <option value="eu">EU</option>
                          <option value="na">North America</option>
                        </select>
                      </label>
                      <input type="hidden" name="apiVersion" value="20240404" />
                      <SubmitButton pendingLabel="Validating…">
                        {connector.credentialStatus === "Valid" ? "Replace credential" : "Authorize Teamtailor"}
                      </SubmitButton>
                    </form>
                    {connector.credentialStatus === "Valid" && (
                      <div className="company-card-actions">
                        <form action={testTeamtailorCredentialAction}>
                          <input type="hidden" name="connectorId" value={connector.id} />
                          <SubmitButton pendingLabel="Testing…">Test credential</SubmitButton>
                        </form>
                        <form action={removeTeamtailorCredentialAction}>
                          <input type="hidden" name="connectorId" value={connector.id} />
                          <SubmitButton className="danger-text-button" pendingLabel="Removing…">
                            Remove credential
                          </SubmitButton>
                        </form>
                      </div>
                    )}
                  </details>
                )}
                {connector.atsType === "jobvite" && (
                  <details className="company-technical-details">
                    <summary>Jobvite employer feed · {connector.feedStatus}</summary>
                    <p>
                      Use only the reviewed feed supplied by the employer. The full URL
                      is kept in this Mac&apos;s Keychain; only its origin and path are
                      stored with the connector.
                    </p>
                    <form action={configureJobviteFeedAction}>
                      <input type="hidden" name="connectorId" value={connector.id} />
                      <label>
                        Employer-provided feed URL
                        <input name="feedUrl" type="url" autoComplete="off" required />
                      </label>
                      <label>
                        Jobvite employer ID
                        <input name="employerId" defaultValue={connector.connectorKey} required />
                      </label>
                      <SubmitButton pendingLabel="Certifying…">
                        {connector.feedStatus === "Valid" ? "Replace feed" : "Validate and enable"}
                      </SubmitButton>
                    </form>
                    {connector.feedStatus === "Valid" && (
                      <form action={removeJobviteFeedAction}>
                        <input type="hidden" name="connectorId" value={connector.id} />
                        <SubmitButton className="danger-text-button" pendingLabel="Removing…">
                          Remove feed
                        </SubmitButton>
                      </form>
                    )}
                  </details>
                )}
                <div className="company-card-actions">
                  <Link className="source-run button-link" href="/review">View Jobs</Link>
                  <form action={runProviderDiscoveryAction}>
                    <input type="hidden" name="connectorId" value={connector.id} />
                    <SubmitButton className="source-run" pendingLabel="Checking…" disabled={!connector.enabled} ariaLabel={`Run ${connector.company} now`}>Run Now</SubmitButton>
                  </form>
                  <form action={validateConnectorAction}>
                    <input type="hidden" name="connectorId" value={connector.id} />
                    <SubmitButton className="source-run" pendingLabel="Validating…" ariaLabel={`Validate ${connector.company}`}>Validate</SubmitButton>
                  </form>
                  <form action={toggleConnectorAction}>
                    <input type="hidden" name="connectorId" value={connector.id} />
                    <input type="hidden" name="enabled" value={connector.enabled ? "false" : "true"} />
                    <SubmitButton className="source-run" pendingLabel="Updating…">{connector.enabled ? "Pause" : "Enable"}</SubmitButton>
                  </form>
                </div>
                <details className="company-technical-details">
                  <summary>Connection details</summary>
                  <dl>
                    <div><dt>Provider</dt><dd>{providerNames.get(connector.atsType) ?? connector.atsType}</dd></div>
                    <div><dt>Connection</dt><dd>{status.label}</dd></div>
                    <div><dt>Last validation</dt><dd>{dateTime(connector.lastChecked)}</dd></div>
                    <div><dt>Last successful scan</dt><dd>{dateTime(connector.lastSuccessfulFetch)}</dd></div>
                    <div><dt>Last import</dt><dd>{dateTime(lastImport?.completedAt)}</dd></div>
                    <div><dt>Failures</dt><dd>{connector.crawlRuns.reduce((sum, run) => sum + run.failures, 0)}</dd></div>
                  </dl>
                  <form action={removeConnectorAction}>
                    <input type="hidden" name="connectorId" value={connector.id} />
                    <SubmitButton className="danger-text-button" pendingLabel="Removing…">Remove company</SubmitButton>
                  </form>
                </details>
              </article>
            );
          })}
          {!connectors.length && (
            <div className="company-empty-state">
              <span aria-hidden="true">◎</span>
              <h3>Follow your first company</h3>
              <p>Add a public career URL. The provider and board identifier will be detected for you.</p>
              <a className="primary-button button-link" href="#add-company">Add Company</a>
            </div>
          )}
        </div>
      </section>

      <section className="add-company-section" id="add-company" aria-labelledby="add-company-title">
        <div className="section-intro">
          <p className="eyebrow">Add company</p>
          <h2 id="add-company-title">Follow a public career page</h2>
          <p>No provider setup required. We detect the platform, verify public access, and count available jobs before saving.</p>
        </div>
        <AddCompanyForm />
      </section>

      <section className="validation-history" aria-labelledby="validation-history-title">
        <div className="sources-section-heading">
          <div><p className="eyebrow">Validation results</p><h2 id="validation-history-title">Recent connection checks</h2></div>
        </div>
        <div className="source-history-list">
          {validationRuns.slice(0, 6).map((run) => (
            <article key={run.id}>
              <div><strong>{run.connector.company}</strong><small>{dateTime(run.completedAt ?? run.startedAt)}</small></div>
              <span className={run.failures ? "history-warning" : "history-healthy"}>{run.failures ? "Blocked" : "Verified"}</span>
              <p>{run.failures ? safeError(run.lastError)?.message : `${run.jobsDiscovered} public jobs available`}</p>
              <small>{run.durationMs ? `${(run.durationMs / 1000).toFixed(1)} sec` : "Response time unavailable"}</small>
            </article>
          ))}
          {!validationRuns.length && <p className="history-empty">Validation history will appear after you check a company connection.</p>}
        </div>
      </section>

      <section className="company-discovery-history" aria-labelledby="discovery-history-title">
        <div className="sources-section-heading">
          <div><p className="eyebrow">Discovery history</p><h2 id="discovery-history-title">What each company returned</h2></div>
          <Link href="/scan">Open scan details →</Link>
        </div>
        <div className="source-history-list">
          {recentRuns.filter((run) => !run.status.toLowerCase().includes("validation")).slice(0, 10).map((run) => (
            <article key={run.id}>
              <div><strong>{run.connector.company}</strong><small>{dateTime(run.completedAt ?? run.startedAt)}</small></div>
              <span className={run.failures ? "history-warning" : "history-healthy"}>{run.failures ? "Warning" : "Healthy"}</span>
              <p>{run.jobsDiscovered} jobs · {run.jobsImported} new · {run.duplicates} duplicates</p>
              <small>{run.durationMs ? `${(run.durationMs / 1000).toFixed(1)} sec` : "In progress"}</small>
            </article>
          ))}
          {!recentRuns.length && <p className="history-empty">Company discovery history will appear after the first scan.</p>}
        </div>
      </section>

      <details className="provider-information">
        <summary>
          <span><small>Provider information</small>Supported career platforms and private directory tools</span>
          <strong>Advanced</strong>
        </summary>
        <div className="provider-information-content">
          <section aria-labelledby="provider-capabilities-title">
            <div className="sources-section-heading">
              <div><p className="eyebrow">Documentation</p><h2 id="provider-capabilities-title">Supported providers</h2><p>Providers are detected automatically from public career URLs.</p></div>
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
          <section className="source-workflows" aria-labelledby="directory-tools-title">
            <div><p className="eyebrow">Private directory</p><h2 id="directory-tools-title">Greenhouse board directory</h2><p>Import an existing reviewed local company directory.</p></div>
            <form action={bulkImportGreenhouseBoardsAction}>
              <label>Reviewed JSON or CSV<input name="directory" type="file" accept=".json,.csv,application/json,text/csv" required /></label>
              <SubmitButton pendingLabel="Importing…">Import directory</SubmitButton>
            </form>
          </section>
          <section className="source-workflows" aria-labelledby="comparison-title">
            <div><p className="eyebrow">Private comparison</p><h2 id="comparison-title">Compare public job URLs</h2><p>Credentials are neither requested nor stored.</p></div>
            <form action={compareMyGreenhouseUrlsAction}>
              <label>One public job URL per line<textarea name="urls" rows={5} required /></label>
              <SubmitButton pendingLabel="Comparing…">Compare coverage</SubmitButton>
            </form>
            {comparisons.length > 0 && (
              <div className="comparison-results">
                {comparisons.map((item) => (
                  <article key={item.id}>
                    <span className={`capability capability-${item.status.toLowerCase().replaceAll(" ", "-")}`}>{item.status}</span>
                    <strong>{item.companyName ?? item.boardToken ?? "Unresolved provider"}</strong>
                    <p>{item.reason}</p><small>{item.submittedUrl}</small>
                    {item.status === "Missing board" && item.boardToken && (
                      <form action={addMissingGreenhouseBoardAction}>
                        <input type="hidden" name="boardToken" value={item.boardToken} />
                        <label>Company name<input name="company" required /></label>
                        <SubmitButton pendingLabel="Adding…">Add company</SubmitButton>
                      </form>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </details>
    </WorkspaceLayout>
  );
}
