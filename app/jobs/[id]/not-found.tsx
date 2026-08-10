import Link from "next/link";

export default function JobNotFound() {
  return (
    <div className="page">
      <div className="empty-state">
        <strong>Job not found</strong>
        <p>The record may have been removed or the link is invalid.</p>
        <Link className="primary-button button-link" href="/review">Back to Opportunities</Link>
      </div>
    </div>
  );
}
