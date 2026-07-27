"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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
  events: Array<{ id: string; timestamp: string; provider: string; company: string; operation: string; result: string; tone: string }>;
  exclusions: Array<{ externalId: string; title: string; canonicalUrl: string; reason: string; detail: string; provider: string; company: string }>;
  failureDetails: Array<{ id: string; provider: string; company: string; explanation: string; nextAction: string; retryable: boolean }>;
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
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function duration(milliseconds: number) {
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
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
  const [autoScroll, setAutoScroll] = useState(true);
  const [startedAfter, setStartedAfter] = useState<number | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (autoScroll && running && timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [autoScroll, running, snapshot?.events.length]);

  async function start() {
    const began = Date.now();
    setStartedAfter(began - 1_000);
    setStarting(true);
    void fetch("/api/scan/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectorIds: selected }),
    }).then(async (response) => {
      if (response.status === 409) {
        setStartedAfter(null);
      }
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

  const statusLabel = starting && snapshot?.status !== "Running"
    ? "Starting"
    : snapshot?.status === "CompletedWithErrors"
      ? "Completed with warnings"
      : snapshot?.status ?? "Idle";
  const grouped = Map.groupBy(connectors, (connector) => connector.atsType);

  return (
    <>
      <section className="scan-hero">
        <div className="scan-status">
          <span className={`scan-status-dot scan-status-${statusLabel.toLowerCase().replaceAll(" ", "-")}`} />
          <div><small>Status</small><strong>{statusLabel}</strong></div>
        </div>
        <dl>
          <div><dt>Sources completed</dt><dd>{snapshot?.completed ?? 0} / {snapshot?.total ?? selected.length}</dd></div>
          <div><dt>Jobs found</dt><dd>{snapshot?.discovered ?? 0}</dd></div>
          <div><dt>Matches</dt><dd>{snapshot?.matches ?? 0}</dd></div>
          <div><dt>Failures</dt><dd>{snapshot?.failures ?? 0}</dd></div>
        </dl>
        <div className="scan-actions">
          {!running && <button className="primary-button" type="button" disabled={!selected.length} onClick={start}>Start Scan</button>}
          {running && <button className="danger-button" type="button" disabled={snapshot?.cancelRequested} onClick={cancel}>{snapshot?.cancelRequested ? "Cancelling…" : "Cancel Scan"}</button>}
          {!running && snapshot && <Link className="secondary-button button-link" href="/review">View results</Link>}
          <Link className="text-button" href="/sources">Manage sources</Link>
          <Link className="text-button" href="/searches">Manage searches</Link>
        </div>
      </section>

      <section className="scan-configuration">
        <div className="scan-section-heading">
          <div><p className="eyebrow">Run configuration</p><h2>What this scan will check</h2></div>
          <button type="button" className="text-button" onClick={() =>
            setSelected(selected.length === connectors.length ? [] : connectors.map((connector) => connector.id))}>
            {selected.length === connectors.length ? "Clear selection" : "Select all enabled"}
          </button>
        </div>
        <div className="scan-config-grid">
          <div>
            <h3>Sources to scan</h3>
            {[...grouped].map(([provider, items]) => (
              <div className="scan-provider-group" key={provider}>
                <strong>{provider}<span>{items.filter((item) => selected.includes(item.id)).length} enabled</span></strong>
                {items.map((connector) => (
                  <label key={connector.id}>
                    <input type="checkbox" checked={selected.includes(connector.id)} disabled={running} onChange={(event) =>
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
                <li key={connector.id}>
                  <strong>{connector.company}</strong>
                  <span>{connector.titles.length ? connector.titles.join(", ") : "All roles"}</span>
                  <small>{connector.locations.length ? connector.locations.join(", ") : "All locations"} · Saved work-mode settings</small>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {(running || snapshot) && (
        <section className="scan-progress-section">
          <div className="scan-section-heading">
            <div><p className="eyebrow">{running ? "Live activity" : "Scan results"}</p><h2>{running ? "Scanning enabled sources" : snapshot?.status === "Cancelled" ? "Scan cancelled" : "Scan completed"}</h2></div>
            <span>{duration(snapshot?.durationMs ?? 0)} elapsed</span>
          </div>
          <div className="scan-progress-track" aria-label={`${snapshot?.progress ?? 0}% complete`}>
            <span style={{ width: `${snapshot?.progress ?? 0}%` }} />
          </div>
          <div className="scan-metrics">
            <div><span>Sources</span><strong>{snapshot?.completed ?? 0}/{snapshot?.total ?? selected.length}</strong></div>
            <div><span>Discovered</span><strong>{snapshot?.discovered ?? 0}</strong></div>
            <div><span>Matched</span><strong>{snapshot?.matches ?? 0}</strong></div>
            <div><span>New imports</span><strong>{snapshot?.imported ?? 0}</strong></div>
            <div><span>Duplicates</span><strong>{snapshot?.duplicates ?? 0}</strong></div>
            <div><span>Excluded</span><strong>{snapshot?.excluded ?? 0}</strong></div>
            <div><span>Failures</span><strong>{snapshot?.failures ?? 0}</strong></div>
          </div>
          <div className="timeline-controls">
            <h3>Activity timeline</h3>
            {running && <label><input type="checkbox" checked={autoScroll} onChange={(event) => setAutoScroll(event.target.checked)} /> Auto-scroll</label>}
          </div>
          <div className="scan-timeline" ref={timelineRef} aria-live="polite">
            <article><time>{snapshot ? time(snapshot.startedAt) : "Now"}</time><span /><div><strong>Scan started</strong><small>{snapshot?.trigger ?? "manual"} scan</small></div></article>
            {snapshot?.events.map((event) => (
              <article key={event.id} className={`timeline-${event.tone}`}>
                <time>{time(event.timestamp)}</time><span />
                <div><strong>{event.operation}</strong><small>{event.provider} · {event.company}</small><p>{event.result}</p></div>
              </article>
            ))}
          </div>

          {!running && snapshot?.matches === 0 && (
            <div className="scan-no-results">
              <strong>No new matching opportunities were found.</strong>
              <p>{snapshot.discovered} jobs were scanned and {snapshot.excluded} excluded. Adjust saved searches if the filters are too narrow.</p>
            </div>
          )}

          {!running && snapshot && (
            <div className="scan-result-actions">
              <Link className="primary-button button-link" href="/review">Review New Opportunities</Link>
              <button className="secondary-button" type="button" onClick={start}>Run Again</button>
            </div>
          )}

          {!!snapshot?.exclusions.length && (
            <details className="scan-details">
              <summary>Why jobs were excluded ({snapshot.exclusions.length})</summary>
              {Object.entries(Object.groupBy(snapshot.exclusions, (item) => item.reason)).map(([reason, items]) => (
                <section key={reason}><h3>{reason.replaceAll("_", " ")} <span>{items?.length}</span></h3>
                  <ul>{items?.map((item) => <li key={`${item.provider}-${item.externalId}`}><strong>{item.title}</strong><span>{item.company}</span><p>{item.detail}</p></li>)}</ul>
                </section>
              ))}
            </details>
          )}

          {!!snapshot?.failureDetails.length && (
            <details className="scan-details scan-failures" open>
              <summary>Source warnings and failures ({snapshot.failureDetails.length})</summary>
              {snapshot.failureDetails.map((failure) => (
                <article key={failure.id}>
                  <span className="connector-health health-warning">{failure.provider}</span>
                  <div><strong>{failure.company}</strong><p>{failure.explanation}</p><small>{failure.nextAction} · Diagnostic ID {failure.id}</small></div>
                  {failure.retryable && <Link href="/sources">Retry source →</Link>}
                </article>
              ))}
            </details>
          )}
        </section>
      )}
    </>
  );
}
