"use client";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page">
      <div className="empty-state" role="alert">
        <strong>We couldn’t load this workspace.</strong>
        <p>Confirm the SQLite database is available, then try again.</p>
        <button className="primary-button" onClick={reset}>Try again</button>
      </div>
    </div>
  );
}
