import { PageHeader } from "@/app/components/PageHeader";
import { WorkspaceLayout } from "@/app/components/PageLayout";
import { prisma } from "@/lib/db";
import { PROVIDER_CAPABILITIES } from "@/lib/job-sources/capabilities";
import { jobSourceRegistry } from "@/lib/job-sources/registry";
import { isReviewable, resolveTier } from "@/lib/opportunity-tiers";
import { listTargetEmployers } from "@/lib/job-sources/services/employer-discovery";
import { getScanSnapshot } from "@/lib/scan-presentation";

import { DiscoveryWorkspace } from "./DiscoveryWorkspace";
import { TargetEmployers } from "./TargetEmployers";

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

function dispositions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const items = (value as Record<string, unknown>).dispositions;
  return Array.isArray(items)
    ? items.filter((item): item is Record<string, unknown> =>
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
    // No cap. A cap here silently hid the oldest-seen jobs from every Discovery
    // bucket and every Discovery count once the database grew.
    prisma.job.findMany({
      where: { isSynthetic: false },
      include: {
        company: true,
        source: true,
        evaluations: { orderBy: { evaluatedAt: "desc" }, take: 1 },
      },
      orderBy: { lastSeenAt: "desc" },
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
    const latestRuns = latest?.batchId
      ? runs.filter((run) => run.batchId === latest.batchId)
      : latest ? [latest] : [];
    const latestDispositions = latestRuns.flatMap((run) => dispositions(run.metadata));
    const latestDiscovered = latestRuns.reduce((sum, run) => sum + run.jobsDiscovered, 0);
    const latestImported = latestRuns.reduce((sum, run) => sum + run.jobsImported, 0);
    const latestDuplicates = latestRuns.reduce((sum, run) => sum + run.duplicates, 0);
    const latestFailures = latestRuns.reduce((sum, run) => sum + run.failures, 0);
    const latestError = latestRuns.find((run) => run.lastError)?.lastError ?? null;
    const enabled = providerConnectors.filter((connector) => connector.enabled);
    const running = runs.some((run) => !run.completedAt);
    const needsConfiguration = providerConnectors.length === 0
      || providerConnectors.some((connector) =>
        connector.credentialStatus === "Missing"
        || connector.feedStatus === "Missing");
    const blocked = capability.id === "workday"
      || latestRuns.some((run) => run.status === "Blocked");
    const status = running ? "Scanning"
      : blocked ? "Blocked"
        : needsConfiguration ? "Needs Configuration"
          : !enabled.length ? "Disabled"
            : latestFailures ? "Error"
              : "Healthy";
    const providerName = providerNames.get(capability.id) ?? capability.name;
    const providerJobs = jobs.filter((job) =>
      job.source.name.toLowerCase() === providerName.toLowerCase());
    // Effective coverage, not nominal support: how many employer boards this
    // provider actually reaches and what they actually yield.
    const coverage = {
      boardsKnown: providerConnectors.length,
      boardsValidated: providerConnectors.filter((connector) =>
        connector.validationStatus === "Validated").length,
      boardsFetched: providerConnectors.filter((connector) =>
        connector.lastSuccessfulFetch).length,
      boardsStale: providerConnectors.filter((connector) =>
        connector.validationStatus === "Stale" || connector.validationStatus === "Failed").length,
      jobsReachable: providerConnectors.reduce((sum, connector) =>
        sum + connector.jobsAvailable, 0),
      designRoles: providerJobs.filter((job) => !job.closedAt).length,
      reviewable: providerJobs.filter((job) => !job.closedAt
        && isReviewable(resolveTier(
          job.evaluations[0]?.score ?? 0,
          job.evaluations[0]?.reasoning,
        ))).length,
      autoDiscovered: providerConnectors.filter((connector) =>
        connector.discoverySource.startsWith("auto:")).length,
    };
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
      coverage,
      lastScan: dateValue(latest?.completedAt ?? latest?.startedAt),
      nextScan: dateValue(nextRun),
      jobsDiscovered: latestDiscovered,
      matchedJobs: latestImported + latestDuplicates,
      duplicates: latestDuplicates,
      closed: providerJobs.filter((job) => job.closedAt).length,
      lastError: latestError,
      accounting: {
        discovered: latestDiscovered,
        imported: latestDispositions.filter((item) => item.disposition === "IMPORTED").length,
        duplicates: latestDispositions.filter((item) => item.disposition === "DUPLICATE").length,
        excluded: latestDispositions.filter((item) => item.disposition === "EXCLUDED").length,
        invalid: latestDispositions.filter((item) => item.disposition === "INVALID").length,
        normalizationFailed: latestDispositions.filter((item) =>
          item.disposition === "NORMALIZATION_FAILED").length,
        persistenceFailed: latestDispositions.filter((item) =>
          item.disposition === "PERSISTENCE_FAILED").length,
      },
      dispositions: latestDispositions.map((item) => ({
        externalId: String(item.externalId ?? ""),
        title: String(item.title ?? "Untitled posting"),
        disposition: String(item.disposition ?? "INVALID"),
        score: typeof item.score === "number" ? item.score : null,
        errorCode: typeof item.errorCode === "string" ? item.errorCode : null,
        message: typeof item.message === "string" ? item.message : null,
        jobId: typeof item.jobId === "string" ? item.jobId : null,
      })),
      results: providerJobs.map((job) => ({
        id: job.id,
        title: job.title,
        company: job.company.name,
        location: job.location,
        score: job.evaluations[0]?.score ?? null,
        tier: resolveTier(job.evaluations[0]?.score ?? 0, job.evaluations[0]?.reasoning),
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

  const openJobs = jobs.filter((job) => !job.closedAt);
  const coverage = {
    employersKnown: connectors.length,
    employersAutoDiscovered: connectors.filter((connector) =>
      connector.discoverySource.startsWith("auto:")).length,
    boardsEnabled: connectors.filter((connector) => connector.enabled).length,
    boardsFetched: connectors.filter((connector) => connector.lastSuccessfulFetch).length,
    boardsNeedingAttention: connectors.filter((connector) =>
      connector.validationStatus === "Stale" || connector.validationStatus === "Failed").length,
    jobsReachable: connectors.reduce((sum, connector) => sum + connector.jobsAvailable, 0),
    providersContributing: providers.filter((provider) => provider.coverage.designRoles > 0).length,
    providersRegistered: providerNames.size,
    designRoles: openJobs.length,
    reviewable: openJobs.filter((job) => isReviewable(resolveTier(
      job.evaluations[0]?.score ?? 0,
      job.evaluations[0]?.reasoning,
    ))).length,
    candidatesPending: await prisma.employerCandidate.count({ where: { status: "Pending" } }),
  };
  const targetEmployers = await listTargetEmployers(prisma);

  return (
    <WorkspaceLayout className="discovery-workspace-page">
      <PageHeader
        title="Sources"
        subtitle="Which providers Job Finder reads, how much of the market they reach, and where boards are still being resolved."
      />
      {/*
       * Board resolution, not a company list.
       *
       * DE-4 found two employer models. They turned out to be different things
       * wearing the same clothes: `CompanyConnector` is the user's watchlist of
       * 403 monitored companies and now lives on Companies, while
       * `EmployerCandidate` is a queue of 1,353 names the engine is trying to
       * resolve to a public board — 922 still pending. That queue is machinery
       * and belongs here.
       */}
      <TargetEmployers employers={targetEmployers} />
      <DiscoveryWorkspace
        providers={providers}
        coverage={coverage}
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
