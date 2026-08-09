import {
  fetchJson,
  textFromHtml,
  validateForImport,
  type FetchClient,
  type JobSourceProvider,
} from "../provider";
import type {
  CanonicalJobPosting,
  DiscoveredJob,
  DiscoveryDiagnostics,
  JobSearchCriteria,
  ProviderContext,
} from "../types";
import { evaluateRoleRelevance } from "../role-relevance";
import {
  configuredHealth,
  connectorToken,
  stringValue,
  validateProviderRecords,
} from "./provider-utils";
import { ProviderError } from "../errors";

type ComeetPosition = {
  uid?: string;
  name?: string;
  url_recruit_hosted_page?: string;
  position_url?: string;
  location?: { name?: string };
  employment_type?: string;
  details?: Array<{ name?: string; value?: string }>;
};

function credentials(context: ProviderContext) {
  const [companyUid, token] = connectorToken(context).split(":", 2);
  if (!companyUid || !token) {
    throw new Error("Comeet source key must use the public companyUid:token format.");
  }
  return { companyUid, token };
}

function positions(payload: unknown) {
  if (Array.isArray(payload)) return payload as ComeetPosition[];
  if (payload && typeof payload === "object") {
    const value = payload as { positions?: ComeetPosition[]; position?: ComeetPosition };
    if (Array.isArray(value.positions)) return value.positions;
    if (value.position) return [value.position];
  }
  throw new ProviderError("SCHEMA_DRIFT", "Comeet feed positions must be a list.");
}


export class ComeetProvider implements JobSourceProvider {
  readonly id = "comeet";
  readonly name = "Comeet";

  constructor(private readonly client: FetchClient = fetch) {}

  async discover(criteria: JobSearchCriteria, context: ProviderContext) {
    return (await this.discoverDetailed(criteria, context)).jobs;
  }

  async discoverDetailed(criteria: JobSearchCriteria, context: ProviderContext) {
    const { companyUid, token } = credentials(context);
    const payload = await fetchJson(
      this.id,
      this.client,
      `https://www.comeet.co/careers-api/2.0/company/${encodeURIComponent(companyUid)}/positions?token=${encodeURIComponent(token)}`,
      context,
    );
    const allPositions = positions(payload);
    validateProviderRecords(this.id, allPositions.map((position) => ({
      id: stringValue(position.uid),
      title: stringValue(position.name),
      url: stringValue(position.url_recruit_hosted_page),
    })));
    const diagnostics: DiscoveryDiagnostics = {
      totalJobsDiscovered: allPositions.length,
      titleMatches: 0,
      locationMatches: 0,
      excludedByTitle: 0,
      excludedByLocation: 0,
      excludedByEmploymentType: 0,
      excludedByHardExclusions: 0,
      closedJobs: 0,
      excludedJobs: [],
    };
    const jobs: DiscoveredJob[] = [];
    for (const position of allPositions) {
      const title = stringValue(position.name);
      const place = stringValue(position.location?.name);
      const relevance = evaluateRoleRelevance(title);
      const locationMatch = !criteria.locations.length
        || criteria.locations.some((term) => place.toLowerCase().includes(term.toLowerCase()));
      if (relevance.relevant) diagnostics.titleMatches += 1;
      if (relevance.relevant && locationMatch) diagnostics.locationMatches += 1;
      if (!relevance.relevant || !locationMatch) {
        const reason = relevance.relevant ? "location" as const : "title" as const;
        if (reason === "title") diagnostics.excludedByTitle += 1;
        else diagnostics.excludedByLocation += 1;
        // Traceable exclusions keep the disposition ledger reconciling.
        diagnostics.excludedJobs.push({
          externalId: stringValue(position.uid),
          title: title || "(untitled)",
          canonicalUrl: stringValue(position.url_recruit_hosted_page),
          reason,
          matchedTitleTerms: relevance.signals,
          excludedTitleTerms: relevance.rejectedBy ? [relevance.rejectedBy] : [],
          detail: reason === "title"
            ? relevance.detail
            : `Location did not match: ${criteria.locations.join(", ")}.`,
        });
        continue;
      }
      jobs.push({
        providerId: this.id,
        externalId: stringValue(position.uid),
        title,
        company: context.company,
        location: place,
        canonicalUrl: stringValue(position.url_recruit_hosted_page),
        discoveredVia: "canonical",
      });
    }
    return {
      jobs,
      diagnostics,
      feed: {
        complete: true,
        sourceJobIds: allPositions.map((position) => stringValue(position.uid)).filter(Boolean),
      },
    };
  }

  async fetch(job: DiscoveredJob, context: ProviderContext) {
    const { companyUid, token } = credentials(context);
    const payload = await fetchJson(
      this.id,
      this.client,
      `https://www.comeet.co/careers-api/2.0/company/${encodeURIComponent(companyUid)}/positions/${encodeURIComponent(job.externalId)}?token=${encodeURIComponent(token)}`,
      context,
    );
    return {
      providerId: this.id,
      externalId: job.externalId,
      canonicalUrl: job.canonicalUrl,
      payload: positions(payload)[0] ?? payload,
      fetchedAt: new Date(),
    };
  }

  normalize(posting: CanonicalJobPosting, context: ProviderContext) {
    const position = posting.payload as ComeetPosition;
    const detail = (name: RegExp) => position.details?.filter((item) =>
      name.test(stringValue(item.name))).map((item) => stringValue(item.value)).join("\n") ?? "";
    return {
      title: stringValue(position.name),
      company: context.company,
      description: textFromHtml(detail(/description|requirements/i)),
      url: stringValue(position.url_recruit_hosted_page) || posting.canonicalUrl,
      source: this.name,
      salary: detail(/salary|compensation/i),
      location: stringValue(position.location?.name),
      employmentType: stringValue(position.employment_type),
      providerExternalId: posting.externalId,
    };
  }

  validate = validateForImport;

  async health(context: ProviderContext) {
    credentials(context);
    return configuredHealth(this.name, context);
  }
}
