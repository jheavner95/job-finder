import { jobImportSchema } from "../job-import";
import type {
  CanonicalJobPosting,
  ConnectorHealth,
  DiscoveredJob,
  JobSearchCriteria,
  ProviderContext,
  ProviderNormalizedOpportunity,
  ProviderDiscoveryResult,
  ProviderValidation,
} from "./types";
import { normalizePostingContent } from "../job-content";
import { ProviderError } from "./errors";
import { executeProviderRequest } from "./request-policy";

export type JobSourceProvider = {
  readonly id: string;
  readonly name: string;
  discover(
    criteria: JobSearchCriteria,
    context: ProviderContext,
  ): Promise<DiscoveredJob[]>;
  discoverDetailed?(
    criteria: JobSearchCriteria,
    context: ProviderContext,
  ): Promise<ProviderDiscoveryResult>;
  fetch(
    job: DiscoveredJob,
    context: ProviderContext,
  ): Promise<CanonicalJobPosting>;
  normalize(
    posting: CanonicalJobPosting,
    context: ProviderContext,
  ): ProviderNormalizedOpportunity;
  validate(opportunity: ProviderNormalizedOpportunity): ProviderValidation;
  health(context: ProviderContext): Promise<ConnectorHealth>;
};

export type FetchClient = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export function validateForImport(
  opportunity: ProviderNormalizedOpportunity,
): ProviderValidation {
  const parsed = jobImportSchema.safeParse(opportunity);
  return parsed.success
    ? { valid: true, errors: [] }
    : {
        valid: false,
        errors: parsed.error.issues.map(
          (issue) => `${issue.path.join(".") || "posting"}: ${issue.message}`,
        ),
      };
}

export function assertFetchAllowed(context: ProviderContext) {
  if (context.enabled === false) {
    throw new ProviderError(
      "INVALID_CONFIGURATION",
      "The provider connector is disabled.",
      { company: context.company },
    );
  }
  if (context.robotsPolicy?.toLowerCase() === "disallow") {
    throw new ProviderError(
      "ROBOTS_DENIED",
      "The provider robots policy does not permit this request.",
      { careerUrl: context.careerUrl },
    );
  }
}

export async function fetchJson(
  providerId: string,
  client: FetchClient,
  url: string,
  context: ProviderContext,
): Promise<unknown> {
  assertFetchAllowed(context);
  return executeProviderRequest({
    providerId,
    client,
    url,
    context,
    responseType: "json",
  });
}

export function textFromHtml(value: string) {
  return normalizePostingContent(value);
}
