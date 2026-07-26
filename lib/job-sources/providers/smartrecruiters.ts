import type { ProviderContext } from "../types";
import { connectorToken, joinedText, stringValue } from "./provider-utils";
import { contentText, JsonJobProvider, nestedString, type GenericPosting } from "./json-provider";

function slug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export class SmartRecruitersProvider extends JsonJobProvider {
  readonly id = "smartrecruiters";
  readonly name = "SmartRecruiters";

  protected discoveryUrl(context: ProviderContext) {
    return `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(connectorToken(context))}/postings?limit=100&destination=PUBLIC`;
  }

  protected postings(payload: unknown) {
    const content = (payload as { content?: unknown[] })?.content;
    return Array.isArray(content) ? content : [];
  }

  protected fetchUrl(job: { externalId: string }, context: ProviderContext) {
    return `${this.discoveryUrl(context)}/${encodeURIComponent(job.externalId)}`;
  }

  protected mapPosting(payload: unknown): GenericPosting {
    const job = payload as Record<string, unknown>;
    const sections = job.jobAd as Record<string, unknown> | undefined;
    const identifier = nestedString(job, "company", "identifier");
    const id = stringValue(job.id) || stringValue(job.uuid);
    const title = stringValue(job.name);
    const canonicalUrl = identifier && id
      ? `https://jobs.smartrecruiters.com/${identifier}/${id}-${slug(title)}`
      : stringValue(job.postingUrl) || stringValue(job.applyUrl);
    return {
      id,
      title,
      location: nestedString(job, "location", "fullLocation") || joinedText(
        nestedString(job, "location", "city"),
        nestedString(job, "location", "region"),
        nestedString(job, "location", "country"),
        nestedString(job, "location", "remote") === "true" ? "Remote" : "",
      ).replaceAll("\n", ", "),
      url: canonicalUrl,
      description: joinedText(
        contentText(sections?.company),
        contentText(sections?.job),
        contentText(sections?.qualifications),
        contentText(sections?.additionalInformation),
      ),
      salary: contentText(job.compensation),
      employmentType: nestedString(job, "typeOfEmployment", "label"),
      raw: payload,
    };
  }
}
