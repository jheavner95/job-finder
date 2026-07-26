import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page">
      <div className="empty-state">
        <strong>This page could not be found.</strong>
        <p>The address may be outdated, but your private data has not changed.</p>
        <Link className="primary-button button-link" href="/">Go to Dashboard</Link>
      </div>
    </main>
  );
}
