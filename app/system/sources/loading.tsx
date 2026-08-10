import { WorkspaceLayout } from "@/app/components/PageLayout";

export default function SourcesLoading() {
  return (
    <WorkspaceLayout className="discovery-workspace-page">
      <div className="discovery-skeleton skeleton-title" />
      <div className="discovery-skeleton skeleton-summary" />
      <div className="discovery-skeleton-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="discovery-skeleton skeleton-card" key={index} />
        ))}
      </div>
    </WorkspaceLayout>
  );
}
