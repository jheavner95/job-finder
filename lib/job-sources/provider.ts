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
    throw new Error(`Connector for ${context.company} is disabled.`);
  }
  if (context.robotsPolicy?.toLowerCase() === "disallow") {
    throw new Error(`Robots policy disallows fetching ${context.careerUrl}.`);
  }
}

export async function fetchJson(
  client: FetchClient,
  url: string,
  context: ProviderContext,
): Promise<unknown> {
  assertFetchAllowed(context);
  const response = await client(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Provider request failed (${response.status}) for ${url}.`);
  }
  return response.json();
}

export function textFromHtml(value: string) {
  return normalizePostingContent(value);
}
