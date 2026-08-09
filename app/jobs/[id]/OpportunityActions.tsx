"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updateJobDecision, type DecisionState } from "./actions";

const initialState: DecisionState = { status: "idle", message: "" };

export function OpportunityActions({
  jobId,
  sourceUrl,
  application,
  blocked,
}: {
  jobId: string;
  sourceUrl: string;
  application: { id: string; status: string } | null;
  /** A stated requirement conflicts with the candidate's declared facts. */
  blocked?: { headline: string };
}) {
  const [state, action, pending] = useActionState(updateJobDecision, initialState);

  async function share() {
    const data = { title: document.title, url: window.location.href };
    if (navigator.share) await navigator.share(data);
    else await navigator.clipboard.writeText(window.location.href);
  }

  // Blocked, not hidden: everything except starting an application stays
  // available, and an application already in flight is never taken away.
  const barred = Boolean(blocked) && !application;

  return (
    <div className="opportunity-actions">
      {barred ? (
        <div className="pursuit-blocked" role="status">
          <strong>⊘ Application blocked</strong>
          <span>{blocked?.headline}</span>
          <a href="#eligibility-title">See the evidence</a>
        </div>
      ) : (
        <Link className="primary-button button-link" href={application ? `/applications/${application.id}` : `/applications/new?jobId=${jobId}`}>
          {application ? `Open Application · ${application.status}` : "Begin Application"}
        </Link>
      )}
      <form action={action}>
        <input type="hidden" name="jobId" value={jobId} />
        <button className="secondary-button" name="status" value="Saved" disabled={pending}>Save</button>
        <button className="secondary-button reject-action" name="status" value="Rejected" disabled={pending}>Reject</button>
      </form>
      <Link className="secondary-button button-link" href={sourceUrl} target="_blank" rel="noreferrer">Open Original Posting</Link>
      <button className="text-button" type="button" onClick={share}>Share</button>
      <a className="text-button" href="#decision-notes">Notes</a>
      <p className={state.status === "error" ? "form-message error" : "form-message"} role="status" aria-live="polite">{state.message}</p>
    </div>
  );
}
