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
import { configuredHealth, connectorToken, stringValue } from "./provider-utils";

type GreenhouseJob = {
  id?: number;
  title?: string;
  absolute_url?: string;
  content?: string;
  location?: { name?: string };
  metadata?: Array<{ name?: string; value?: string | string[] }>;
};

function matches(job: GreenhouseJob, criteria: JobSearchCriteria) {
  const title = stringValue(job.title).toLowerCase();
  const location = stringValue(job.location?.name).toLowerCase();
  const content = textFromHtml(stringValue(job.content)).toLowerCase();
  const locationText = `${location}\n${content}`;
  const titleMatch = !criteria.titles.length
    || criteria.titles.some((value) => title.includes(value.toLowerCase()));
  const locationMatch = !criteria.locations.length
    || criteria.locations.some((value) => locationText.includes(value.toLowerCase()));
  return titleMatch && locationMatch;
}

export class GreenhouseProvider implements JobSourceProvider {
  readonly id = "greenhouse";
  readonly name = "Greenhouse";

  constructor(private readonly client: FetchClient = fetch) {}

  async discover(criteria: JobSearchCriteria, context: ProviderContext) {
    const board = encodeURIComponent(connectorToken(context));
    const payload = await fetchJson(
      this.client,
      `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`,
      context,
    ) as { jobs?: GreenhouseJob[] };
    return (payload.jobs ?? []).filter((job) => matches(job, criteria)).map(
      (job): DiscoveredJob => ({
        providerId: this.id,
        externalId: String(job.id ?? ""),
        title: stringValue(job.title),
        company: context.company,
        location: stringValue(job.location?.name),
        canonicalUrl: stringValue(job.absolute_url),
        discoveredVia: "canonical",
      }),
    );
  }

  async fetch(job: DiscoveredJob, context: ProviderContext) {
    const board = encodeURIComponent(connectorToken(context));
    const payload = await fetchJson(
      this.client,
      `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${encodeURIComponent(job.externalId)}`,
      context,
    );
    return {
      providerId: this.id,
      externalId: job.externalId,
      canonicalUrl: job.canonicalUrl,
      payload,
      fetchedAt: new Date(),
    };
  }

  normalize(posting: CanonicalJobPosting, context: ProviderContext) {
    const job = posting.payload as GreenhouseJob;
    const metadata = job.metadata ?? [];
    const meta = (label: RegExp) => metadata
      .filter((item) => label.test(stringValue(item.name)))
      .flatMap((item) => Array.isArray(item.value) ? item.value : [item.value])
      .map(stringValue)
      .filter(Boolean)
      .join(", ");
    return {
      title: stringValue(job.title),
      company: context.company,
      description: textFromHtml(stringValue(job.content)),
      url: stringValue(job.absolute_url) || posting.canonicalUrl,
      source: this.name,
      salary: meta(/salary|compensation/i),
      location: stringValue(job.location?.name),
      employmentType: meta(/employment|commitment|type/i),
    };
  }

  validate = validateForImport;

  async health(context: ProviderContext) {
    return configuredHealth(this.name, context);
  }
}
