import type { PrismaClient } from "@prisma/client";

import { jobSourceRegistry, type JobSourceRegistry } from "../job-sources/registry";
import { ProviderDiscoveryRunner } from "../job-sources/services/provider-discovery";
import type { CrawlSummary } from "../job-sources/types";
import {
  InAppNotificationPublisher,
  type NotificationPublisher,
} from "../notifications/service";
import { nextRunAt, type ScheduleType } from "./schedule";

const LOCK_ID = "discovery-scheduler";
const LOCK_TIMEOUT_MS = 60 * 60 * 1_000;

type SchedulerTrigger = "manual" | "scheduled";

export type SchedulerResult = CrawlSummary & {
  batchId: string;
  status: "Completed" | "CompletedWithErrors" | "SkippedConcurrent";
};

export class DiscoveryScheduler {
  constructor(
    private readonly database: PrismaClient,
    private readonly client: typeof fetch = fetch,
    private readonly registry: JobSourceRegistry = jobSourceRegistry,
    private readonly notifications: NotificationPublisher =
      new InAppNotificationPublisher(database),
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
      for (const connector of connectors) {
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
          this.addSummary(summary, result);
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
        } catch (error) {
          const message = error instanceof Error ? error.message : "Connector execution failed.";
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
                lastError: message,
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
                notes: message,
              },
            }),
          ]);
          summary.companiesProcessed += 1;
          summary.failures += 1;
          await this.notifications.publish({
            type: "connector_failure",
            title: `${connector.company} discovery failed`,
            message,
            href: "/sources",
            metadata: {
              batchId: batch.id,
              provider: connector.atsType,
              company: connector.company,
            },
          });
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
      }

      const completedAt = new Date();
      const status = summary.failures ? "CompletedWithErrors" : "Completed";
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
        title: options.trigger === "scheduled"
          ? "Scheduled discovery completed"
          : "Manual discovery completed",
        message: `${summary.jobsImported} new opportunities, ${summary.duplicates} duplicates, ${summary.failures} failures.`,
        href: "/briefing",
        metadata: { batchId: batch.id, trigger: options.trigger },
      });
      return { batchId: batch.id, status, ...summary };
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
