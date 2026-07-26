"use client";

import { useState } from "react";

import { diagnosticText, type AppError } from "@/lib/errors/app-error";

export function ErrorNotice({
  error,
  retry,
  level = "page",
}: {
  error: AppError;
  retry?: () => void;
  level?: "inline" | "page" | "fatal";
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(diagnosticText(error));
    setCopied(true);
  };
  return (
    <section className={`app-error app-error-${level}`} role="alert" aria-labelledby={`error-${error.diagnosticId}`}>
      <div>
        <p className="eyebrow">{error.code.replaceAll("_", " ")}</p>
        <h2 id={`error-${error.diagnosticId}`}>{error.title}</h2>
        <p>{error.message}</p>
        <strong>{error.nextAction}</strong>
      </div>
      <div className="app-error-actions">
        {retry && error.retryable && <button className="primary-button" onClick={retry}>Try again</button>}
        <button className="secondary-button" onClick={copy}>{copied ? "Copied" : "Copy diagnostic details"}</button>
      </div>
      <details>
        <summary>Technical details</summary>
        <pre>{diagnosticText(error)}</pre>
      </details>
    </section>
  );
}
