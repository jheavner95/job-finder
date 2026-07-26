export default function ReviewLoading() {
  return (
    <div className="page" role="status" aria-live="polite">
      <p className="eyebrow">Loading</p>
      <h1 className="loading-title">Preparing your review queue…</h1>
      <div className="loading-stack" aria-hidden="true">
        <span /><span /><span />
      </div>
    </div>
  );
}
