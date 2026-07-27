import { fetchJson } from "../provider";
import type { DiscoveredJob, ProviderContext } from "../types";
import { connectorToken, joinedText, stringValue } from "./provider-utils";
import { contentText, JsonJobProvider, type GenericPosting } from "./json-provider";
import { ProviderError } from "../errors";

export class WorkableProvider extends JsonJobProvider {
  readonly id = "workable";
  readonly name = "Workable";

  protected discoveryUrl(context: ProviderContext) {
    return `https://www.workable.com/api/accounts/${encodeURIComponent(connectorToken(context))}?details=true`;
  }

  protected postings(payload: unknown) {
    const jobs = (payload as { jobs?: unknown[] })?.jobs;
    if (!Array.isArray(jobs)) {
      throw new ProviderError("SCHEMA_DRIFT", "Workable feed jobs must be a list.");
    }
    return jobs;
  }

  async fetch(job: DiscoveredJob, context: ProviderContext) {
    const payload = await fetchJson(this.id, this.client, this.discoveryUrl(context), context);
    const posting = this.postings(payload).find((item) => {
      const mapped = this.mapPosting(item);
      return mapped.id === job.externalId && mapped.url === job.canonicalUrl;
    });
    if (!posting) {
      throw new Error(`Workable posting ${job.externalId} is no longer public.`);
    }
    return {
      providerId: this.id,
      externalId: job.externalId,
      canonicalUrl: job.canonicalUrl,
      payload: posting,
      fetchedAt: new Date(),
    };
  }

  protected mapPosting(payload: unknown): GenericPosting {
    const job = payload as Record<string, unknown>;
    const workplaceType = stringValue(job.workplace_type);
    const location = joinedText(
      job.city,
      job.state,
      job.country,
      workplaceType === "remote" || job.telecommuting === true ? "Remote" : "",
      workplaceType === "hybrid" ? "Hybrid" : "",
    ).replaceAll("\n", ", ");
    return {
      id: stringValue(job.shortcode) || stringValue(job.id),
      title: stringValue(job.title),
      location,
      url: stringValue(job.url) || stringValue(job.shortlink),
      description: stringValue(job.description),
      salary: contentText(job.salary),
      employmentType: stringValue(job.employment_type),
      raw: payload,
    };
  }
}
