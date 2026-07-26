"use client";

import { useActionState } from "react";

import { ErrorNotice } from "@/app/components/ErrorNotice";
import {
  importJobAction,
  previewJobAction,
  type ImportPreviewState,
} from "./actions";

const initialState: ImportPreviewState = {};

function FieldError({
  errors,
  id,
}: {
  errors?: string[];
  id: string;
}) {
  if (!errors?.length) return null;
  return <span className="import-error" id={id}>{errors[0]}</span>;
}

export function ImportJobsForm() {
  const [state, previewAction, pending] = useActionState(
    previewJobAction,
    initialState,
  );
  const preview = state.preview;

  return (
    <div className="import-workspace">
      <form className="import-form" action={previewAction}>
        <div className="import-form-heading">
          <p className="eyebrow">Step 1</p>
          <h2>Paste the opportunity</h2>
          <p>Enter the posting directly. The URL is stored as source context; this workspace never fetches or scrapes it.</p>
        </div>
        <div className="import-fields">
          {state.actionError && <div className="wide"><ErrorNotice error={state.actionError} level="inline" /></div>}
          <label>
            Job title
            <input name="title" defaultValue={state.values?.title} aria-describedby={state.errors?.title ? "title-error" : undefined} />
            <FieldError errors={state.errors?.title} id="title-error" />
          </label>
          <label>
            Company
            <input name="company" defaultValue={state.values?.company} aria-describedby={state.errors?.company ? "company-error" : undefined} />
            <FieldError errors={state.errors?.company} id="company-error" />
          </label>
          <label className="wide">
            Job URL
            <input name="url" type="url" placeholder="https://…" defaultValue={state.values?.url} aria-describedby={state.errors?.url ? "url-error" : undefined} />
            <FieldError errors={state.errors?.url} id="url-error" />
          </label>
          <label>
            Source
            <input name="source" placeholder="Company site, LinkedIn…" defaultValue={state.values?.source} />
          </label>
          <label>
            Salary <span>Optional</span>
            <input name="salary" placeholder="$180k–$220k" defaultValue={state.values?.salary} />
          </label>
          <label>
            Location
            <input name="location" placeholder="Remote — United States" defaultValue={state.values?.location} />
          </label>
          <label>
            Employment type
            <input name="employmentType" placeholder="Full-time" defaultValue={state.values?.employmentType} />
          </label>
          <label className="wide">
            Raw job description
            <textarea name="description" rows={16} defaultValue={state.values?.description} aria-describedby={state.errors?.description ? "description-error" : "description-help"} />
            <small id="description-help">The complete original posting is preserved exactly as submitted.</small>
            <FieldError errors={state.errors?.description} id="description-error" />
          </label>
        </div>
        <button className="primary-button import-preview-button" type="submit" disabled={pending}>
          {pending ? "Preparing preview…" : "Preview job"} <span aria-hidden="true">→</span>
        </button>
      </form>

      <section className="import-preview" aria-labelledby="import-preview-title" aria-live="polite">
        <div className="import-form-heading">
          <p className="eyebrow">Step 2</p>
          <h2 id="import-preview-title">Review before import</h2>
          <p>Review the job details and match results. Nothing is stored until you confirm.</p>
        </div>
        {preview ? (
          <>
            <div className={`duplicate-result ${state.duplicate ? "duplicate-found" : ""}`}>
              <strong>{state.duplicate ? "Duplicate detected" : "No duplicate detected"}</strong>
              <p>
                {state.duplicate
                  ? `${state.duplicate.title} at ${state.duplicate.company} will be updated with a new import event and evaluation. Its original record will not be overwritten.`
                  : "A new opportunity will be created and added to the Review Queue."}
              </p>
            </div>
            <dl className="normalized-preview">
              <div><dt>Title</dt><dd>{preview.normalized.title}</dd></div>
              <div><dt>Company</dt><dd>{preview.normalized.company}</dd></div>
              <div><dt>Work arrangement</dt><dd>{preview.normalized.remoteStatus ?? "Not supplied"}</dd></div>
              <div><dt>Location</dt><dd>{preview.normalized.location ?? "Not supplied"}</dd></div>
              <div><dt>Employment</dt><dd>{preview.normalized.employmentType ?? "Not supplied"}</dd></div>
              <div><dt>Salary</dt><dd>{preview.normalized.salary ?? "Not supplied"}</dd></div>
              <div><dt>Requirements found</dt><dd>{preview.normalized.requirements.length}</dd></div>
              <div><dt>Concerns found</dt><dd>{preview.normalized.concerns.length}</dd></div>
            </dl>
            <div className="import-evaluation">
              <div><strong>{preview.evaluation.score}</strong><span>Match score</span></div>
              <div><strong>{preview.evaluation.confidence}%</strong><span>Match confidence</span></div>
              <p>{preview.evaluation.summary}</p>
            </div>
            <form action={importJobAction}>
              {Object.entries(preview.input).map(([key, value]) => (
                <input key={key} type="hidden" name={key} value={value} />
              ))}
              <button className="primary-button import-confirm-button" type="submit">
                {state.duplicate ? "Update existing opportunity" : "Import and evaluate"} <span aria-hidden="true">→</span>
              </button>
            </form>
          </>
        ) : (
          <div className="import-preview-empty">
            <span aria-hidden="true">01</span>
            <strong>Your job preview will appear here.</strong>
            <p>Complete the required fields and preview the posting before importing.</p>
          </div>
        )}
      </section>
    </div>
  );
}
