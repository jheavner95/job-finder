"use client";

import { useActionState } from "react";

import {
  addCompanyConnectorAction,
  validateCompanySourceAction,
  type CompanyValidationState,
} from "./actions";

const initialState: CompanyValidationState = { status: "idle" };

export function AddCompanyForm() {
  const [state, validateAction, validating] = useActionState(
    validateCompanySourceAction,
    initialState,
  );

  return (
    <div className="company-add-workflow">
      <form action={validateAction} className="company-detection-form">
        <label>
          Company
          <input
            name="company"
            required
            maxLength={300}
            defaultValue={state.company}
            placeholder="OpenAI"
          />
        </label>
        <label>
          Career URL
          <input
            name="careerUrl"
            required
            type="url"
            defaultValue={state.careerUrl}
            placeholder="https://careers.example.com"
          />
        </label>
        <button className="primary-button" type="submit" disabled={validating}>
          {validating ? "Detecting…" : "Detect and validate"}
        </button>
      </form>

      {state.status !== "idle" && (
        <section
          className={`company-validation validation-${state.status}`}
          aria-live="polite"
          aria-labelledby="validation-result-title"
        >
          <div className="validation-heading">
            <div>
              <p className="eyebrow">Validation result</p>
              <h3 id="validation-result-title">
                {state.status === "verified" ? "Connection verified" : "Connection needs attention"}
              </h3>
            </div>
            <span>{state.status === "verified" ? "Verified" : "Blocked"}</span>
          </div>
          {state.message && <p>{state.message}</p>}
          <ul className="validation-checks">
            {(state.checks ?? []).map((check) => (
              <li key={check.label} className={check.ok ? "check-pass" : "check-fail"}>
                <span aria-hidden="true">{check.ok ? "✓" : "!"}</span>
                <div><strong>{check.label}</strong><small>{check.detail}</small></div>
              </li>
            ))}
          </ul>
          {state.status === "verified" && state.detection && (
            <form action={addCompanyConnectorAction} className="verified-save">
              <input type="hidden" name="company" value={state.company} />
              <input type="hidden" name="careerUrl" value={state.careerUrl} />
              <input type="hidden" name="providerId" value={state.detection.providerId} />
              <input type="hidden" name="connectorKey" value={state.detection.connectorKey} />
              <input type="hidden" name="crawlDelay" value="1000" />
              <input type="hidden" name="rateLimit" value="60" />
              <button className="primary-button" type="submit">Follow company</button>
              <small>
                {state.jobsDiscovered} public {state.jobsDiscovered === 1 ? "job" : "jobs"} found
              </small>
            </form>
          )}
          {state.diagnosticId && <small className="diagnostic-id">Diagnostic ID {state.diagnosticId}</small>}
        </section>
      )}
    </div>
  );
}
