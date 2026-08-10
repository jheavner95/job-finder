"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updateJobDecision, type DecisionState } from "./actions";

const initialState: DecisionState = { status: "idle", message: "" };

/**
 * What the user can decide about this opportunity, and what they can record
 * about the application once they have applied.
 *
 * Before UX-4 the primary button read "Begin Application" and led to a
 * conversion form that created a row in a separate `Application` table — so a
 * role the user had already marked applied still invited them to begin
 * applying to it. Applying is a decision, recorded like every other decision,
 * and the application is what that decision becomes.
 */
export function OpportunityActions({
  jobId,
  sourceUrl,
  applicationState,
  blocked,
}: {
  jobId: string;
  sourceUrl: string;
  /** The derived application state, or null when this is not an application. */
  applicationState: string | null;
  /** A stated requirement conflicts with the candidate's declared facts. */
  blocked?: { headline: string };
}) {
  const [state, action, pending] = useActionState(updateJobDecision, initialState);

  async function share() {
    const data = { title: document.title, url: window.location.href };
    if (navigator.share) await navigator.share(data);
    else await navigator.clipboard.writeText(window.location.href);
  }

  const applied = applicationState !== null;
  // Blocked, not hidden: everything except applying stays available, and an
  // application already in flight is never taken away.
  const barred = Boolean(blocked) && !applied;

  return (
    <div className="opportunity-actions">
      {barred && (
        <div className="pursuit-blocked" role="status">
          <strong>⊘ Application blocked</strong>
          <span>{blocked?.headline}</span>
          <a href="#eligibility-title">See the evidence</a>
        </div>
      )}

      <form action={action}>
        <input type="hidden" name="jobId" value={jobId} />
        {applied ? (
          /*
           * The next thing that could truthfully happen, and the way it could
           * end. Not a stage picker — there is no "Recruiter Screen" here
           * because nothing in this product would do anything with one.
           */
          <>
            {applicationState !== "offer" && (
              <button className="primary-button" name="status" value="Interviewing" disabled={pending}>
                {applicationState === "interviewing" ? "Still interviewing" : "Interviewing"}
              </button>
            )}
            {applicationState !== "offer" && (
              <button className="secondary-button" name="status" value="Offer" disabled={pending}>
                Got an offer
              </button>
            )}
            {applicationState !== "closed" && (
              <button className="secondary-button reject-action" name="status" value="Rejected" disabled={pending}>
                Not selected
              </button>
            )}
          </>
        ) : (
          <>
            {!barred && (
              <button className="primary-button" name="status" value="Applied" disabled={pending}>
                Mark as applied
              </button>
            )}
            <button className="secondary-button" name="status" value="Saved" disabled={pending}>
              Save
            </button>
            <button className="secondary-button reject-action" name="status" value="Rejected" disabled={pending}>
              Pass
            </button>
          </>
        )}
      </form>

      <Link className="secondary-button button-link" href={sourceUrl} target="_blank" rel="noreferrer">
        Open Original Posting
      </Link>
      {applied && (
        <Link className="text-button" href="/applications">
          All applications
        </Link>
      )}
      <button className="text-button" type="button" onClick={share}>Share</button>
      <a className="text-button" href="#decision-notes">Notes</a>
      <p className={state.status === "error" ? "form-message error" : "form-message"} role="status" aria-live="polite">{state.message}</p>
    </div>
  );
}
