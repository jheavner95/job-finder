import type { PrismaClient } from "@prisma/client";
import type { DiscoveryDiagnostics } from "./job-sources/types";

function diagnostics(value: unknown): DiscoveryDiagnostics | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>).diagnostics;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as DiscoveryDiagnostics
    : null;
}

function planned(value: unknown, fallback: number) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const count = (value as Record<string, unknown>).plannedConnectors;
  return typeof count === "number" ? count : fallback;
}

function fatalError(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const error = (value as Record<string, unknown>).fatalError;
  return typeof error === "string" ? error : null;
}

export async function getScanSnapshot(database: PrismaClient, batchId?: string | null) {
  const batch = batchId
    ? await database.discoveryBatch.findUnique({
        where: { id: batchId },
        include: { crawlRuns: { include: { connector: true }, orderBy: { startedAt: "asc" } } },
      })
    : await database.discoveryBatch.findFirst({
        where: { status: "Running" },
        include: { crawlRuns: { include: { connector: true }, orderBy: { startedAt: "asc" } } },
        orderBy: { startedAt: "desc" },
      }) ?? await database.discoveryBatch.findFirst({
        include: { crawlRuns: { include: { connector: true }, orderBy: { startedAt: "asc" } } },
        orderBy: { startedAt: "desc" },
      });
  if (!batch) return null;

  const completedRuns = batch.crawlRuns.filter((run) => run.completedAt);
  const discovered = batch.crawlRuns.reduce((sum, run) => sum + run.jobsDiscovered, 0);
  const imported = batch.crawlRuns.reduce((sum, run) => sum + run.jobsImported, 0);
  const duplicates = batch.crawlRuns.reduce((sum, run) => sum + run.duplicates, 0);
  const failures = batch.crawlRuns.reduce((sum, run) => sum + run.failures, 0);
  const excluded = batch.crawlRuns.reduce((sum, run) =>
    sum + (diagnostics(run.metadata)?.excludedJobs.length ?? 0), 0);
  const closed = batch.crawlRuns.reduce((sum, run) =>
    sum + (diagnostics(run.metadata)?.closedJobs ?? 0), 0);
  const matches = imported + duplicates;
  const total = planned(batch.metadata, batch.crawlRuns.length);
  const now = batch.completedAt ?? new Date();

  const events = batch.crawlRuns.flatMap((run) => {
    const items = [{
      id: `${run.id}-start`,
      timestamp: run.startedAt.toISOString(),
      provider: run.connector.atsType,
      company: run.connector.company,
      operation: "Checking source",
      result: run.completedAt ? `${run.jobsDiscovered} jobs discovered` : "In progress",
      tone: "neutral",
    }];
    if (run.completedAt) items.push({
      id: `${run.id}-complete`,
      timestamp: run.completedAt.toISOString(),
      provider: run.connector.atsType,
      company: run.connector.company,
      operation: run.status === "Blocked" || run.status === "Failed" ? "Source failed" : "Source completed",
      result: run.lastError ?? `${run.jobsImported} imported, ${run.duplicates} duplicates`,
      tone: run.failures ? "warning" : "success",
    });
    return items;
  });

  return {
    id: batch.id,
    trigger: batch.trigger,
    status: batch.status,
    startedAt: batch.startedAt.toISOString(),
    completedAt: batch.completedAt?.toISOString() ?? null,
    cancelRequested: batch.cancelRequested,
    total,
    completed: completedRuns.length,
    progress: total ? Math.round(completedRuns.length / total * 100) : 0,
    discovered,
    matches,
    imported,
    duplicates,
    excluded,
    closed,
    failures,
    durationMs: batch.durationMs ?? now.getTime() - batch.startedAt.getTime(),
    events,
    exclusions: batch.crawlRuns.flatMap((run) =>
      (diagnostics(run.metadata)?.excludedJobs ?? []).map((job) => ({
        ...job,
        provider: run.connector.atsType,
        company: run.connector.company,
      }))),
    failureDetails: [
      ...batch.crawlRuns.filter((run) => run.failures > 0).map((run) => ({
      id: run.id,
      provider: run.connector.atsType,
      company: run.connector.company,
      explanation: run.lastError ?? "Job Finder could not complete this source.",
      nextAction: run.status === "Blocked"
        ? "Review the source access policy."
        : "Retry this source after checking its career page.",
      retryable: run.status !== "Blocked",
      })),
      ...(fatalError(batch.metadata) ? [{
        id: batch.id,
        provider: "scan",
        company: "Job scan",
        explanation: fatalError(batch.metadata) as string,
        nextAction: "Review source configuration and run the scan again.",
        retryable: true,
      }] : []),
    ],
  };
}
