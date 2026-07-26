import type { ProviderContext } from "../types";
import { connectorToken, joinedText, stringValue } from "./provider-utils";
import { contentText, JsonJobProvider, nestedString, type GenericPosting } from "./json-provider";

export class WorkdayProvider extends JsonJobProvider {
  readonly id = "workday";
  readonly name = "Workday";

  protected discoveryUrl(context: ProviderContext) {
    const base = context.careerUrl.replace(/\/$/, "");
    return `${base}/wday/cxs/${encodeURIComponent(connectorToken(context))}/jobs`;
  }

  protected postings(payload: unknown) {
    const postings = (payload as { jobPostings?: unknown[] })?.jobPostings;
    return Array.isArray(postings) ? postings : [];
  }

  protected fetchUrl(job: { canonicalUrl: string }, context: ProviderContext) {
    const base = context.careerUrl.replace(/\/$/, "");
    const path = new URL(job.canonicalUrl, base).pathname;
    return `${base}/wday/cxs/${encodeURIComponent(connectorToken(context))}${path}`;
  }

  protected mapPosting(payload: unknown): GenericPosting {
    const job = payload as Record<string, unknown>;
    return {
      id: stringValue(job.bulletFields) || stringValue(job.externalPath),
      title: stringValue(job.title),
      location: stringValue(job.locationsText),
      url: stringValue(job.externalUrl) || stringValue(job.externalPath),
      description: joinedText(job.jobDescription, contentText(job.additionalLocations)),
      salary: contentText(job.compensation),
      employmentType: nestedString(job, "timeType", "label"),
      raw: payload,
    };
  }
}
