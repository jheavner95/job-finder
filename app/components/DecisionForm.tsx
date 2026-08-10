"use client";

import { useActionState } from "react";
import type { JobStatus } from "@/lib/types";
import { updateJobDecision, type DecisionState } from "@/app/jobs/[id]/actions";

/**
 * The decisions a person makes, not the engine's classification enum.
 *
 * "New", "Strong Match" and "Possible" are discovery states the scorer assigns;
 * offering them as choices invited the user to overwrite a measurement with an
 * opinion, and none of the surfaces read them as decisions anyway.
 */
const statuses: JobStatus[] = [
  "Saved",
  "Applied",
  "Interviewing",
  "Offer",
  "Rejected",
  "Closed",
];

const DECISION_HELP: Partial<Record<JobStatus, string>> = {
  Rejected: "Passing on it, or not selected after applying",
  Closed: "The posting is gone or you withdrew",
};

const initialState: DecisionState = { status: "idle", message: "" };

export function DecisionForm({
  jobId,
  currentStatus,
}: {
  jobId: string;
  currentStatus: JobStatus;
}) {
  const [state, action, pending] = useActionState(updateJobDecision, initialState);
  return (
    <form className="decision-panel" action={action}>
      <input type="hidden" name="jobId" value={jobId} />
      <p className="eyebrow">Your decision</p>
      <h2>Move this opportunity</h2>
      <p>Automated evaluation stays separate from your decision.</p>
      <label>
        Status
        <select name="status" defaultValue={statuses.includes(currentStatus) ? currentStatus : "Saved"} disabled={pending}>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {DECISION_HELP[status] ? `${status} — ${DECISION_HELP[status]}` : status}
            </option>
          ))}
        </select>
      </label>
      <label>
        Private note
        <textarea name="note" placeholder="Add your reasoning or next step…" disabled={pending} />
      </label>
      <button className="primary-button full" disabled={pending}>
        {pending ? "Saving…" : "Save decision"}
      </button>
      <p
        className={state.status === "error" ? "form-message error" : "form-message"}
        role="status"
        aria-live="polite"
      >
        {state.message}
      </p>
      <span className="safe-note">Nothing is sent to an employer.</span>
    </form>
  );
}
