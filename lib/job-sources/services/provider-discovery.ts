import type { CompanyConnector, Prisma, PrismaClient } from "@prisma/client";

import { checkRobots } from "../robots";
import { jobSourceRegistry, type JobSourceRegistry } from "../registry";
import type {
  JobDisposition,
  JobDispositionCode,
  JobSearchCriteria,
  ProviderContext,
} from "../types";
import { DEFAULT_PRODUCT_DESIGN_SEARCH, type CrawlSummary } from "../types";
import {
  DiscoveryDispositionError,
  DiscoveryService,
} from "./discovery-service";
import { getOperationalCapability } from "../capabilities";
import { errorPersistence, ProviderError } from "../errors";
import {
  reconcileCompleteFeed,
  reconcileExplicitDeletion,
} from "./feed-reconciliation";

const WORKDAY_PUBLIC_ACCESS_REASON =
  "Workday connector stopped: Workday does not document a supported unauthenticated public jobs API; its official tenant REST and SOAP APIs require authorized tenant access, and the career-site /wday/cxs route is undocumented. No bypass attempted.";
export const JOBSCORE_MINIMUM_POLL_INTERVAL_MS =
  getOperationalCapability("jobscore").pollingFloorMs;

function criteriaFrom(value: Prisma.JsonValue | null): JobSearchCriteria {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_PRODUCT_DESIGN_SEARCH;
  }
  const candidate = value as Record<string, unknown>;
  return {
    titles: Array.isArray(candidate.titles)
      ? candidate.titles.filter((item): item is string => typeof item === "string")
      : DEFAULT_PRODUCT_DESIGN_SEARCH.titles,
    locations: Array.isArray(candidate.locations)
      ? candidate.locations.filter((item): item is string => typeof item === "string")
      : DEFAULT_PRODUCT_DESIGN_SEARCH.locations,
    remote: typeof candidate.remote === "boolean" ? candidate.remote : true,
    hybrid: typeof candidate.hybrid === "boolean" ? candidate.hybrid : true,
    country: typeof candidate.country === "string" ? candidate.country : "United States",
    keywords: Array.isArray(candidate.keywords)
      ? candidate.keywords.filter((item): item is string => typeof item === "string")
      : undefined,
  };
}

function contextFrom(connector: CompanyConnector): ProviderContext {
  return {
    connectorId: connector.id,
    company: connector.company,
    careerUrl: connector.careerUrl,
    connectorKey: connector.connectorKey,
    enabled: connector.enabled,
    robotsPolicy: connector.robotsPolicy,
    crawlDelay: connector.crawlDelay,
    rateLimit: connector.rateLimit,
    credentialRegion: connector.credentialRegion,
    feedOrigin: connector.feedOrigin,
    feedPath: connector.feedPath,
    feedVersion: connector.feedVersion,
  };
}

function delayFor(connector: CompanyConnector, robotsDelay: number | null) {
  const rateDelay = connector.rateLimit && connector.rateLimit > 0
    ? Math.ceil(60_000 / connector.rateLimit)
    : 0;
  return Math.max(connector.crawlDelay ?? 0, robotsDelay ?? 0, rateDelay);
}

function dispositionCounts(dispositions: JobDisposition[]) {
  return dispositions.reduce<Record<JobDispositionCode, number>>((counts, item) => {
    counts[item.disposition] += 1;
    return counts;
  }, {
    IMPORTED: 0,
    DUPLICATE: 0,
    EXCLUDED: 0,
    INVALID: 0,
    NORMALIZATION_FAILED: 0,
    PERSISTENCE_FAILED: 0,
  });
}

async function wait(milliseconds: number) {
  if (milliseconds > 0) {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}

export class ProviderDiscoveryRunner {
  private readonly discovery: DiscoveryService;

  constructor(
    private readonly database: PrismaClient,
    private readonly providerId: string,
    private readonly client: typeof fetch = fetch,
    private readonly registry: JobSourceRegistry = jobSourceRegistry,
    private readonly options: {
      connectorIds?: string[];
      batchId?: string;
      trigger?: "manual" | "scheduled";
    } = {},
  ) {
    this.registry.get(providerId);
    this.discovery = new DiscoveryService(database, this.registry);
  }

  async run(): Promise<CrawlSummary> {
    const runStarted = Date.now();
    const connectors = await this.database.companyConnector.findMany({
      where: {
        atsType: this.providerId,
        enabled: true,
        id: this.options.connectorIds?.length
          ? { in: this.options.connectorIds }
          : undefined,
      },
      orderBy: { company: "asc" },
    });
    const summary: CrawlSummary = {
      companiesProcessed: 0,
      jobsDiscovered: 0,
      jobsImported: 0,
      duplicates: 0,
      failures: 0,
      durationMs: 0,
    };
    if (this.providerId === "workday") {
      return this.blockAll(
        connectors,
        summary,
        WORKDAY_PUBLIC_ACCESS_REASON,
        runStarted,
        "Warning",
      );
    }
    const capability = getOperationalCapability(this.providerId);

    const robotsCache = new Map<string, Awaited<ReturnType<typeof checkRobots>>>();

    for (const connector of connectors) {
      const startedAt = new Date();
      const crawl = await this.database.connectorCrawl.create({
        data: {
          connectorId: connector.id,
          batchId: this.options.batchId,
          status: "Running",
          metadata: {
            event: "crawl_started",
            provider: this.providerId,
            trigger: this.options.trigger ?? "manual",
          },
        },
      });
      summary.companiesProcessed += 1;
      await this.updateStage(crawl.id, connector, "Connecting");

      if (capability.supportsAuthentication) {
        const provider = this.registry.get(this.providerId);
        if (!provider.validateAuthentication) {
          const missing = new ProviderError(
            "INVALID_CONFIGURATION",
            "The authenticated provider does not implement credential validation.",
            { providerId: this.providerId },
          );
          const typed = errorPersistence(missing);
          await this.finish(connector, crawl.id, startedAt, {
            status: "Blocked",
            failures: 1,
            lastError: typed.providerMessage,
            errorCode: typed.errorCode,
            providerMessage: typed.providerMessage,
            diagnosticContext: typed.diagnosticContext,
            health: "Error",
            robotsPolicy: "unverified",
          });
          summary.failures += 1;
          continue;
        }
        try {
          await provider.validateAuthentication(contextFrom(connector));
          await this.database.companyConnector.update({
            where: { id: connector.id },
            data: {
              credentialStatus: "Valid",
              credentialCheckedAt: new Date(),
            },
          });
        } catch (error) {
          const typed = errorPersistence(error);
          await this.finish(connector, crawl.id, startedAt, {
            status: "Blocked",
            failures: 1,
            lastError: typed.providerMessage,
            errorCode: typed.errorCode,
            providerMessage: typed.providerMessage,
            diagnosticContext: typed.diagnosticContext,
            health: "Warning",
            robotsPolicy: "unverified",
          });
          await this.database.companyConnector.update({
            where: { id: connector.id },
            data: {
              enabled: false,
              credentialStatus: typed.errorCode === "AUTH_EXPIRED" ? "Expired" : "Missing",
              credentialCheckedAt: new Date(),
            },
          });
          summary.failures += 1;
          continue;
        }
      }

      if (
        capability.pollingFloorMs > 0
        && connector.lastSuccessfulFetch
        && Date.now() - connector.lastSuccessfulFetch.getTime()
          < capability.pollingFloorMs
      ) {
        await this.finish(connector, crawl.id, startedAt, {
          status: "SkippedRateLimit",
          failures: 0,
          lastError: null,
          health: "Healthy",
          robotsPolicy: connector.robotsPolicy ?? "cached",
          skipReason: `${this.providerId} polling floor has not elapsed.`,
        });
        continue;
      }

      const target = capability.robotsTarget(connector);
      const cacheKey = `${target.url}|${target.path}`;
      let robots = robotsCache.get(cacheKey);
      if (!robots) {
        try {
          robots = await checkRobots(
            target.url,
            target.path,
            this.client,
            capability.robotsUnavailablePolicy,
          );
          robotsCache.set(cacheKey, robots);
        } catch (error) {
          const typed = errorPersistence(error);
          await this.finish(connector, crawl.id, startedAt, {
            status: "Blocked",
            failures: 1,
            lastError: typed.providerMessage,
            errorCode: typed.errorCode,
            providerMessage: typed.providerMessage,
            diagnosticContext: typed.diagnosticContext,
            health: "Error",
            robotsPolicy: "unverified",
          });
          summary.failures += 1;
          continue;
        }
      }

      if (!robots.allowed || connector.robotsPolicy?.toLowerCase() === "disallow") {
        const reason = !robots.allowed
          ? robots.reason
          : "Connector robots policy disallows crawling.";
        await this.finish(connector, crawl.id, startedAt, {
          status: "Blocked",
          failures: 1,
          lastError: reason,
          errorCode: "ROBOTS_DENIED",
          providerMessage: "The provider robots policy does not permit this request.",
          diagnosticContext: { path: target.path },
          health: "Warning",
          robotsPolicy: "disallow",
        });
        summary.failures += 1;
        continue;
      }

      const context = {
        ...contextFrom(connector),
        robotsPolicy: robots.policy,
        crawlDelay: Math.max(connector.crawlDelay ?? 0, robots.crawlDelay ?? 0),
      };
      let discovered = 0;
      let imported = 0;
      let duplicates = 0;
      let failures = 0;
      let lastError: string | null = null;
      let lastDiagnostic: ReturnType<typeof errorPersistence> | null = null;
      let cancelled = false;
      let dispositions: JobDisposition[] = [];
      try {
        await this.updateStage(crawl.id, connector, "Downloading");
        const discoveryResult = await this.discovery.discoverDetailed(
          this.providerId,
          criteriaFrom(connector.searchCriteria),
          context,
        );
        await this.updateStage(crawl.id, connector, "Parsing");
        const jobs = discoveryResult.jobs;
        discovered = discoveryResult.diagnostics.totalJobsDiscovered || jobs.length;
        dispositions = discoveryResult.diagnostics.excludedJobs.map((job) => ({
          externalId: job.externalId,
          title: job.title,
          canonicalUrl: job.canonicalUrl,
          disposition: "EXCLUDED",
          message: job.detail,
        }));
        await this.updateProgress(crawl.id, connector, "Parsing", {
          jobsDiscovered: discovered,
          jobsImported: imported,
          duplicates,
          failures,
        });
        for (const job of jobs) {
          if (await this.isCancelled()) {
            cancelled = true;
            break;
          }
          try {
            await wait(delayFor(connector, robots.crawlDelay));
            const result = await this.discovery.evaluateAndImport(
              this.providerId,
              job,
              context,
              (stage) => this.updateStage(crawl.id, connector, stage),
            );
            if (result.duplicate) duplicates += 1;
            else imported += 1;
            dispositions.push({
              externalId: job.externalId,
              title: job.title,
              canonicalUrl: job.canonicalUrl,
              disposition: result.duplicate ? "DUPLICATE" : "IMPORTED",
              jobId: result.jobId,
              score: result.score,
            });
          } catch (error) {
            const typed = error instanceof DiscoveryDispositionError
              ? {
                  errorCode: error.errorCode as import("../errors").ProviderErrorCode,
                  providerMessage: error.providerMessage,
                  diagnosticContext: error.diagnosticContext,
                }
              : errorPersistence(error);
            lastDiagnostic = typed;
            if (typed.errorCode === "DELETED") {
              await reconcileExplicitDeletion(this.database, {
                sourceName: this.registry.get(this.providerId).name,
                companyName: connector.company,
                sourceJobId: job.externalId,
                observedAt: new Date(),
              });
            }
            failures += 1;
            lastError = typed.providerMessage;
            dispositions.push({
              externalId: job.externalId,
              title: job.title,
              canonicalUrl: job.canonicalUrl,
              disposition: error instanceof DiscoveryDispositionError
                ? error.disposition
                : "INVALID",
              errorCode: typed.errorCode,
              message: typed.providerMessage,
            });
          }
          await this.updateProgress(crawl.id, connector, "Matching", {
            jobsDiscovered: discovered,
            jobsImported: imported,
            duplicates,
            failures,
          });
        }
        if (cancelled) {
          await this.finish(connector, crawl.id, startedAt, {
            status: "Cancelled",
            jobsDiscovered: discovered,
            jobsImported: imported,
            duplicates,
            failures,
            lastError: null,
            health: connector.health === "Error" ? "Error" : "Healthy",
            robotsPolicy: robots.policy,
            diagnostics: discoveryResult.diagnostics,
            dispositions,
          });
          summary.jobsDiscovered += discovered;
          summary.jobsImported += imported;
          summary.duplicates += duplicates;
          summary.failures += failures;
          continue;
        }
        if (discoveryResult.feed.complete && failures === 0) {
          await this.updateStage(crawl.id, connector, "Reconciling");
          await reconcileCompleteFeed(this.database, {
            sourceName: this.registry.get(this.providerId).name,
            companyName: connector.company,
            sourceJobIds: discoveryResult.feed.sourceJobIds,
            observedAt: new Date(),
          });
        }
        if (dispositions.length > discovered) {
          discovered = dispositions.length;
          failures += 1;
          lastError = "The provider returned more traceable jobs than its reported discovery total.";
          lastDiagnostic = {
            errorCode: "SCHEMA_DRIFT",
            providerMessage: lastError,
            diagnosticContext: {
              providerId: this.providerId,
              traceableJobs: dispositions.length,
            },
          };
        }
        while (dispositions.length < discovered) {
          const missingIndex = dispositions.length + 1;
          dispositions.push({
            externalId: `unaccounted-${missingIndex}`,
            title: "Provider posting without a traceable identity",
            canonicalUrl: connector.careerUrl,
            disposition: "INVALID",
            errorCode: "SCHEMA_DRIFT",
            message: "The provider reported a discovered job without a corresponding posting or exclusion diagnostic.",
          });
          failures += 1;
          lastError = "The provider reported discovered jobs without traceable posting diagnostics.";
          lastDiagnostic = {
            errorCode: "SCHEMA_DRIFT",
            providerMessage: lastError,
            diagnosticContext: {
              providerId: this.providerId,
              reportedJobs: discovered,
              traceableJobs: dispositions.length,
            },
          };
        }
        await this.finish(connector, crawl.id, startedAt, {
          status: failures ? "CompletedWithErrors" : "Completed",
          jobsDiscovered: discovered,
          jobsImported: imported,
          duplicates,
          failures,
          lastError,
          errorCode: lastDiagnostic?.errorCode,
          providerMessage: lastDiagnostic?.providerMessage,
          diagnosticContext: lastDiagnostic?.diagnosticContext,
          health: failures ? "Warning" : "Healthy",
          robotsPolicy: robots.policy,
          successful: true,
          diagnostics: discoveryResult.diagnostics,
          dispositions,
        });
      } catch (error) {
        const typed = errorPersistence(error);
        failures += 1;
        lastError = typed.providerMessage;
        await this.finish(connector, crawl.id, startedAt, {
          status: "Failed",
          jobsDiscovered: discovered,
          jobsImported: imported,
          duplicates,
          failures,
          lastError,
          errorCode: typed.errorCode,
          providerMessage: typed.providerMessage,
          diagnosticContext: typed.diagnosticContext,
          health: "Error",
          robotsPolicy: robots.policy,
        });
      }
      summary.jobsDiscovered += discovered;
      summary.jobsImported += imported;
      summary.duplicates += duplicates;
      summary.failures += failures;
    }
    summary.durationMs = Date.now() - runStarted;
    return summary;
  }

  private async blockAll(
    connectors: CompanyConnector[],
    summary: CrawlSummary,
    reason: string,
    runStarted: number,
    health: "Warning" | "Error" = "Error",
  ) {
    for (const connector of connectors) {
      const now = new Date();
      await this.database.$transaction([
        this.database.connectorCrawl.create({
          data: {
            connectorId: connector.id,
            batchId: this.options.batchId,
            status: "Blocked",
            completedAt: now,
            failures: 1,
            durationMs: 0,
            lastError: reason,
            metadata: {
              events: ["crawl_started", "crawl_completed"],
              provider: this.providerId,
              trigger: this.options.trigger ?? "manual",
              reason,
            },
          },
        }),
        this.database.companyConnector.update({
          where: { id: connector.id },
          data: { health, lastChecked: now, notes: reason },
        }),
      ]);
      summary.companiesProcessed += 1;
      summary.failures += 1;
    }
    summary.durationMs = Date.now() - runStarted;
    return summary;
  }

  private async finish(
    connector: CompanyConnector,
    crawlId: string,
    startedAt: Date,
    result: {
      status: string;
      jobsDiscovered?: number;
      jobsImported?: number;
      duplicates?: number;
      failures: number;
      lastError: string | null;
      health: "Healthy" | "Warning" | "Error";
      robotsPolicy: string;
      successful?: boolean;
      diagnostics?: import("../types").DiscoveryDiagnostics;
      dispositions?: JobDisposition[];
      skipReason?: string;
      errorCode?: import("../errors").ProviderErrorCode;
      providerMessage?: string;
      diagnosticContext?: Record<string, string | number | boolean | null>;
    },
  ) {
    const completedAt = new Date();
    await this.database.$transaction([
      this.database.connectorCrawl.update({
        where: { id: crawlId },
        data: {
          status: result.status,
          completedAt,
          jobsDiscovered: result.jobsDiscovered ?? 0,
          jobsImported: result.jobsImported ?? 0,
          duplicates: result.duplicates ?? 0,
          failures: result.failures,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          lastError: result.lastError,
          errorCode: result.errorCode,
          providerMessage: result.providerMessage,
          diagnosticContext: result.diagnosticContext,
          metadata: {
            events: ["crawl_started", "crawl_completed"],
            provider: this.providerId,
            trigger: this.options.trigger ?? "manual",
            robotsPolicy: result.robotsPolicy,
            diagnostics: result.diagnostics,
            dispositions: result.dispositions,
            accounting: result.dispositions
              ? {
                  discovered: result.dispositions.length,
                  ...dispositionCounts(result.dispositions),
                  reconciled: result.dispositions.length === (result.jobsDiscovered ?? 0),
                }
              : undefined,
            skipReason: result.skipReason,
          },
        },
      }),
      this.database.companyConnector.update({
        where: { id: connector.id },
        data: {
          health: result.health,
          robotsPolicy: result.robotsPolicy,
          lastChecked: completedAt,
          lastSuccessfulFetch: result.successful ? completedAt : undefined,
          notes: result.lastError ?? connector.notes,
        },
      }),
    ]);
  }

  private async updateStage(
    crawlId: string,
    connector: CompanyConnector,
    stage: "Connecting" | "Downloading" | "Parsing" | "Normalizing" | "Matching" | "Reconciling",
  ) {
    await this.database.connectorCrawl.update({
      where: { id: crawlId },
      data: {
        metadata: {
          event: "crawl_progress",
          provider: this.providerId,
          company: connector.company,
          trigger: this.options.trigger ?? "manual",
          currentStage: stage,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }

  private async updateProgress(
    crawlId: string,
    connector: CompanyConnector,
    stage: "Parsing" | "Matching",
    progress: {
      jobsDiscovered: number;
      jobsImported: number;
      duplicates: number;
      failures: number;
    },
  ) {
    await this.database.connectorCrawl.update({
      where: { id: crawlId },
      data: {
        ...progress,
        metadata: {
          event: "crawl_progress",
          provider: this.providerId,
          company: connector.company,
          trigger: this.options.trigger ?? "manual",
          currentStage: stage,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }

  private async isCancelled() {
    if (!this.options.batchId) return false;
    const batch = await this.database.discoveryBatch.findUnique({
      where: { id: this.options.batchId },
      select: { cancelRequested: true },
    });
    return batch?.cancelRequested ?? false;
  }
}
