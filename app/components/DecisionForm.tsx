"use client";

import { useActionState } from "react";
import type { JobStatus } from "@/lib/types";
import { updateJobDecision, type DecisionState } from "@/app/jobs/[id]/actions";

const statuses: JobStatus[] = [
  "New",
  "Strong Match",
  "Possible",
  "Rejected",
  "Saved",
  "Applied",
  "Interviewing",
  "Offer",
  "Closed",
];

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
        <select name="status" defaultValue={currentStatus} disabled={pending}>
          {statuses.map((status) => <option key={status}>{status}</option>)}
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
