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
  JobSearchCriteria,
  ProviderContext,
} from "../types";
import {
  configuredHealth,
  joinedText,
  stringValue,
  validateProviderRecords,
} from "./provider-utils";
import { getOperationalCapability } from "../capabilities";

export type GenericPosting = {
  id: string;
  title: string;
  location: string;
  url: string;
  description: string;
  salary: string;
  employmentType: string;
  raw: unknown;
};

export abstract class JsonJobProvider implements JobSourceProvider {
  abstract readonly id: string;
  abstract readonly name: string;

  constructor(protected readonly client: FetchClient = fetch) {}

  protected abstract discoveryUrl(context: ProviderContext): string;
  protected abstract postings(payload: unknown): unknown[];
  protected abstract mapPosting(payload: unknown, context: ProviderContext): GenericPosting;
  protected fetchUrl(job: DiscoveredJob, context: ProviderContext) {
    void context;
    return job.canonicalUrl;
  }

  async discover(criteria: JobSearchCriteria, context: ProviderContext) {
    return (await this.discoverDetailed(criteria, context)).jobs;
  }

  async discoverDetailed(criteria: JobSearchCriteria, context: ProviderContext) {
    const payload = await fetchJson(this.id, this.client, this.discoveryUrl(context), context);
    const allJobs = validateProviderRecords(
      this.id,
      this.postings(payload).map((item) => this.mapPosting(item, context)),
    );
    const diagnostics = {
      totalJobsDiscovered: allJobs.length,
      titleMatches: 0,
      locationMatches: 0,
      excludedByTitle: 0,
      excludedByLocation: 0,
      excludedByEmploymentType: 0,
      excludedByHardExclusions: 0,
      closedJobs: 0,
      excludedJobs: [] as import("../types").ExcludedJobDiagnostic[],
    };
    const jobs = allJobs.flatMap((job): DiscoveredJob[] => {
      const titleMatch = !criteria.titles.length
        || criteria.titles.some((value) => job.title.toLowerCase().includes(value.toLowerCase()));
      const locationMatch = !criteria.locations.length
        || criteria.locations.some((value) => job.location.toLowerCase().includes(value.toLowerCase()));
      if (titleMatch) diagnostics.titleMatches += 1;
      if (titleMatch && locationMatch) diagnostics.locationMatches += 1;
      if (!titleMatch || !locationMatch) {
        const reason = titleMatch ? "location" as const : "title" as const;
        if (reason === "title") diagnostics.excludedByTitle += 1;
        else diagnostics.excludedByLocation += 1;
        diagnostics.excludedJobs.push({
          externalId: job.id,
          title: job.title,
          canonicalUrl: job.url,
          reason,
          matchedTitleTerms: titleMatch ? criteria.titles : [],
          excludedTitleTerms: titleMatch ? [] : criteria.titles,
          detail: reason === "title"
            ? `Title did not match: ${criteria.titles.join(", ")}.`
            : `Location did not match: ${criteria.locations.join(", ")}.`,
        });
        return [];
      }
      return [{
        providerId: this.id,
        externalId: job.id,
        title: job.title,
        company: context.company,
        location: job.location,
        canonicalUrl: job.url,
        discoveredVia: "canonical",
      }];
    });
    return {
      jobs,
      diagnostics,
      feed: {
        complete: getOperationalCapability(this.id).completeFeed,
        sourceJobIds: allJobs.map((job) => job.id).filter(Boolean),
      },
    };
  }

  async fetch(job: DiscoveredJob, context: ProviderContext) {
    const payload = await fetchJson(this.id, this.client, this.fetchUrl(job, context), context);
    return {
      providerId: this.id,
      externalId: job.externalId,
      canonicalUrl: job.canonicalUrl,
      payload,
      fetchedAt: new Date(),
    };
  }

  normalize(posting: CanonicalJobPosting, context: ProviderContext) {
    const mapped = this.mapPosting(posting.payload, context);
    return {
      title: mapped.title,
      company: context.company,
      description: textFromHtml(mapped.description),
      url: mapped.url || posting.canonicalUrl,
      source: this.name,
      salary: mapped.salary,
      location: mapped.location,
      employmentType: mapped.employmentType,
      providerExternalId: posting.externalId,
    };
  }

  validate = validateForImport;

  async health(context: ProviderContext) {
    return configuredHealth(this.name, context);
  }
}

export function nestedString(
  value: unknown,
  ...path: string[]
) {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[key];
  }
  return stringValue(current);
}

export function contentText(value: unknown): string {
  if (Array.isArray(value)) return joinedText(...value.map(contentText));
  if (!value || typeof value !== "object") return stringValue(value);
  return joinedText(
    ...Object.values(value as Record<string, unknown>).map(contentText),
  );
}
