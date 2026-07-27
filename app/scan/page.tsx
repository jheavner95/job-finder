import Link from "next/link";
import { PageHeader } from "@/app/components/PageHeader";
import { WorkspaceLayout } from "@/app/components/PageLayout";
import { prisma } from "@/lib/db";
import { getScanSnapshot } from "@/lib/scan-presentation";
import { ScanControl } from "./ScanControl";

export const dynamic = "force-dynamic";

function date(value: Date | string | null | undefined) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(value));
}

function historyDate(value: Date) {
  const today = new Date();
  const day = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(value);
  return value.toDateString() === today.toDateString() ? "Today" : day;
}

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ batchId?: string }>;
}) {
  const params = await searchParams;
  const [snapshot, connectors, batches, nextSchedule] = await Promise.all([
    getScanSnapshot(prisma, params.batchId),
    prisma.companyConnector.findMany({
      where: { enabled: true },
      orderBy: [{ atsType: "asc" }, { company: "asc" }],
    }),
    prisma.discoveryBatch.findMany({ orderBy: { startedAt: "desc" }, take: 15 }),
    prisma.connectorSchedule.findFirst({
      where: { nextRunAt: { not: null }, connector: { enabled: true } },
      orderBy: { nextRunAt: "asc" },
    }),
  ]);
  const connectorProps = connectors.map((connector) => {
    const criteria = connector.searchCriteria && typeof connector.searchCriteria === "object"
      && !Array.isArray(connector.searchCriteria)
      ? connector.searchCriteria as Record<string, unknown>
      : {};
    return {
      id: connector.id,
      company: connector.company,
      atsType: connector.atsType,
      titles: Array.isArray(criteria.titles) ? criteria.titles.filter((item): item is string => typeof item === "string") : [],
      locations: Array.isArray(criteria.locations) ? criteria.locations.filter((item): item is string => typeof item === "string") : [],
    };
  });

  return (
    <WorkspaceLayout className="scan-page">
      <PageHeader title="Scan Jobs" subtitle="Review what will run, start discovery, and monitor real provider activity." />
      <section className={`automation-header ${nextSchedule?.nextRunAt ? "automation-enabled" : "automation-manual"}`}>
        <div className="automation-state">
          <span aria-hidden="true">{nextSchedule?.nextRunAt ? "✓" : "○"}</span>
          <div><small>{nextSchedule?.nextRunAt ? "Automatic scanning" : "Manual mode"}</small><strong>{nextSchedule?.nextRunAt ? "Enabled" : "Automatic scanning is disabled."}</strong></div>
        </div>
        <div><small>{nextSchedule?.nextRunAt ? "Next scan" : "Last scan"}</small><strong>{nextSchedule?.nextRunAt ? date(nextSchedule.nextRunAt) : date(batches.find((batch) => batch.status !== "Running")?.completedAt)}</strong></div>
        <div><small>Enabled sources</small><strong>{connectors.length}</strong></div>
        <Link className="secondary-button button-link" href="/searches">Configure schedule</Link>
      </section>
      <ScanControl initial={snapshot} connectors={connectorProps} />

      <section className="scan-history">
        <div className="scan-section-heading"><div><p className="eyebrow">History</p><h2>Recent scans</h2></div></div>
        <div className="history-card-list">{batches.map((batch) => (
          <Link href={`/scan?batchId=${batch.id}`} key={batch.id} className={params.batchId === batch.id ? "selected" : ""}>
            <div><strong>{historyDate(batch.startedAt)}</strong><small>{date(batch.startedAt)} · {batch.trigger}</small></div>
            <dl>
              <div><dd>{batch.jobsDiscovered}</dd><dt>scanned</dt></div>
              <div><dd>{batch.jobsImported + batch.duplicates}</dd><dt>matched</dt></div>
              <div><dd>{batch.jobsImported}</dd><dt>new</dt></div>
              <div><dd>{batch.duplicates}</dd><dt>duplicates</dt></div>
            </dl>
            <span>{batch.status === "CompletedWithErrors" ? "Warnings" : batch.status}<small>{batch.durationMs === null ? "—" : `${(batch.durationMs / 1000).toFixed(1)} sec`}</small></span>
          </Link>
        ))}{!batches.length && <div className="sources-empty">Job Finder has not scanned for opportunities yet.</div>}</div>
      </section>
    </WorkspaceLayout>
  );
}
