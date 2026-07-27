import type { ProviderContext } from "../types";
import { connectorToken, joinedText, stringValue } from "./provider-utils";
import {
  contentText,
  JsonJobProvider,
  nestedString,
  type GenericPosting,
} from "./json-provider";
import { ProviderError } from "../errors";

export class LeverProvider extends JsonJobProvider {
  readonly id = "lever";
  readonly name = "Lever";

  protected discoveryUrl(context: ProviderContext) {
    return `${this.apiBase(context)}/v0/postings/${encodeURIComponent(connectorToken(context))}?mode=json`;
  }

  protected postings(payload: unknown) {
    if (!Array.isArray(payload)) {
      throw new ProviderError("SCHEMA_DRIFT", "Lever feed must be a list of postings.");
    }
    return payload;
  }

  protected fetchUrl(job: { externalId: string }, context: ProviderContext) {
    return `${this.apiBase(context)}/v0/postings/${encodeURIComponent(connectorToken(context))}/${encodeURIComponent(job.externalId)}`;
  }

  protected mapPosting(payload: unknown): GenericPosting {
    const job = payload as Record<string, unknown>;
    return {
      id: stringValue(job.id),
      title: stringValue(job.text),
      location: nestedString(job, "categories", "location"),
      url: stringValue(job.hostedUrl) || stringValue(job.applyUrl),
      description: joinedText(
        job.descriptionPlain,
        job.description,
        contentText(job.lists),
        job.additionalPlain,
      ),
      salary: contentText(job.salaryRange),
      employmentType: nestedString(job, "categories", "commitment"),
      raw: payload,
    };
  }

  private apiBase(context: ProviderContext) {
    return context.careerUrl.includes("jobs.eu.lever.co")
      ? "https://api.eu.lever.co"
      : "https://api.lever.co";
  }
}
