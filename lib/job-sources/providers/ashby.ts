import type { ProviderContext } from "../types";
import { ProviderError } from "../errors";
import { executeProviderRequest } from "../request-policy";
import { connectorToken, joinedText, stringValue } from "./provider-utils";
import { JsonJobProvider, nestedString, type GenericPosting } from "./json-provider";

export class AshbyProvider extends JsonJobProvider {
  readonly id = "ashby";
  readonly name = "Ashby";

  protected discoveryUrl(context: ProviderContext) {
    return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(connectorToken(context))}?includeCompensation=true`;
  }

  protected postings(payload: unknown) {
    const jobs = (payload as { jobs?: unknown[] })?.jobs;
    if (!Array.isArray(jobs)) {
      throw new ProviderError("SCHEMA_DRIFT", "Ashby feed jobs must be a list.");
    }
    return jobs.filter((job) => (job as { isListed?: boolean }).isListed !== false);
  }

  protected async fetchFromBoard(externalId: string, context: ProviderContext) {
    const payload = await executeProviderRequest({
      providerId: this.id,
      client: this.client,
      url: this.discoveryUrl(context),
      context,
      responseType: "json",
    });
    const job = this.postings(payload).find(
      (item) => stringValue((item as Record<string, unknown>).id) === externalId,
    );
    if (!job) {
      throw new ProviderError(
        "DELETED",
        "The provider posting is no longer available.",
        { providerId: this.id, sourceJobId: externalId },
      );
    }
    return job;
  }

  async fetch(job: Parameters<JsonJobProvider["fetch"]>[0], context: ProviderContext) {
    return {
      providerId: this.id,
      externalId: job.externalId,
      canonicalUrl: job.canonicalUrl,
      payload: await this.fetchFromBoard(job.externalId, context),
      fetchedAt: new Date(),
    };
  }

  protected mapPosting(payload: unknown): GenericPosting {
    const job = payload as Record<string, unknown>;
    const secondaryLocations = Array.isArray(job.secondaryLocations)
      ? job.secondaryLocations.map((item) =>
          stringValue((item as Record<string, unknown>).location))
      : [];
    const location = joinedText(
      job.location,
      ...secondaryLocations,
      job.workplaceType,
    ).replaceAll("\n", ", ");
    const jobUrl = stringValue(job.jobUrl);
    return {
      id: stringValue(job.id) || jobUrl.split("/").filter(Boolean).at(-1) || "",
      title: stringValue(job.title),
      location,
      url: jobUrl || stringValue(job.applyUrl),
      description: joinedText(job.descriptionPlain, job.descriptionHtml, job.description),
      salary: nestedString(job, "compensation", "compensationTierSummary")
        || nestedString(job, "compensation", "scrapeableCompensationSalarySummary"),
      employmentType: stringValue(job.employmentType),
      raw: payload,
    };
  }
}
