"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

type Provider = {
  id: string;
  name: string;
  connectorType: string;
  description: string;
  status: string;
  implemented: boolean;
  configured: number;
  enabled: number;
  connectorIds: string[];
  companiesIndexed: number;
  coverage: {
    boardsKnown: number;
    boardsValidated: number;
    boardsFetched: number;
    boardsStale: number;
    jobsReachable: number;
    designRoles: number;
    reviewable: number;
    autoDiscovered: number;
  };
  lastScan: string | null;
  nextScan: string | null;
  jobsDiscovered: number;
  matchedJobs: number;
  duplicates: number;
  closed: number;
  lastError: string | null;
  accounting: {
    discovered: number;
    imported: number;
    duplicates: number;
    excluded: number;
    invalid: number;
    normalizationFailed: number;
    persistenceFailed: number;
  };
  dispositions: Array<{
    externalId: string;
    title: string;
    disposition: string;
    score: number | null;
    errorCode: string | null;
    message: string | null;
    jobId: string | null;
  }>;
  results: Array<{
    id: string;
    title: string;
    company: string;
    location: string | null;
    score: number | null;
    tier: string;
    isNew: boolean;
    closedAt: string | null;
    lastSeenAt: string | null;
  }>;
  exclusions: Array<{
    externalId: string;
    title: string;
    reason: string;
    detail: string;
    company: string;
  }>;
  history: Array<{
    id: string;
    company: string;
    status: string;
    startedAt: string;
    durationMs: number | null;
    discovered: number;
    matched: number;
    imported: number;
    duplicates: number;
    failures: number;
    errorCode: string | null;
  }>;
  connectors: Array<{
    id: string;
    company: string;
    enabled: boolean;
    health: string;
    credentialStatus: string;
    feedStatus: string;
  }>;
};

type ProviderProgress = {
  id: string;
  provider: string;
  company: string;
  state: string;
  stage: string;
  discovered: number;
  matches: number;
  imported: number;
  duplicates: number;
  excluded: number;
  explanation: string | null;
  errorCode: string | null;
};

type Snapshot = {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  cancelRequested: boolean;
  total: number;
  completed: number;
  discovered: number;
  matches: number;
  imported: number;
  duplicates: number;
  excluded: number;
  closed: number;
  failures: number;
  durationMs: number;
  providers: ProviderProgress[];
  newOpportunities: Array<{
    id: string;
    title: string;
    company: string;
    provider: string;
    location: string | null;
    score: number;
  }>;
  events: Array<{
    id: string;
    timestamp: string;
    provider: string;
    company: string;
    operation: string;
    result: string;
    tone: string;
  }>;
};

type Batch = {
  id: string;
  status: string;
  trigger: string;
  startedAt: string;
  durationMs: number | null;
  discovered: number;
  matched: number;
  imported: number;
  duplicates: number;
  failures: number;
};

const logoMarks: Record<string, string> = {
  greenhouse: "GH",
  lever: "LV",
  ashby: "AS",
  smartrecruiters: "SR",
  workable: "WK",
  recruitee: "RE",
  comeet: "CO",
  personio: "PE",
  jobscore: "JS",
  teamtailor: "TT",
  jobvite: "JV",
  pinpoint: "PP",
  workday: "WD",
};

function dateTime(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

/**
 * Relative time depends on the current clock, so the server and the client
 * compute different strings for the same timestamp and React reports a
 * hydration mismatch. `mounted` is false for the server render AND the first
 * client render, which keeps those two in agreement; the relative form appears
 * on the next commit.
 *
 * The pre-hydration value is the calendar date sliced straight out of the ISO
 * string — no clock, no locale, no timezone — so it is byte-identical on both
 * sides. Recency is still shown throughout.
 */
function relative(value: string | null, mounted = true) {
  if (!value) return "Never";
  if (!mounted) return value.slice(0, 10);
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1_440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1_440)}d ago`;
}

/** Stable no-op subscription: the hydration flag never changes after mount. */
const neverChanges = () => () => {};

function duration(value: number | null) {
  if (value === null) return "—";
  if (value < 60_000) return `${(value / 1_000).toFixed(1)}s`;
  return `${Math.floor(value / 60_000)}m ${Math.round(value % 60_000 / 1_000)}s`;
}

function statusClass(value: string) {
  return value.toLowerCase().replaceAll(" ", "-");
}

function connectionLabel(provider: Provider) {
  if (!provider.configured) return "Not connected";
  if (!provider.enabled) return "Paused";
  return `${provider.enabled} active ${provider.enabled === 1 ? "source" : "sources"}`;
}

function providerErrorCopy(provider: Provider) {
  if (provider.id === "smartrecruiters" && provider.status === "Blocked") {
    return "Unavailable by provider policy";
  }
  return provider.lastError;
}

function activityCopy(event: Snapshot["events"][number]) {
  const provider = event.provider.charAt(0).toUpperCase() + event.provider.slice(1);
  const result = event.result.toLowerCase();
  if (event.operation === "Checking source") return `${provider} scan started`;
  if (result.includes("no change")) return `${provider} returned no changes`;
  if (result.includes("new job")) return `${provider} ${event.result}`;
  if (result.includes("authentication")) return `${provider} authentication updated`;
  if (result.includes("reconcil")) return `${provider} reconciliation complete`;
  if (result.includes("complete") || event.tone === "success") return `${provider} completed`;
  return `${provider} needs attention`;
}

/** Tier arrives from the server as a plain string; only Low Relevance is held back. */
function reviewableTier(tier: string) {
  return tier !== "Low Relevance";
}

type Coverage = {
  employersKnown: number;
  employersAutoDiscovered: number;
  boardsEnabled: number;
  boardsFetched: number;
  boardsNeedingAttention: number;
  jobsReachable: number;
  providersContributing: number;
  providersRegistered: number;
  designRoles: number;
  reviewable: number;
  candidatesPending: number;
};

export function DiscoveryWorkspace({
  providers,
  coverage,
  initialSnapshot,
  recentBatches,
}: {
  providers: Provider[];
  coverage: Coverage;
  initialSnapshot: Snapshot | null;
  recentBatches: Batch[];
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [starting, setStarting] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(
    providers.find((provider) => provider.configured)?.id ?? providers[0]?.id ?? "",
  );
  const [resultTab, setResultTab] = useState("matched");
  const [filter, setFilter] = useState<"all" | "attention" | "configured">("all");
  const [refreshing, setRefreshing] = useState(false);
  // False for the server snapshot and the first client render, true thereafter.
  // useSyncExternalStore is the sanctioned way to express this — it gives React
  // a distinct server snapshot instead of mutating state from an effect.
  const mounted = useSyncExternalStore(neverChanges, () => true, () => false);
  const since = (value: string | null) => relative(value, mounted);
  const running = starting || snapshot?.status === "Running";
  const selected = providers.find((provider) => provider.id === selectedProvider) ?? providers[0];
  const enabledConnectorIds = providers.flatMap((provider) => provider.connectorIds);

  useEffect(() => {
    if (!running) return;
    const poll = window.setInterval(async () => {
      const response = await fetch("/api/scan/status", { cache: "no-store" });
      const payload = await response.json() as { snapshot: Snapshot | null };
      if (!payload.snapshot) return;
      setSnapshot(payload.snapshot);
      if (payload.snapshot.status !== "Running") {
        setStarting(false);
        router.refresh();
      }
    }, 850);
    return () => window.clearInterval(poll);
  }, [router, running]);

  const visibleProviders = useMemo(() => providers.filter((provider) =>
    filter === "all"
      || (filter === "attention" && ["Needs Configuration", "Blocked", "Error"].includes(provider.status))
      || (filter === "configured" && provider.configured > 0)), [filter, providers]);

  async function startScan(connectorIds: string[]) {
    if (!connectorIds.length) return;
    setStarting(true);
    const response = await fetch("/api/scan/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectorIds }),
    });
    if (!response.ok && response.status !== 409) setStarting(false);
    const status = await fetch("/api/scan/status", { cache: "no-store" });
    const payload = await status.json() as { snapshot: Snapshot | null };
    setSnapshot(payload.snapshot);
    setStarting(payload.snapshot?.status === "Running");
  }

  async function pause() {
    await fetch("/api/scan/cancel", { method: "POST" });
    setSnapshot((current) => current ? { ...current, cancelRequested: true } : current);
  }

  async function refresh() {
    setRefreshing(true);
    const response = await fetch("/api/scan/status", { cache: "no-store" });
    const payload = await response.json() as { snapshot: Snapshot | null };
    setSnapshot(payload.snapshot);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 350);
  }

  const configured = providers.filter((provider) => provider.configured > 0).length;
  const healthy = providers.filter((provider) => provider.status === "Healthy").length;
  const attention = providers.filter((provider) =>
    ["Needs Configuration", "Blocked", "Error"].includes(provider.status)).length;
  const latest = recentBatches[0];
  const indexedJobs = providers.reduce((sum, provider) => sum + provider.results.filter((job) => !job.closedAt).length, 0);
  const newJobs = latest?.imported ?? 0;
  const strongMatches = providers.reduce((sum, provider) =>
    sum + provider.results.filter((job) => !job.closedAt && (job.score ?? 0) >= 80).length, 0);
  const persistedTopMatches = providers.flatMap((provider) => provider.results
    .filter((job) => !job.closedAt && (job.score ?? 0) >= 80)
    .map((job) => ({ ...job, providerId: provider.id, providerName: provider.name })))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 5);
  const liveTopMatches = (snapshot?.newOpportunities ?? [])
    .filter((job) => job.score >= 80)
    .map((job) => {
      const provider = providers.find((item) =>
        item.name.toLowerCase() === job.provider.toLowerCase());
      return {
        ...job,
        providerId: provider?.id ?? job.provider.toLowerCase(),
        providerName: provider?.name ?? job.provider,
        isNew: true,
        closedAt: null,
        lastSeenAt: snapshot?.startedAt ?? null,
      };
    });
  const topMatches = [...liveTopMatches, ...persistedTopMatches]
    .filter((job, index, items) => items.findIndex((item) => item.id === job.id) === index)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 5);
  const displayedStrongMatches = running
    ? strongMatches + liveTopMatches.filter((job) =>
      !persistedTopMatches.some((persisted) => persisted.id === job.id)).length
    : strongMatches;
  const displayedNewJobs = running ? snapshot?.imported ?? 0 : newJobs;
  const displayedIndexedJobs = running ? indexedJobs + (snapshot?.imported ?? 0) : indexedJobs;
  const displayedHealthy = running
    ? snapshot?.providers.filter((provider) => provider.state === "Healthy").length ?? healthy
    : healthy;
  const queue = providers.filter((provider) => provider.configured || provider.status === "Scanning")
    .map((provider) => {
      const live = snapshot?.providers.find((item) => item.provider === provider.id);
      return {
        id: provider.id,
        name: provider.name,
        stage: running ? live?.stage ?? "Queued" : provider.status === "Healthy" ? "Ready" : provider.status,
        state: running ? live?.state ?? "Queued" : provider.status,
      };
    }).filter((item) => !running
      || item.stage !== "Complete"
      || ["Error", "Blocked", "Warning", "Cancelled"].includes(item.state));

  return (
    <>
      <header className="discovery-header">
        <div>
          <p className="eyebrow">Opportunity discovery</p>
          {/* Section heading: the page-level h1 lives in the Discovery route. */}
          <h2>Discovery Engine</h2>
          <p>Your connected hiring platforms, new opportunities, and strongest matches in one focused workspace.</p>
        </div>
        <div className="discovery-global-actions">
          <button className="primary-button" type="button" disabled={running || !enabledConnectorIds.length} onClick={() => startScan(enabledConnectorIds)}>
            {running ? "Scan in progress" : "Scan All Providers"}
          </button>
          <a className="secondary-button button-link" href="#discovery-activity">View Activity</a>
          {running && <button className="text-button" type="button" disabled={snapshot?.cancelRequested} onClick={pause}>
            {snapshot?.cancelRequested ? "Pausing…" : "Pause"}
          </button>}
          <button className="text-button" type="button" onClick={refresh} aria-label="Refresh provider status">{refreshing ? "Refreshing…" : "Refresh"}</button>
        </div>
      </header>

      <section className="discovery-summary" aria-label="Discovery summary">
        <div className="discovery-summary-lead">
          <span className={running ? "summary-orbit is-running" : "summary-orbit"} aria-hidden="true"><i /></span>
          <div>
            <small>{running ? "Discovery is running" : "Strong matches"}</small>
            <strong>{displayedStrongMatches}</strong>
            <p>{displayedStrongMatches ? `${displayedStrongMatches} opportunities deserve your attention.` : "No high-confidence opportunities need review today."}</p>
          </div>
        </div>
        <dl>
          <div className={displayedNewJobs ? "summary-new" : ""}><dd>{displayedNewJobs}</dd><dt>New opportunities</dt></div>
          <div><dd>{displayedHealthy}<small> / {configured}</small></dd><dt>Providers healthy</dt></div>
          <div><dd>{displayedIndexedJobs}</dd><dt>Jobs indexed</dt></div>
          <div><dd className="summary-date">{running ? "Running now" : latest ? since(latest.startedAt) : "Never"}</dd><dt>Last scan</dt></div>
        </dl>
        <div className="discovery-summary-context">
          <span className={attention ? "context-warning" : "context-healthy"}><i />{attention ? `${attention} ${attention === 1 ? "provider needs" : "providers need"} attention` : "All configured providers are ready"}</span>
          <span>{running ? `${snapshot?.completed ?? 0} of ${snapshot?.total ?? 0} complete · ${duration(snapshot?.durationMs ?? 0)}` : latest ? `Last run completed in ${duration(latest.durationMs)}` : "Run your configured providers to begin."}</span>
        </div>
      </section>

      <section className="discovery-coverage" aria-labelledby="discovery-coverage-title">
        <header className="discovery-section-heading">
          <div>
            <p className="eyebrow">Market reach</p>
            <h2 id="discovery-coverage-title">Coverage</h2>
          </div>
          <span className="coverage-note">
            {coverage.candidatesPending > 0
              ? `${coverage.candidatesPending.toLocaleString()} employers queued for board resolution`
              : "All discovered employers have been resolved"}
          </span>
        </header>
        <dl className="coverage-grid">
          <div>
            <dd>{coverage.employersKnown.toLocaleString()}</dd>
            <dt>Employers known</dt>
            <small>{coverage.employersAutoDiscovered.toLocaleString()} found automatically</small>
          </div>
          <div>
            <dd>{coverage.boardsFetched.toLocaleString()}<small> / {coverage.boardsEnabled.toLocaleString()}</small></dd>
            <dt>Boards fetching</dt>
            <small>{coverage.boardsNeedingAttention
              ? `${coverage.boardsNeedingAttention} stale or failing`
              : "None stale"}</small>
          </div>
          <div>
            <dd>{coverage.jobsReachable.toLocaleString()}</dd>
            <dt>Jobs reachable</dt>
            <small>across every registered board</small>
          </div>
          <div>
            <dd>{coverage.designRoles.toLocaleString()}</dd>
            <dt>Design roles found</dt>
            <small>retrieved and evaluated</small>
          </div>
          <div className={coverage.reviewable ? "coverage-highlight" : ""}>
            <dd>{coverage.reviewable.toLocaleString()}</dd>
            <dt>Worth reviewing</dt>
            <small>Stretch and above</small>
          </div>
          <div>
            <dd>{coverage.providersContributing}<small> / {coverage.providersRegistered}</small></dd>
            <dt>Providers contributing</dt>
            <small>adapters that returned a role</small>
          </div>
        </dl>
      </section>

      <section className="today-matches" aria-labelledby="today-matches-title">
        <header className="discovery-section-heading">
          <div><p className="eyebrow">Review first</p><h2 id="today-matches-title">Today&apos;s Strong Matches</h2></div>
          {topMatches.length > 0 && <Link href="/review">Open review queue →</Link>}
        </header>
        {topMatches.length > 0 ? (
          <div className="today-match-grid">
            {topMatches.map((job, index) => (
              <Link href={`/jobs/${job.id}`} key={job.id} className={index === 0 ? "today-match-card is-featured" : "today-match-card"}>
                <span className={`provider-logo logo-${job.providerId}`}>{logoMarks[job.providerId] ?? job.providerName.slice(0, 2).toUpperCase()}</span>
                <span><small>{job.providerName} · {job.location || "Location not provided"}</small><strong>{job.title}</strong><em>{job.company}</em></span>
                <b>{job.score}<small>match</small></b>
                <i>Review →</i>
              </Link>
            ))}
          </div>
        ) : (
          <DiscoveryEmpty title="No strong matches today" message="Discovery is healthy. New high-confidence opportunities will appear here as providers find them." />
        )}
      </section>

      <section className={`discovery-queue ${running ? "is-running" : ""}`} aria-live="polite" aria-labelledby="discovery-queue-title">
        <header>
          <div><p className="eyebrow">Live operations</p><h2 id="discovery-queue-title">Discovery Queue</h2></div>
          <span>{running ? `${snapshot?.completed ?? 0} of ${snapshot?.total ?? 0} complete` : `${queue.length} active ${queue.length === 1 ? "provider" : "providers"}`}</span>
        </header>
        <div className="discovery-queue-list">
          {queue.map((item) => (
            <article key={item.id} className={`queue-${statusClass(item.state)}`}>
              <span className={`queue-state-mark status-${statusClass(item.state)}`} aria-hidden="true"><i /></span>
              <strong>{item.name}</strong>
              <small>{item.stage === "Completed" ? "Complete" : item.stage}</small>
            </article>
          ))}
          {!queue.length && <p>No providers are configured. Add a company source to build your queue.</p>}
        </div>
      </section>

      <section className="provider-collection" aria-labelledby="provider-collection-title">
        <header className="discovery-section-heading">
          <div><p className="eyebrow">Provider collection</p><h2 id="provider-collection-title">Your discovery network</h2></div>
          <div className="provider-filters" role="group" aria-label="Filter providers">
            {(["all", "configured", "attention"] as const).map((value) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
                {value === "all" ? "All providers" : value}
              </button>
            ))}
          </div>
        </header>
        <div className="discovery-provider-grid">
          {visibleProviders.map((provider) => {
            const live = snapshot?.providers.find((item) => item.provider === provider.id);
            const status = live?.state === "Running" ? "Scanning" : provider.status;
            return (
              <article className={`discovery-provider-card provider-${statusClass(status)} ${selected?.id === provider.id ? "is-selected" : ""}`} key={provider.id}>
                <button className="provider-card-select" type="button" onClick={() => setSelectedProvider(provider.id)} aria-label={`Open ${provider.name} details`}>
                  <span className={`provider-logo logo-${provider.id}`}>{logoMarks[provider.id] ?? provider.name.slice(0, 2).toUpperCase()}</span>
                  <span><strong>{provider.name}</strong><small>{provider.connectorType}</small></span>
                  <b className={`discovery-status status-${statusClass(status)}`}><i />{status}</b>
                </button>
                <div className="provider-connection-line">
                  <span><i className={provider.enabled ? "is-connected" : ""} />{connectionLabel(provider)}</span>
                  <small>{provider.coverage.boardsKnown
                    ? `${provider.coverage.boardsKnown.toLocaleString()} board${provider.coverage.boardsKnown === 1 ? "" : "s"} · ${provider.coverage.jobsReachable.toLocaleString()} jobs reachable`
                    : "No boards registered"}</small>
                </div>
                {live && running && (
                  <div className={`provider-live-state live-${statusClass(live.state)}`}>
                    <span><i />{live.stage}</span>
                    <small>{live.discovered} found · {live.matches} matched{live.errorCode ? ` · ${live.errorCode}` : ""}</small>
                  </div>
                )}
                <dl className="provider-card-metrics">
                  <div><dt>Boards fetching</dt><dd>{provider.coverage.boardsFetched}<small> / {provider.coverage.boardsKnown}</small></dd></div>
                  <div><dt>Design roles</dt><dd>{provider.coverage.designRoles}</dd></div>
                  <div><dt>Worth reviewing</dt><dd>{provider.coverage.reviewable}</dd></div>
                  <div><dt>Last scan</dt><dd>{since(provider.lastScan)}</dd></div>
                </dl>
                {(live?.explanation || provider.lastError) && <p className="provider-last-error"><strong>{live?.errorCode === "RETRY_AFTER" ? "Retry state" : provider.id === "smartrecruiters" ? "Provider policy" : "Last error"}</strong>{live?.explanation ?? providerErrorCopy(provider)}</p>}
                <div className="provider-card-actions">
                  <button className="provider-primary-action" type="button" disabled={running || !provider.connectorIds.length} onClick={() => startScan(provider.connectorIds)}>{provider.configured ? "Scan Provider" : "Setup Required"}</button>
                  <button type="button" onClick={() => {
                    setSelectedProvider(provider.id);
                    document.getElementById("provider-details")?.scrollIntoView({ behavior: "smooth" });
                  }}>View Results</button>
                  <Link className="provider-configure-link" href="/sources" aria-label={`Configure ${provider.name}`}>•••</Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {selected && (
        <section className="provider-detail-workspace" id="provider-details" aria-labelledby="provider-detail-title">
          <header>
            <div className="provider-detail-identity">
              <span className={`provider-logo logo-${selected.id}`}>{logoMarks[selected.id] ?? selected.name.slice(0, 2).toUpperCase()}</span>
              <div><p className="eyebrow">Provider details</p><h2 id="provider-detail-title">{selected.name}</h2><p>{selected.description}</p></div>
            </div>
            <div><span className={`discovery-status status-${statusClass(selected.status)}`}><i />{selected.status}</span><Link href="/sources">Manage configuration →</Link></div>
          </header>
          <div className="provider-accounting" aria-label={`${selected.name} latest discovery accounting`}>
            <div className="accounting-total">
              <small>Latest provider run</small>
              <strong>{selected.accounting.discovered} discovered</strong>
              <span>{selected.accounting.discovered === selected.accounting.imported
                + selected.accounting.duplicates
                + selected.accounting.excluded
                + selected.accounting.invalid
                + selected.accounting.normalizationFailed
                + selected.accounting.persistenceFailed ? "Reconciled" : "Needs reconciliation"}</span>
            </div>
            <dl>
              <div><dd>{selected.accounting.imported}</dd><dt>Imported</dt></div>
              <div><dd>{selected.accounting.duplicates}</dd><dt>Duplicates</dt></div>
              <div><dd>{selected.accounting.excluded}</dd><dt>Excluded</dt></div>
              <div><dd>{selected.accounting.invalid}</dd><dt>Invalid</dt></div>
              <div><dd>{selected.accounting.normalizationFailed}</dd><dt>Normalization failed</dt></div>
              <div><dd>{selected.accounting.persistenceFailed}</dd><dt>Persistence failed</dt></div>
            </dl>
          </div>
          <nav className="provider-detail-tabs" aria-label={`${selected.name} results`} role="tablist">
            {[
              ["matched", `Worth reviewing (${selected.results.filter((job) => !job.closedAt && reviewableTier(job.tier)).length})`],
              ["new", `New opportunities (${selected.results.filter((job) => !job.closedAt && job.isNew).length})`],
              ["all", `Low relevance (${selected.results.filter((job) => !job.closedAt && !job.isNew && !reviewableTier(job.tier)).length})`],
              ["closed", `Closed (${selected.closed})`],
              ["diagnostics", "Diagnostics"],
              ["history", "History"],
            ].map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={resultTab === value} onClick={() => setResultTab(value)}>{label}</button>)}
          </nav>
          <div className="provider-detail-content">
            {(resultTab === "matched" || resultTab === "new" || resultTab === "all" || resultTab === "closed") && (
              <div className="discovery-job-list">
                {selected.results.filter((job) =>
                  resultTab === "closed" ? !!job.closedAt
                    : resultTab === "matched" ? !job.closedAt && reviewableTier(job.tier)
                      : resultTab === "new" ? !job.closedAt && job.isNew
                        : !job.closedAt && !job.isNew && !reviewableTier(job.tier)).map((job) => (
                  <Link href={`/jobs/${job.id}`} key={job.id}>
                    <span><strong>{job.title}</strong><small>{job.company} · {job.location || "Location not provided"}</small></span>
                    <span>{job.closedAt ? "Closed" : job.score === null ? "Not scored" : `${job.tier} · ${job.score}`}<small>Seen {since(job.lastSeenAt)}</small></span>
                    <b>Open →</b>
                  </Link>
                ))}
                {!selected.results.filter((job) =>
                  resultTab === "closed" ? !!job.closedAt
                    : resultTab === "matched" ? !job.closedAt && reviewableTier(job.tier)
                      : resultTab === "new" ? !job.closedAt && job.isNew
                        : !job.closedAt && !job.isNew && !reviewableTier(job.tier)).length && (
                  <DiscoveryEmpty
                    title={resultTab === "closed" ? "No closed jobs" : resultTab === "new" ? "No new opportunities" : resultTab === "matched" ? "No strong matches yet" : "No other jobs to review"}
                    message={selected.configured ? "Run this provider again to check for changes. A healthy scan can complete without finding a match." : "Configure at least one company source, then scan this provider to populate results."}
                    action={!selected.configured ? { href: "/sources", label: "Configure provider" } : undefined}
                  />
                )}
              </div>
            )}
            {resultTab === "diagnostics" && (
              <div className="discovery-diagnostics">
                <dl>
                  <div><dt>Connector type</dt><dd>{selected.connectorType}</dd></div>
                  <div><dt>Configured companies</dt><dd>{selected.configured}</dd></div>
                  <div><dt>Enabled companies</dt><dd>{selected.enabled}</dd></div>
                  <div><dt>Last successful response</dt><dd>{dateTime(selected.lastScan)}</dd></div>
                </dl>
                {selected.lastError && (
                  <article className="provider-diagnostic-alert">
                    <strong>{selected.id === "smartrecruiters" ? "Unavailable by provider policy" : "Latest typed provider diagnostic"}</strong>
                    <span>{selected.status}</span>
                    <small>{selected.id === "smartrecruiters" ? "Automated discovery is not permitted by the published robots policy." : selected.lastError}</small>
                  </article>
                )}
                {selected.connectors.map((connector) => (
                  <article key={connector.id}><strong>{connector.company}</strong><span>{connector.enabled ? connector.health : "Disabled"}</span><small>Credential: {connector.credentialStatus} · Feed: {connector.feedStatus}</small></article>
                ))}
                {selected.dispositions.filter((item) =>
                  ["INVALID", "NORMALIZATION_FAILED", "PERSISTENCE_FAILED"].includes(item.disposition))
                  .map((item) => (
                    <article key={`${item.disposition}-${item.externalId}`} className="disposition-diagnostic">
                      <strong>{item.title}</strong>
                      <span>{item.disposition.replaceAll("_", " ")}</span>
                      <small>{item.errorCode ? `${item.errorCode} · ` : ""}{item.message ?? "No provider detail was supplied."}</small>
                    </article>
                  ))}
                {!selected.connectors.length && <DiscoveryEmpty title="Provider requires configuration" message="Add a company source to establish a provider connection." />}
              </div>
            )}
            {resultTab === "history" && (
              <div className="provider-history-list">
                {selected.history.map((run) => <article key={run.id}><span><strong>{run.company}</strong><small>{dateTime(run.startedAt)}</small></span><dl><div><dd>{run.discovered}</dd><dt>found</dt></div><div><dd>{run.matched}</dd><dt>matched</dt></div><div><dd>{run.imported}</dd><dt>new</dt></div><div><dd>{run.duplicates}</dd><dt>duplicates</dt></div></dl><b className={run.failures ? "history-error" : ""}>{run.failures ? run.errorCode ?? "Warning" : run.status}<small>{duration(run.durationMs)}</small></b></article>)}
                {!selected.history.length && <DiscoveryEmpty title="No scans yet" message="Scan this provider to establish its operational history." />}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="discovery-activity-section" id="discovery-activity">
        <div className="discovery-activity-log">
          <header className="discovery-section-heading"><div><p className="eyebrow">Activity log</p><h2>Latest provider events</h2></div></header>
          {(snapshot?.events ?? []).slice(-8).reverse().map((event) => (
            <article key={event.id}><i className={`activity-${event.tone}`} /><span><strong>{activityCopy(event)}</strong><small>{event.company}</small><p>{event.result}</p></span><time>{since(event.timestamp)}</time></article>
          ))}
          {!snapshot?.events.length && <DiscoveryEmpty title="No activity yet" message="Live provider events will appear here when a scan begins." />}
        </div>
      </section>
      <section className="discovery-history-section">
        <div className="recent-discovery-scans">
          <header className="discovery-section-heading"><div><p className="eyebrow">Recent scans</p><h2>Discovery history</h2></div><Link href="/scan">Full history →</Link></header>
          {recentBatches.slice(0, 6).map((batch) => (
            <Link href={`/scan?batchId=${batch.id}`} key={batch.id}><span><strong>{dateTime(batch.startedAt)}</strong><small>{batch.trigger} · {duration(batch.durationMs)}</small></span><dl><div><dd>{batch.discovered}</dd><dt>found</dt></div><div><dd>{batch.matched}</dd><dt>matched</dt></div><div><dd>{batch.imported}</dd><dt>new</dt></div></dl><b className={batch.failures ? "history-error" : ""}>{batch.failures ? "Warnings" : batch.status}</b></Link>
          ))}
          {!recentBatches.length && <DiscoveryEmpty title="No scans yet" message="Run all providers to create your first discovery summary and activity history." />}
        </div>
      </section>
    </>
  );
}

function DiscoveryEmpty({ title, message, action }: { title: string; message: string; action?: { href: string; label: string } }) {
  return <div className="discovery-empty"><span aria-hidden="true">◎</span><strong>{title}</strong><p>{message}</p>{action && <Link href={action.href}>{action.label} →</Link>}</div>;
}
