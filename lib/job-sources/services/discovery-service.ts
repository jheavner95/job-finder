import type { PrismaClient } from "@prisma/client";

import { createJobImportPreview } from "../../job-import";
import { importJobPreview } from "../../job-import-service";
import type { JobSourceRegistry } from "../registry";
import { jobSourceRegistry } from "../registry";
import type {
  ConnectorHealth,
  DiscoveredJob,
  DiscoveryImportResult,
  JobSearchCriteria,
  ProviderContext,
} from "../types";

const DISCOVERY_HOSTS = [
  "linkedin.com",
  "indeed.com",
  "google.com",
  "ziprecruiter.com",
];

function isDiscoveryOnlyUrl(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return DISCOVERY_HOSTS.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

export class DiscoveryService {
  constructor(
    private readonly database: PrismaClient,
    private readonly registry: JobSourceRegistry = jobSourceRegistry,
  ) {}

  async discover(
    providerId: string,
    criteria: JobSearchCriteria,
    context: ProviderContext,
  ) {
    const jobs = await this.registry.get(providerId).discover(criteria, context);
    await this.persistConnector(providerId, context, {
      health: "Healthy",
      lastChecked: new Date(),
      lastSuccessfulFetch: new Date(),
    });
    return jobs;
  }

  async evaluateAndImport(
    providerId: string,
    discovered: DiscoveredJob,
    context: ProviderContext,
  ): Promise<DiscoveryImportResult> {
    if (discovered.providerId !== providerId) {
      throw new Error("Discovered job does not belong to the selected provider.");
    }
    if (isDiscoveryOnlyUrl(discovered.canonicalUrl)) {
      throw new Error(
        "Discovery-source URLs cannot be imported as canonical postings. Resolve the company ATS URL first.",
      );
    }

    const provider = this.registry.get(providerId);
    const posting = await provider.fetch(discovered, context);
    const opportunity = provider.normalize(posting, context);
    const validation = provider.validate(opportunity);
    if (!validation.valid) {
      throw new Error(`Provider normalization failed: ${validation.errors.join("; ")}`);
    }

    // This is the certified Live Job Foundation boundary. Scoring,
    // confidence, fingerprinting, duplicate handling, and persistence remain
    // owned by the existing pipeline.
    const result = await importJobPreview(
      this.database,
      createJobImportPreview(opportunity),
    );
    return {
      providerId,
      externalId: discovered.externalId,
      canonicalUrl: opportunity.url,
      ...result,
    };
  }

  async health(providerId: string, context: ProviderContext) {
    const provider = this.registry.get(providerId);
    let result: ConnectorHealth;
    try {
      result = await provider.health(context);
    } catch (error) {
      result = {
        status: "Error",
        message: error instanceof Error ? error.message : "Provider health check failed.",
        checkedAt: new Date(),
      };
    }

    await this.persistConnector(providerId, context, {
      health: result.status,
      lastChecked: result.checkedAt,
    });
    return result;
  }

  private async persistConnector(
    providerId: string,
    context: ProviderContext,
    state: {
      health: string;
      lastChecked: Date;
      lastSuccessfulFetch?: Date;
    },
  ) {
    await this.database.companyConnector.upsert({
      where: { company: context.company },
      update: {
        careerUrl: context.careerUrl,
        atsType: providerId,
        connectorKey: context.connectorKey,
        robotsPolicy: context.robotsPolicy,
        crawlDelay: context.crawlDelay,
        rateLimit: context.rateLimit,
        enabled: context.enabled !== false,
        health: state.health,
        lastChecked: state.lastChecked,
        lastSuccessfulFetch: state.lastSuccessfulFetch,
      },
      create: {
        company: context.company,
        careerUrl: context.careerUrl,
        atsType: providerId,
        connectorKey: context.connectorKey,
        robotsPolicy: context.robotsPolicy,
        crawlDelay: context.crawlDelay,
        rateLimit: context.rateLimit,
        enabled: context.enabled !== false,
        health: state.health,
        lastChecked: state.lastChecked,
        lastSuccessfulFetch: state.lastSuccessfulFetch,
      },
    });
  }
}
