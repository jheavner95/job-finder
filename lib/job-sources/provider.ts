import { jobImportSchema } from "../job-import";
import type {
  CanonicalJobPosting,
  ConnectorHealth,
  DiscoveredJob,
  JobSearchCriteria,
  ProviderContext,
  ProviderNormalizedOpportunity,
  ProviderValidation,
} from "./types";

export type JobSourceProvider = {
  readonly id: string;
  readonly name: string;
  discover(
    criteria: JobSearchCriteria,
    context: ProviderContext,
  ): Promise<DiscoveredJob[]>;
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
  const decode = (text: string) => text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)));
  return decode(decode(value))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}
