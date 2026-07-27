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
  DiscoveryDiagnostics,
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

const DESIGN_ROLE_PATTERNS = [
  /\bproduct designers?\b/,
  /\bproduct design leads?\b/,
  /\bux designers?\b/,
  /\bdesign leads?\b/,
  /\bdesign managers?\b/,
  /\bdirectors? (?:of )?product design\b/,
];

function normalized(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\bdesigners\b/g, "designer").replace(/\s+/g, " ").trim();
}

function titleTerms(title: string, criteria: JobSearchCriteria) {
  const value = normalized(title);
  const requested = criteria.titles.map(normalized).filter(Boolean);
  const designSearch = requested.some((term) =>
    /\b(product design|ux design|design lead|design manager)/.test(term));
  const matched = requested.filter((term) => value.includes(term));
  const roleVariant = designSearch && DESIGN_ROLE_PATTERNS.some((pattern) => pattern.test(value));
  return { matches: !requested.length || matched.length > 0 || roleVariant, matched };
}

function analyze(job: GreenhouseJob, criteria: JobSearchCriteria) {
  const rawTitle = stringValue(job.title);
  const title = normalized(rawTitle);
  const location = stringValue(job.location?.name).toLowerCase();
  const content = textFromHtml(stringValue(job.content)).toLowerCase();
  const locationText = `${location}\n${content}`;
  const titleResult = titleTerms(rawTitle, criteria);
  const locationMatch = !criteria.locations.length
    || criteria.locations.some((value) => locationText.includes(value.toLowerCase()));
  const employment = job.metadata?.filter((item) => /employment|commitment|type/i.test(stringValue(item.name)))
    .flatMap((item) => Array.isArray(item.value) ? item.value : [item.value]).map(stringValue).join(" ") ?? "";
  const employmentMatch = !criteria.employmentTypes?.length
    || criteria.employmentTypes.some((value) => employment.toLowerCase().includes(value.toLowerCase()));
  const hardTerm = criteria.hardExclusions?.find((term) =>
    `${title}\n${content}`.includes(term.toLowerCase()));
  const closed = !job.absolute_url || !job.id;
  const reason = closed ? "closed"
    : !titleResult.matches ? "title"
      : !locationMatch ? "location"
        : !employmentMatch ? "employment_type"
          : hardTerm ? "hard_exclusion"
            : null;
  return {
    accepted: reason === null,
    reason,
    titleMatch: titleResult.matches,
    locationMatch,
    matchedTitleTerms: titleResult.matched,
    excludedTitleTerms: titleResult.matches ? [] : criteria.titles,
    detail: reason === "title" ? `Title did not match any saved role variant: ${criteria.titles.join(", ")}.`
      : reason === "location" ? `Location did not match: ${criteria.locations.join(", ")}.`
        : reason === "employment_type" ? `Employment type "${employment || "unknown"}" was not allowed.`
          : reason === "hard_exclusion" ? `Posting contained hard exclusion "${hardTerm}".`
            : reason === "closed" ? "Posting had no active canonical URL or job identifier."
              : "Matched.",
  } as const;
}

export class GreenhouseProvider implements JobSourceProvider {
  readonly id = "greenhouse";
  readonly name = "Greenhouse";

  constructor(private readonly client: FetchClient = fetch) {}

  async discover(criteria: JobSearchCriteria, context: ProviderContext) {
    return (await this.discoverDetailed(criteria, context)).jobs;
  }

  async discoverDetailed(criteria: JobSearchCriteria, context: ProviderContext) {
    const board = encodeURIComponent(connectorToken(context));
    const payload = await fetchJson(
      this.client,
      `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`,
      context,
    ) as { jobs?: GreenhouseJob[] };
    const allJobs = payload.jobs ?? [];
    const diagnostics: DiscoveryDiagnostics = {
      totalJobsDiscovered: allJobs.length,
      titleMatches: 0,
      locationMatches: 0,
      excludedByTitle: 0,
      excludedByLocation: 0,
      excludedByEmploymentType: 0,
      excludedByHardExclusions: 0,
      closedJobs: 0,
      excludedJobs: [],
    };
    const accepted = allJobs.filter((job) => {
      const result = analyze(job, criteria);
      if (result.titleMatch) diagnostics.titleMatches += 1;
      if (result.titleMatch && result.locationMatch) diagnostics.locationMatches += 1;
      if (!result.accepted && result.reason) {
        if (result.reason === "title") diagnostics.excludedByTitle += 1;
        if (result.reason === "location") diagnostics.excludedByLocation += 1;
        if (result.reason === "employment_type") diagnostics.excludedByEmploymentType += 1;
        if (result.reason === "hard_exclusion") diagnostics.excludedByHardExclusions += 1;
        if (result.reason === "closed") diagnostics.closedJobs += 1;
        diagnostics.excludedJobs.push({
          externalId: String(job.id ?? ""),
          title: stringValue(job.title) || "(untitled)",
          canonicalUrl: stringValue(job.absolute_url),
          reason: result.reason,
          matchedTitleTerms: result.matchedTitleTerms,
          excludedTitleTerms: result.excludedTitleTerms,
          detail: result.detail,
        });
      }
      return result.accepted;
    });
    const jobs = accepted.map(
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
    return { jobs, diagnostics };
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
