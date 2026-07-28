import { WorkspaceLayout } from "@/app/components/PageLayout";
import { prisma } from "@/lib/db";
import { PROVIDER_CAPABILITIES } from "@/lib/job-sources/capabilities";
import { jobSourceRegistry } from "@/lib/job-sources/registry";
import { getScanSnapshot } from "@/lib/scan-presentation";

import { DiscoveryWorkspace } from "./DiscoveryWorkspace";

export const dynamic = "force-dynamic";

function diagnostics(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = (value as Record<string, unknown>).diagnostics;
  return result && typeof result === "object" && !Array.isArray(result)
    ? result as Record<string, unknown>
    : null;
}

function excludedJobs(value: unknown) {
  const valueDiagnostics = diagnostics(value);
  return Array.isArray(valueDiagnostics?.excludedJobs)
    ? valueDiagnostics.excludedJobs.filter((item): item is Record<string, unknown> =>
      !!item && typeof item === "object" && !Array.isArray(item))
    : [];
}

function dateValue(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

export default async function DiscoveryPage() {
  const [connectors, batches, snapshot, jobs] = await Promise.all([
    prisma.companyConnector.findMany({
      include: {
        schedule: true,
        crawlRuns: { orderBy: { startedAt: "desc" }, take: 12 },
      },
      orderBy: [{ atsType: "asc" }, { company: "asc" }],
    }),
    prisma.discoveryBatch.findMany({
      orderBy: { startedAt: "desc" },
      take: 12,
    }),
    getScanSnapshot(prisma),
    prisma.job.findMany({
      where: { isSynthetic: false },
      include: {
        company: true,
        source: true,
        evaluations: { orderBy: { evaluatedAt: "desc" }, take: 1 },
      },
      orderBy: { lastSeenAt: "desc" },
      take: 160,
    }),
  ]);
  const providerNames = new Map(
    jobSourceRegistry.list().map((provider) => [provider.id, provider.name]),
  );
  const certified = PROVIDER_CAPABILITIES.filter((provider) =>
    provider.implemented || provider.id === "pinpoint");

  const providers = certified.map((capability) => {
    const providerConnectors = connectors.filter((connector) =>
      connector.atsType === capability.id);
    const runs = providerConnectors.flatMap((connector) =>
      connector.crawlRuns.map((run) => ({ ...run, company: connector.company })))
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    const latest = runs[0];
    const enabled = providerConnectors.filter((connector) => connector.enabled);
    const running = runs.some((run) => !run.completedAt);
    const needsConfiguration = providerConnectors.length === 0
      || providerConnectors.some((connector) =>
        connector.credentialStatus === "Missing"
        || connector.feedStatus === "Missing");
    const blocked = capability.id === "workday"
      || latest?.status === "Blocked";
    const status = running ? "Scanning"
      : blocked ? "Blocked"
        : needsConfiguration ? "Needs Configuration"
          : !enabled.length ? "Disabled"
            : latest?.failures ? "Error"
              : "Healthy";
    const providerName = providerNames.get(capability.id) ?? capability.name;
    const providerJobs = jobs.filter((job) =>
      job.source.name.toLowerCase() === providerName.toLowerCase());
    const exclusions = runs.flatMap((run) => excludedJobs(run.metadata).map((item) => ({
      externalId: String(item.externalId ?? ""),
      title: String(item.title ?? "Untitled posting"),
      reason: String(item.reason ?? "excluded"),
      detail: String(item.detail ?? "Excluded by the configured search."),
      company: run.company,
    }))).slice(0, 40);
    const nextRun = providerConnectors
      .map((connector) => connector.schedule?.nextRunAt)
      .filter((value): value is Date => !!value)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    return {
      id: capability.id,
      name: capability.name,
      connectorType: capability.capability,
      description: capability.reason,
      status,
      implemented: capability.implemented,
      configured: providerConnectors.length,
      enabled: enabled.length,
      connectorIds: enabled.map((connector) => connector.id),
      companiesIndexed: providerConnectors.length,
      lastScan: dateValue(latest?.completedAt ?? latest?.startedAt),
      nextScan: dateValue(nextRun),
      jobsDiscovered: latest?.jobsDiscovered ?? 0,
      matchedJobs: (latest?.jobsImported ?? 0) + (latest?.duplicates ?? 0),
      duplicates: latest?.duplicates ?? 0,
      closed: providerJobs.filter((job) => job.closedAt).length,
      lastError: latest?.lastError ?? null,
      results: providerJobs.map((job) => ({
        id: job.id,
        title: job.title,
        company: job.company.name,
        location: job.location,
        score: job.evaluations[0]?.score ?? null,
        isNew: latest ? job.createdAt >= latest.startedAt : false,
        closedAt: dateValue(job.closedAt),
        lastSeenAt: dateValue(job.lastSeenAt),
      })),
      exclusions,
      history: runs.slice(0, 8).map((run) => ({
        id: run.id,
        company: run.company,
        status: run.status,
        startedAt: run.startedAt.toISOString(),
        durationMs: run.durationMs,
        discovered: run.jobsDiscovered,
        matched: run.jobsImported + run.duplicates,
        imported: run.jobsImported,
        duplicates: run.duplicates,
        failures: run.failures,
        errorCode: run.errorCode,
      })),
      connectors: providerConnectors.map((connector) => ({
        id: connector.id,
        company: connector.company,
        enabled: connector.enabled,
        health: connector.health,
        credentialStatus: connector.credentialStatus,
        feedStatus: connector.feedStatus,
      })),
    };
  });

  return (
    <WorkspaceLayout className="discovery-workspace-page">
      <DiscoveryWorkspace
        providers={providers}
        initialSnapshot={snapshot}
        recentBatches={batches.map((batch) => ({
          id: batch.id,
          status: batch.status,
          trigger: batch.trigger,
          startedAt: batch.startedAt.toISOString(),
          durationMs: batch.durationMs,
          discovered: batch.jobsDiscovered,
          matched: batch.jobsImported + batch.duplicates,
          imported: batch.jobsImported,
          duplicates: batch.duplicates,
          failures: batch.failures,
        }))}
      />
    </WorkspaceLayout>
  );
}
