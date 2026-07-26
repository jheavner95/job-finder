export function WorkspaceSkeleton({ label = "Loading workspace" }: { label?: string }) {
  return (
    <div className="page workspace-loading" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="skeleton skeleton-kicker" aria-hidden="true" />
      <div className="skeleton skeleton-title" aria-hidden="true" />
      <div className="skeleton skeleton-subtitle" aria-hidden="true" />
      <div className="skeleton-grid" aria-hidden="true">
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card skeleton-card-wide" />
      </div>
    </div>
  );
}
