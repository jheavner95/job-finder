"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ProviderSummary = {
  id: string;
  provider: string;
  company: string;
  state: string;
  discovered: number;
  matches: number;
  imported: number;
  duplicates: number;
  excluded: number;
  explanation: string | null;
};

type Snapshot = {
  id: string;
  trigger: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  cancelRequested: boolean;
  total: number;
  completed: number;
  progress: number;
  discovered: number;
  matches: number;
  imported: number;
  duplicates: number;
  excluded: number;
  closed: number;
  failures: number;
  durationMs: number;
  providers: ProviderSummary[];
  newOpportunities: Array<{ id: string; title: string; company: string; score: number }>;
  events: Array<{ id: string; timestamp: string; provider: string; company: string; operation: string; result: string; tone: string }>;
  exclusions: Array<{ externalId: string; title: string; canonicalUrl: string; reason: string; detail: string; provider: string; company: string }>;
  failureDetails: Array<{ id: string; provider: string; company: string; explanation: string; nextAction: string; retryable: boolean; severity: string }>;
};

type Connector = {
  id: string;
  company: string;
  atsType: string;
  titles: string[];
  locations: string[];
};

function time(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", second: "2-digit",
  }).format(new Date(value));
}

function duration(milliseconds: number) {
  const seconds = Math.max(0, milliseconds / 1_000);
  if (seconds < 60) return `${seconds.toFixed(1)} seconds`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function outcomeTitle(snapshot: Snapshot) {
  if (snapshot.status === "Cancelled") return "Job Scan Cancelled";
  if (snapshot.status === "Failed") return "Job Scan Failed";
  if (snapshot.status === "CompletedWithErrors") return "Job Scan Complete";
  return "Job Scan Complete";
}

function providerIcon(state: string) {
  if (state === "Healthy") return "✓";
  if (state === "Running") return "●";
  if (state === "Waiting" || state === "Not run") return "○";
  if (state === "Blocked") return "⊘";
  return "!";
}

export function ScanControl({
  initial,
  connectors,
}: {
  initial: Snapshot | null;
  connectors: Connector[];
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [selected, setSelected] = useState(() => connectors.map((connector) => connector.id));
  const [starting, setStarting] = useState(false);
  const [startedAfter, setStartedAfter] = useState<number | null>(null);
  const running = starting || snapshot?.status === "Running";

  useEffect(() => {
    if (!running) return;
    const poll = window.setInterval(async () => {
      const response = await fetch("/api/scan/status", { cache: "no-store" });
      const payload = await response.json() as { snapshot: Snapshot | null };
      if (!payload.snapshot) return;
      if (startedAfter && new Date(payload.snapshot.startedAt).getTime() < startedAfter) return;
      setSnapshot(payload.snapshot);
      if (payload.snapshot.status !== "Running") setStarting(false);
    }, 900);
    return () => window.clearInterval(poll);
  }, [running, startedAfter]);

  async function start() {
    const began = Date.now();
    setStartedAfter(began - 1_000);
    setStarting(true);
    void fetch("/api/scan/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectorIds: selected }),
    }).then(async (response) => {
      if (response.status === 409) setStartedAfter(null);
      const status = await fetch("/api/scan/status", { cache: "no-store" });
      const payload = await status.json() as { snapshot: Snapshot | null };
      setSnapshot(payload.snapshot);
      setStarting(payload.snapshot?.status === "Running");
    });
  }

  async function cancel() {
    if (!window.confirm("Cancel after the current source operation? Completed imports will be preserved.")) return;
    await fetch("/api/scan/cancel", { method: "POST" });
    setSnapshot((current) => current ? { ...current, cancelRequested: true } : current);
  }

  const groupedConnectors = Map.groupBy(connectors, (connector) => connector.atsType);
  const exclusionGroups = snapshot
    ? Object.groupBy(snapshot.exclusions, (item) => item.reason)
    : {};
  const completed = snapshot && !running;

  return (
    <>
      {!completed && (
        <section className="scan-run-panel">
          <div>
            <p className="eyebrow">{running ? "Scan in progress" : "Ready to scan"}</p>
            <h2>{running ? `${snapshot?.completed ?? 0} of ${snapshot?.total ?? selected.length} sources complete` : `${selected.length} sources ready`}</h2>
            <p>{running ? `${duration(snapshot?.durationMs ?? 0)} elapsed. Completed sources update as their real work finishes.` : "Choose the sources and searches you want to check."}</p>
          </div>
          {!running && <button className="primary-button" type="button" disabled={!selected.length} onClick={start}>Start Scan</button>}
          {running && <button className="danger-button" type="button" disabled={snapshot?.cancelRequested} onClick={cancel}>{snapshot?.cancelRequested ? "Cancelling…" : "Cancel Scan"}</button>}
        </section>
      )}

      {!completed && (
        <section className="live-provider-progress" aria-live="polite">
          <div className="scan-section-heading">
            <div><p className="eyebrow">Provider progress</p><h2>Overall</h2></div>
            <strong>{snapshot?.completed ?? 0} of {snapshot?.total ?? selected.length} complete</strong>
          </div>
          <div className="provider-progress-list">
            {(snapshot?.providers ?? [...groupedConnectors].flatMap(([provider, items]) =>
              items.filter((item) => selected.includes(item.id)).map((item) => ({
                id: item.id, provider, company: item.company, state: "Waiting",
                discovered: 0, matches: 0, imported: 0, duplicates: 0, excluded: 0, explanation: null,
              })))).map((provider) => (
                <article key={provider.id} className={`provider-progress provider-state-${provider.state.toLowerCase().replaceAll(" ", "-")}`}>
                  <span>{providerIcon(provider.state)}</span>
                  <div><strong>{provider.provider}</strong><small>{provider.company}</small></div>
                  <b>{provider.state}{provider.state === "Running" ? "…" : ""}</b>
                </article>
              ))}
          </div>
        </section>
      )}

      {!running && !completed && (
        <details className="scan-configuration" open={!snapshot}>
          <summary><span><small>Run configuration</small><strong>Choose sources and saved searches</strong></span><i>{selected.length} selected</i></summary>
          <div className="scan-config-grid">
            <div>
              <div className="config-column-heading"><h3>Sources to scan</h3><button type="button" className="text-button" onClick={() =>
                setSelected(selected.length === connectors.length ? [] : connectors.map((connector) => connector.id))}>
                {selected.length === connectors.length ? "Clear selection" : "Select all enabled"}
              </button></div>
              {[...groupedConnectors].map(([provider, items]) => (
                <div className="scan-provider-group" key={provider}>
                  <strong>{provider}<span>{items.filter((item) => selected.includes(item.id)).length} enabled</span></strong>
                  {items.map((connector) => (
                    <label key={connector.id}>
                      <input type="checkbox" checked={selected.includes(connector.id)} onChange={(event) =>
                        setSelected((current) => event.target.checked
                          ? [...current, connector.id]
                          : current.filter((id) => id !== connector.id))} />
                      {connector.company}
                    </label>
                  ))}
                </div>
              ))}
            </div>
            <div>
              <h3>Searches applied</h3>
              <ul className="scan-search-list">
                {connectors.filter((connector) => selected.includes(connector.id)).map((connector) => (
                  <li key={connector.id}><strong>{connector.company}</strong><span>{connector.titles.length ? connector.titles.join(", ") : "All roles"}</span><small>{connector.locations.length ? connector.locations.join(", ") : "All locations"} · Saved work-mode settings</small></li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      )}

      {completed && snapshot && (
        <>
          <section className={`decision-hero decision-status-${snapshot.status.toLowerCase()}`}>
            <div className="decision-outcome">
              <span className="decision-check">{snapshot.status === "Failed" ? "!" : snapshot.status === "Cancelled" ? "■" : "✓"}</span>
              <div>
                <p className="eyebrow">{snapshot.status === "CompletedWithErrors" ? "Completed with provider warnings" : snapshot.status}</p>
                <h2>{outcomeTitle(snapshot)}</h2>
                <strong>{snapshot.imported > 0 ? `${snapshot.imported} new ${snapshot.imported === 1 ? "opportunity" : "opportunities"} ready to review.` : "No new opportunities today."}</strong>
                {snapshot.imported === 0 && snapshot.matches > 0 && <p>All {snapshot.matches} matching {snapshot.matches === 1 ? "job was" : "jobs were"} already in your library.</p>}
              </div>
            </div>
            <dl className="decision-metrics">
              <div><dd>{snapshot.discovered}</dd><dt>jobs scanned</dt></div>
              <div><dd>{snapshot.matches}</dd><dt>opportunities matched</dt></div>
              <div className="metric-primary"><dd>{snapshot.imported}</dd><dt>new opportunities</dt></div>
              <div><dd>{snapshot.duplicates}</dd><dt>already in your library</dt></div>
              <div><dd>{snapshot.excluded}</dd><dt>excluded</dt></div>
              <div className={snapshot.failures ? "metric-warning" : ""}><dd>{snapshot.failures}</dd><dt>provider {snapshot.failures === 1 ? "warning" : "warnings"}</dt></div>
            </dl>
            <p className="decision-duration">Completed in {duration(snapshot.durationMs)}</p>
            <div className="decision-actions">
              <Link className="primary-button button-link" href="/review">{snapshot.imported ? "Review New Opportunities" : "Review Opportunities"}</Link>
              {!!snapshot.exclusions.length && <a className="secondary-button button-link" href="#scan-exclusions">View Exclusions</a>}
              <button className="secondary-button" type="button" onClick={start}>Scan Again</button>
              <Link className="text-button" href="/sources">Manage Sources</Link>
            </div>
          </section>

          {snapshot.newOpportunities.length > 0 && (
            <section className="new-opportunities">
              <div className="scan-section-heading"><div><p className="eyebrow">New opportunities</p><h2>Ready for your decision</h2></div><Link href="/review">Review all →</Link></div>
              <div className="new-opportunity-grid">{snapshot.newOpportunities.map((job) => (
                <Link href={`/jobs/${job.id}`} key={job.id}><span>{job.company}</span><strong>{job.title}</strong><b>Score {job.score}</b></Link>
              ))}</div>
            </section>
          )}

          <section className="provider-results">
            <div className="scan-section-heading"><div><p className="eyebrow">Provider status</p><h2>What each source contributed</h2></div></div>
            <div className="provider-result-grid">{snapshot.providers.map((provider) => (
              <article key={provider.id} className={`provider-card provider-state-${provider.state.toLowerCase()}`}>
                <header><div><span>{providerIcon(provider.state)}</span><strong>{provider.provider}</strong></div><b>{provider.state}</b></header>
                <small>{provider.company}</small>
                {provider.explanation ? <p>{provider.explanation}</p> : (
                  <dl><div><dd>{provider.discovered}</dd><dt>scanned</dt></div><div><dd>{provider.matches}</dd><dt>matched</dt></div><div><dd>{provider.imported}</dd><dt>new</dt></div><div><dd>{provider.duplicates}</dd><dt>library</dt></div></dl>
                )}
              </article>
            ))}</div>
          </section>

          {!!snapshot.exclusions.length && (
            <section className="exclusion-summary" id="scan-exclusions">
              <div><p className="eyebrow">Exclusions</p><h2>{snapshot.excluded} opportunities were excluded.</h2><p>Most common reasons</p></div>
              <div className="exclusion-reasons">{Object.entries(exclusionGroups).sort(([, a], [, b]) => (b?.length ?? 0) - (a?.length ?? 0)).map(([reason, items]) => (
                <span key={reason}><strong>{reason.replaceAll("_", " ")}</strong><b>{items?.length}</b></span>
              ))}{snapshot.duplicates > 0 && <span><strong>Already imported</strong><b>{snapshot.duplicates}</b></span>}</div>
              <details className="scan-details">
                <summary>View individual postings and exact reasons</summary>
                {Object.entries(exclusionGroups).map(([reason, items]) => (
                  <section key={reason}><h3>{reason.replaceAll("_", " ")} <span>{items?.length}</span></h3><ul>{items?.map((item) => <li key={`${item.provider}-${item.externalId}`}><strong>{item.title}</strong><span>{item.company}</span><p>{item.detail}</p></li>)}</ul></section>
                ))}
              </details>
            </section>
          )}

          {!!snapshot.failureDetails.length && (
            <section className="warning-card">
              <div><p className="eyebrow">Provider warnings</p><h2>{snapshot.failureDetails.length} {snapshot.failureDetails.length === 1 ? "source needs" : "sources need"} context</h2></div>
              {snapshot.failureDetails.map((failure) => (
                <article key={failure.id}><span className={`warning-severity severity-${failure.severity.toLowerCase()}`}>{failure.severity}</span><div><strong>{failure.provider} · {failure.company}</strong><p>{failure.explanation}</p><small>{failure.nextAction} · Diagnostic ID {failure.id}</small></div></article>
              ))}
            </section>
          )}

          <details className="technical-timeline">
            <summary>Detailed activity timeline <span>{snapshot.events.length + 1} events</span></summary>
            <div className="scan-timeline">
              <article><time>{time(snapshot.startedAt)}</time><span /><div><strong>Scan started</strong><small>{snapshot.trigger} scan</small></div></article>
              {snapshot.events.map((event) => <article key={event.id} className={`timeline-${event.tone}`}><time>{time(event.timestamp)}</time><span /><div><strong>{event.operation}</strong><small>{event.provider} · {event.company}</small><p>{event.result}</p></div></article>)}
            </div>
          </details>
        </>
      )}
    </>
  );
}
