import type { PrismaClient } from "@prisma/client";

import { jobSourceRegistry, type JobSourceRegistry } from "../job-sources/registry";
import { ProviderDiscoveryRunner } from "../job-sources/services/provider-discovery";
import type { CrawlSummary } from "../job-sources/types";
import { errorPersistence } from "../job-sources/errors";
import {
  InAppNotificationPublisher,
  type NotificationPublisher,
} from "../notifications/service";
import { nextRunAt, type ScheduleType } from "./schedule";

const LOCK_ID = "discovery-scheduler";
const LOCK_TIMEOUT_MS = 60 * 60 * 1_000;
/**
 * Connectors run concurrently, but bounded. Employer discovery took the board
 * count from a handful into the hundreds; an unbounded fan-out would open one
 * request per board at once, which is impolite to the provider APIs and starves
 * SQLite of write slots.
 */
const DEFAULT_MAX_CONCURRENCY = 5;

/**
 * Resident-set ceiling for a discovery run. Above this the scheduler stops
 * claiming NEW connectors; work already in flight finishes normally, the batch
 * closes through its usual path, and the scheduler lease is released. Nothing
 * is killed mid-transaction and no persisted work is discarded — connectors
 * that were never claimed simply did not run this batch.
 */
const DEFAULT_MEMORY_CEILING_MB = Number(process.env.DISCOVERY_MEMORY_CEILING_MB ?? 1200);

function residentMegabytes() {
  return process.memoryUsage().rss / (1024 * 1024);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
  onStop?: (info: { claimed: number; total: number; rssMb: number }) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let halted = false;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      if (halted) return;
      // Checked between whole connectors — never inside one.
      const rssMb = residentMegabytes();
      if (rssMb > DEFAULT_MEMORY_CEILING_MB) {
        if (!halted) {
          halted = true;
          onStop?.({ claimed: Math.min(cursor, items.length), total: items.length, rssMb });
        }
        return;
      }
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

type SchedulerTrigger = "manual" | "scheduled";

export type SchedulerResult = CrawlSummary & {
  batchId: string;
  status: "Completed" | "CompletedWithErrors" | "Cancelled" | "Failed" | "SkippedConcurrent";
};

export class DiscoveryScheduler {
  constructor(
    private readonly database: PrismaClient,
    private readonly client: typeof fetch = fetch,
    private readonly registry: JobSourceRegistry = jobSourceRegistry,
    private readonly notifications: NotificationPublisher =
      new InAppNotificationPublisher(database),
    private readonly maxConcurrency: number = DEFAULT_MAX_CONCURRENCY,
  ) {}

  async run(options: {
    trigger: SchedulerTrigger;
    connectorIds?: string[];
    now?: Date;
  }): Promise<SchedulerResult> {
    const now = options.now ?? new Date();
    const lockToken = crypto.randomUUID();
    if (!await this.acquireLock(lockToken, now)) {
      const batch = await this.database.discoveryBatch.create({
        data: {
          trigger: options.trigger,
          status: "SkippedConcurrent",
          completedAt: now,
          durationMs: 0,
          metadata: { reason: "Another discovery run already holds the scheduler lease." },
        },
      });
      return {
        batchId: batch.id,
        status: "SkippedConcurrent",
        companiesProcessed: 0,
        jobsDiscovered: 0,
        jobsImported: 0,
        duplicates: 0,
        failures: 0,
        durationMs: 0,
      };
    }

    const startedAt = new Date();
    const batch = await this.database.discoveryBatch.create({
      data: { trigger: options.trigger, status: "Running", startedAt },
    });
    const summary: CrawlSummary = {
      companiesProcessed: 0,
      jobsDiscovered: 0,
      jobsImported: 0,
      duplicates: 0,
      failures: 0,
      durationMs: 0,
    };

    try {
      const connectors = await this.connectorsFor(options, now);
      await this.database.discoveryBatch.update({
        where: { id: batch.id },
        data: {
          metadata: {
            selectedConnectorIds: connectors.map((connector) => connector.id),
            plannedConnectors: connectors.length,
          },
        },
      });
      let memoryStop: { claimed: number; total: number; rssMb: number } | null = null;
      const connectorResults = await mapWithConcurrency(connectors, this.maxConcurrency, async (connector) => {
        const cancellation = await this.database.discoveryBatch.findUnique({
          where: { id: batch.id },
          select: { cancelRequested: true },
        });
        if (cancellation?.cancelRequested) return null;
        try {
          const result = await new ProviderDiscoveryRunner(
            this.database,
            connector.atsType,
            this.client,
            this.registry,
            {
              connectorIds: [connector.id],
              batchId: batch.id,
              trigger: options.trigger,
            },
          ).run();
          if (result.failures > 0) {
            await this.notifications.publish({
              type: "connector_failure",
              title: `${connector.company} discovery needs attention`,
              message: `${result.failures} failure${result.failures === 1 ? "" : "s"} occurred during ${connector.atsType} discovery.`,
              href: "/sources",
              metadata: {
                batchId: batch.id,
                provider: connector.atsType,
                company: connector.company,
              },
            });
          }
          return result;
        } catch (error) {
          const typed = errorPersistence(error);
          const completedAt = new Date();
          await this.database.$transaction([
            this.database.connectorCrawl.create({
              data: {
                connectorId: connector.id,
                batchId: batch.id,
                status: "Failed",
                startedAt: completedAt,
                completedAt,
                durationMs: 0,
                failures: 1,
                lastError: typed.providerMessage,
                errorCode: typed.errorCode,
                providerMessage: typed.providerMessage,
                diagnosticContext: typed.diagnosticContext,
                metadata: {
                  provider: connector.atsType,
                  company: connector.company,
                  trigger: options.trigger,
                  isolatedBy: "discovery-scheduler",
                },
              },
            }),
            this.database.companyConnector.update({
              where: { id: connector.id },
              data: {
                health: "Error",
                lastChecked: completedAt,
                notes: typed.providerMessage,
              },
            }),
          ]);
          await this.notifications.publish({
            type: "connector_failure",
            title: `${connector.company} discovery failed`,
            message: typed.providerMessage,
            href: "/sources",
            metadata: {
              batchId: batch.id,
              provider: connector.atsType,
              company: connector.company,
            },
          });
          return {
            companiesProcessed: 1,
            jobsDiscovered: 0,
            jobsImported: 0,
            duplicates: 0,
            failures: 1,
            durationMs: 0,
          };
        } finally {
          if (options.trigger === "scheduled" && connector.schedule) {
            await this.database.connectorSchedule.update({
              where: { connectorId: connector.id },
              data: {
                lastRunAt: now,
                nextRunAt: nextRunAt({
                  scheduleType: connector.schedule.scheduleType as ScheduleType,
                  timeOfDay: connector.schedule.timeOfDay,
                  weekday: connector.schedule.weekday,
                  intervalMinutes: connector.schedule.intervalMinutes,
                }, now),
              },
            });
          }
        }
      }, (info) => { memoryStop = info; });
      connectorResults.forEach((result) => {
        if (result) this.addSummary(summary, result);
      });
      if (memoryStop) {
        const stop = memoryStop as { claimed: number; total: number; rssMb: number };
        await this.notifications.publish({
          type: "connector_failure",
          title: "Discovery stopped early to protect memory",
          message: `Resident memory reached ${Math.round(stop.rssMb)}MB, so the run stopped after ${stop.claimed} of ${stop.total} boards. Completed boards were saved; the remainder will be picked up on the next run.`,
          href: "/discovery",
          metadata: { batchId: batch.id, claimed: stop.claimed, total: stop.total, rssMb: Math.round(stop.rssMb) },
        });
      }

      const completedAt = new Date();
      const cancellation = await this.database.discoveryBatch.findUnique({
        where: { id: batch.id },
        select: { cancelRequested: true },
      });
      const status = cancellation?.cancelRequested
        ? "Cancelled"
        : summary.failures ? "CompletedWithErrors" : "Completed";
      summary.durationMs = completedAt.getTime() - startedAt.getTime();
      await this.database.discoveryBatch.update({
        where: { id: batch.id },
        data: {
          status,
          completedAt,
          durationMs: summary.durationMs,
          connectorsRun: summary.companiesProcessed,
          jobsDiscovered: summary.jobsDiscovered,
          jobsImported: summary.jobsImported,
          duplicates: summary.duplicates,
          failures: summary.failures,
        },
      });
      await this.notifications.publish({
        type: "discovery_complete",
        title: status === "Cancelled"
          ? "Job scan cancelled"
          : summary.failures
            ? `Job scan completed with ${summary.failures} source warning${summary.failures === 1 ? "" : "s"}`
            : `Job scan complete: ${summary.jobsImported} new opportunities found`,
        message: status === "Cancelled"
          ? `${summary.companiesProcessed} completed source${summary.companiesProcessed === 1 ? "" : "s"} were preserved.`
          : `${summary.jobsImported} new opportunities, ${summary.duplicates} duplicates, ${summary.failures} failures.`,
        href: "/briefing",
        metadata: { batchId: batch.id, trigger: options.trigger },
      });
      return { batchId: batch.id, status, ...summary };
    } catch (error) {
      const completedAt = new Date();
      const typed = errorPersistence(error);
      summary.failures += 1;
      summary.durationMs = completedAt.getTime() - startedAt.getTime();
      await this.database.discoveryBatch.update({
        where: { id: batch.id },
        data: {
          status: "Failed",
          completedAt,
          durationMs: summary.durationMs,
          connectorsRun: summary.companiesProcessed,
          jobsDiscovered: summary.jobsDiscovered,
          jobsImported: summary.jobsImported,
          duplicates: summary.duplicates,
          failures: summary.failures,
          metadata: {
            fatalError: typed.providerMessage,
            errorCode: typed.errorCode,
            diagnosticContext: typed.diagnosticContext,
          },
        },
      });
      await this.notifications.publish({
        type: "connector_failure",
        title: "Job scan failed",
        message: typed.providerMessage,
        href: `/scan?batchId=${batch.id}`,
        metadata: { batchId: batch.id, trigger: options.trigger },
      });
      return { batchId: batch.id, status: "Failed", ...summary };
    } finally {
      await this.releaseLock(lockToken);
    }
  }

  private async connectorsFor(
    options: { trigger: SchedulerTrigger; connectorIds?: string[] },
    now: Date,
  ) {
    return this.database.companyConnector.findMany({
      where: {
        enabled: true,
        id: options.connectorIds?.length ? { in: options.connectorIds } : undefined,
        schedule: options.trigger === "scheduled"
          ? {
              is: {
                scheduleType: { not: "Manual" },
                nextRunAt: { lte: now },
              },
            }
          : undefined,
      },
      include: { schedule: true },
      orderBy: [{ atsType: "asc" }, { company: "asc" }],
    });
  }

  private addSummary(target: CrawlSummary, source: CrawlSummary) {
    target.companiesProcessed += source.companiesProcessed;
    target.jobsDiscovered += source.jobsDiscovered;
    target.jobsImported += source.jobsImported;
    target.duplicates += source.duplicates;
    target.failures += source.failures;
  }

  private async acquireLock(token: string, now: Date) {
    await this.database.schedulerLock.upsert({
      where: { id: LOCK_ID },
      update: {},
      create: { id: LOCK_ID },
    });
    const staleBefore = new Date(now.getTime() - LOCK_TIMEOUT_MS);
    const result = await this.database.schedulerLock.updateMany({
      where: {
        id: LOCK_ID,
        OR: [
          { lockToken: null },
          { lockedAt: { lt: staleBefore } },
        ],
      },
      data: { lockToken: token, lockedAt: now },
    });
    return result.count === 1;
  }

  private async releaseLock(token: string) {
    await this.database.schedulerLock.updateMany({
      where: { id: LOCK_ID, lockToken: token },
      data: { lockToken: null, lockedAt: null },
    });
  }
}
