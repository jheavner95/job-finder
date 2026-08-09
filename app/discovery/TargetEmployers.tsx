"use client";

import { useActionState, useState, useTransition } from "react";

import {
  addTargetsAction,
  resolveTargetsAction,
  scanTargetsAction,
  type TargetActionResult,
} from "./target-actions";
import type { TargetEmployerView } from "@/lib/job-sources/services/employer-discovery";

const stateTone: Record<string, string> = {
  Targeted: "target-state-pending",
  Resolving: "target-state-running",
  Resolved: "target-state-ok",
  Unresolved: "target-state-warn",
  Unavailable: "target-state-blocked",
};

export function TargetEmployers({ employers }: { employers: TargetEmployerView[] }) {
  const [addResult, addAction, adding] = useActionState<TargetActionResult | null, FormData>(
    addTargetsAction,
    null,
  );
  const [busy, startTransition] = useTransition();
  const [notice, setNotice] = useState<TargetActionResult | null>(null);

  const resolved = employers.filter((employer) => employer.state === "Resolved");
  const outstanding = employers.filter((employer) =>
    employer.state === "Targeted" || employer.state === "Unresolved");

  function run(action: () => Promise<TargetActionResult>) {
    startTransition(async () => setNotice(await action()));
  }

  return (
    <section className="target-employers" aria-labelledby="target-employers-title">
      <header className="discovery-section-heading">
        <div>
          <p className="eyebrow">Employers you choose</p>
          <h2 id="target-employers-title">Target Employers</h2>
        </div>
        <span className="coverage-note">
          Companies you specifically want Job Finder to watch, whether or not they appear in any public feed.
        </span>
      </header>

      <form action={addAction} className="target-add-form">
        <label className="sr-only" htmlFor="target-employers-input">Company names or ATS URLs</label>
        <textarea
          id="target-employers-input"
          name="employers"
          rows={2}
          placeholder="One per line, or comma separated — e.g. Figma, Brex, Coinbase. An ATS board URL also works."
        />
        <div className="target-add-actions">
          <button className="primary-button" type="submit" disabled={adding}>
            {adding ? "Adding…" : "Add target employers"}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={busy || !outstanding.length}
            onClick={() => run(resolveTargetsAction)}
          >
            {busy ? "Working…" : `Find boards (${outstanding.length})`}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={busy || !resolved.length}
            onClick={() => run(scanTargetsAction)}
          >
            Scan {resolved.length} target board{resolved.length === 1 ? "" : "s"}
          </button>
        </div>
        {(addResult ?? notice) && (
          <p className={`target-notice ${(notice ?? addResult)?.ok ? "is-ok" : "is-warn"}`}>
            {(notice ?? addResult)?.message}
          </p>
        )}
      </form>

      {employers.length > 0 ? (
        // Scrolls within itself: at high zoom the six columns exceed the
        // viewport, and without this the whole page scrolls sideways.
        <div className="target-table-scroll">
        <table className="target-table">
          <thead>
            <tr>
              <th scope="col">Company</th>
              <th scope="col">State</th>
              <th scope="col">Provider</th>
              <th scope="col">Board</th>
              <th scope="col">Validation</th>
              <th scope="col">Postings</th>
            </tr>
          </thead>
          <tbody>
            {employers.map((employer) => (
              <tr key={employer.id}>
                <th scope="row">{employer.name}</th>
                <td><span className={stateTone[employer.state]}>{employer.state}</span></td>
                <td>{employer.provider ?? "—"}</td>
                <td>
                  {employer.careerUrl && employer.boardToken
                    ? <a href={employer.careerUrl} target="_blank" rel="noreferrer">{employer.boardToken}</a>
                    : employer.boardToken ?? "—"}
                </td>
                <td>{employer.validationStatus ?? "—"}</td>
                <td>{employer.jobsAvailable ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : (
        <p className="target-empty">
          No target employers yet. Add the companies you most want watched — these are resolved and
          scanned independently of the wider registry.
        </p>
      )}
    </section>
  );
}
