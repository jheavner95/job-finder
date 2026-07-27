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
      <div className="scan-overview">
        <div><small>Last scan</small><strong>{date(batches.find((batch) => batch.status !== "Running")?.completedAt)}</strong></div>
        <div><small>Next scheduled scan</small><strong>{nextSchedule?.nextRunAt ? date(nextSchedule.nextRunAt) : "Manual only"}</strong></div>
        <div><small>Enabled sources</small><strong>{connectors.length}</strong></div>
      </div>
      <ScanControl initial={snapshot} connectors={connectorProps} />

      <section className="scan-history">
        <div className="scan-section-heading"><div><p className="eyebrow">History</p><h2>Recent scans</h2></div></div>
        <div className="sources-table-wrap">
          <table className="sources-table">
            <thead><tr><th>Started</th><th>Trigger</th><th>Status</th><th>Sources</th><th>Jobs found</th><th>Matches</th><th>Imports</th><th>Duplicates</th><th>Failures</th><th>Duration</th></tr></thead>
            <tbody>{batches.map((batch) => (
              <tr key={batch.id}>
                <td><Link href={`/scan?batchId=${batch.id}`}>{date(batch.startedAt)}</Link></td>
                <td>{batch.trigger}</td><td>{batch.status}</td><td>{batch.connectorsRun}</td>
                <td>{batch.jobsDiscovered}</td><td>{batch.jobsImported + batch.duplicates}</td>
                <td>{batch.jobsImported}</td><td>{batch.duplicates}</td><td>{batch.failures}</td>
                <td>{batch.durationMs === null ? "—" : `${Math.round(batch.durationMs / 1000)}s`}</td>
              </tr>
            ))}{!batches.length && <tr><td className="sources-empty" colSpan={10}>Job Finder has not scanned for opportunities yet.</td></tr>}</tbody>
          </table>
        </div>
      </section>
    </WorkspaceLayout>
  );
}
