import type { CompanyConnector, Prisma, PrismaClient } from "@prisma/client";

import { checkRobots } from "../robots";
import { jobSourceRegistry, type JobSourceRegistry } from "../registry";
import type { JobSearchCriteria, ProviderContext } from "../types";
import { DEFAULT_PRODUCT_DESIGN_SEARCH, type CrawlSummary } from "../types";
import { DiscoveryService } from "./discovery-service";

const ROBOTS_TARGETS: Record<string, { url: string; path: string }> = {
  greenhouse: {
    url: "https://boards-api.greenhouse.io/robots.txt",
    path: "/v1/boards/",
  },
  lever: {
    url: "https://api.lever.co/robots.txt",
    path: "/v0/postings/",
  },
  ashby: {
    url: "https://jobs.ashbyhq.com/robots.txt",
    path: "/",
  },
  smartrecruiters: {
    url: "https://api.smartrecruiters.com/robots.txt",
    path: "/v1/companies/",
  },
  workable: {
    url: "https://www.workable.com/robots.txt",
    path: "/api/accounts/",
  },
};

const WORKDAY_PUBLIC_ACCESS_REASON =
  "Workday connector stopped: Workday does not document a supported unauthenticated public jobs API; its official tenant REST and SOAP APIs require authorized tenant access, and the career-site /wday/cxs route is undocumented. No bypass attempted.";

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
    company: connector.company,
    careerUrl: connector.careerUrl,
    connectorKey: connector.connectorKey,
    enabled: connector.enabled,
    robotsPolicy: connector.robotsPolicy,
    crawlDelay: connector.crawlDelay,
    rateLimit: connector.rateLimit,
  };
}

function delayFor(connector: CompanyConnector, robotsDelay: number | null) {
  const rateDelay = connector.rateLimit && connector.rateLimit > 0
    ? Math.ceil(60_000 / connector.rateLimit)
    : 0;
  return Math.max(connector.crawlDelay ?? 0, robotsDelay ?? 0, rateDelay);
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
    registry: JobSourceRegistry = jobSourceRegistry,
    private readonly options: {
      connectorIds?: string[];
      batchId?: string;
      trigger?: "manual" | "scheduled";
    } = {},
  ) {
    registry.get(providerId);
    this.discovery = new DiscoveryService(database, registry);
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
    const target = ROBOTS_TARGETS[this.providerId];
    if (!target) {
      return this.blockAll(
        connectors,
        summary,
        `Robots policy target is not configured for ${this.providerId}.`,
        runStarted,
      );
    }

    let robots;
    try {
      robots = await checkRobots(target.url, target.path, this.client);
    } catch (error) {
      return this.blockAll(
        connectors,
        summary,
        error instanceof Error ? error.message : "Robots check failed.",
        runStarted,
      );
    }

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

      if (!robots.allowed || connector.robotsPolicy?.toLowerCase() === "disallow") {
        const reason = !robots.allowed
          ? robots.reason
          : "Connector robots policy disallows crawling.";
        await this.finish(connector, crawl.id, startedAt, {
          status: "Blocked",
          failures: 1,
          lastError: reason,
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
      try {
        const jobs = await this.discovery.discover(
          this.providerId,
          criteriaFrom(connector.searchCriteria),
          context,
        );
        discovered = jobs.length;
        for (const job of jobs) {
          try {
            await wait(delayFor(connector, robots.crawlDelay));
            const result = await this.discovery.evaluateAndImport(
              this.providerId,
              job,
              context,
            );
            if (result.duplicate) duplicates += 1;
            else imported += 1;
          } catch (error) {
            failures += 1;
            lastError = error instanceof Error ? error.message : "Job import failed.";
          }
        }
        await this.finish(connector, crawl.id, startedAt, {
          status: failures ? "CompletedWithErrors" : "Completed",
          jobsDiscovered: discovered,
          jobsImported: imported,
          duplicates,
          failures,
          lastError,
          health: failures ? "Warning" : "Healthy",
          robotsPolicy: robots.policy,
          successful: true,
        });
      } catch (error) {
        failures += 1;
        lastError = error instanceof Error ? error.message : "Discovery failed.";
        await this.finish(connector, crawl.id, startedAt, {
          status: "Failed",
          jobsDiscovered: discovered,
          jobsImported: imported,
          duplicates,
          failures,
          lastError,
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
          metadata: {
            events: ["crawl_started", "crawl_completed"],
            provider: this.providerId,
            trigger: this.options.trigger ?? "manual",
            robotsPolicy: result.robotsPolicy,
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
}
