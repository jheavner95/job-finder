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
import { configuredHealth, joinedText, stringValue } from "./provider-utils";

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
    const payload = await fetchJson(this.client, this.discoveryUrl(context), context);
    return this.postings(payload)
      .map((item) => this.mapPosting(item, context))
      .filter((job) => {
        const title = job.title.toLowerCase();
        const location = job.location.toLowerCase();
        return (
          (!criteria.titles.length
            || criteria.titles.some((value) => title.includes(value.toLowerCase())))
          && (!criteria.locations.length
            || criteria.locations.some((value) => location.includes(value.toLowerCase())))
        );
      })
      .map((job): DiscoveredJob => ({
        providerId: this.id,
        externalId: job.id,
        title: job.title,
        company: context.company,
        location: job.location,
        canonicalUrl: job.url,
        discoveredVia: "canonical",
      }));
  }

  async fetch(job: DiscoveredJob, context: ProviderContext) {
    const payload = await fetchJson(this.client, this.fetchUrl(job, context), context);
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
