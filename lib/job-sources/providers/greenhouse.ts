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
import { ProviderError } from "../errors";
import { evaluateRoleRelevance, normalizeRoleTitle } from "../role-relevance";
import {
  configuredHealth,
  connectorToken,
  stringValue,
  validateProviderRecords,
} from "./provider-utils";

type GreenhouseJob = {
  id?: number;
  title?: string;
  absolute_url?: string;
  content?: string;
  location?: { name?: string };
  metadata?: Array<{ name?: string; value?: string | string[] }>;
};

/**
 * Screens one posting from the board LIST response.
 *
 * The list is deliberately fetched without `content=true`, so descriptions are
 * not available here and must not be relied on. Location and hard-exclusion
 * checks therefore consider the structured location and the title only; the
 * full description is fetched per posting in `fetch()` for the small number of
 * postings that survive this screen.
 */
function analyze(job: GreenhouseJob, criteria: JobSearchCriteria) {
  const rawTitle = stringValue(job.title);
  const title = normalizeRoleTitle(rawTitle);
  const location = stringValue(job.location?.name).toLowerCase();
  // Retrieval is gated by the shared discipline screen, never by the saved
  // title strings: `criteria.titles` is a ranking input, not a filter.
  const relevance = evaluateRoleRelevance(rawTitle);
  const locationMatch = !criteria.locations.length
    || criteria.locations.some((value) => location.includes(value.toLowerCase()));
  const employment = job.metadata?.filter((item) => /employment|commitment|type/i.test(stringValue(item.name)))
    .flatMap((item) => Array.isArray(item.value) ? item.value : [item.value]).map(stringValue).join(" ") ?? "";
  const employmentMatch = !criteria.employmentTypes?.length
    || criteria.employmentTypes.some((value) => employment.toLowerCase().includes(value.toLowerCase()));
  const hardTerm = criteria.hardExclusions?.find((term) =>
    title.includes(term.toLowerCase()));
  const closed = !job.absolute_url || !job.id;
  const reason = closed ? "closed"
    : !relevance.relevant ? "title"
      : !locationMatch ? "location"
        : !employmentMatch ? "employment_type"
          : hardTerm ? "hard_exclusion"
            : null;
  return {
    accepted: reason === null,
    reason,
    titleMatch: relevance.relevant,
    locationMatch,
    matchedTitleTerms: relevance.signals,
    excludedTitleTerms: relevance.rejectedBy ? [relevance.rejectedBy] : [],
    detail: reason === "title" ? relevance.detail
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
    // `content=true` would attach the full HTML description of every posting on
    // the board — measured at 9.9MB for a 1,289-posting board versus 0.8MB
    // without. Screening is title-based, and the descriptions of postings that
    // survive screening are fetched individually in `fetch()`, so the bulk
    // descriptions were downloaded and discarded.
    const payload = await fetchJson(
      this.id,
      this.client,
      `https://boards-api.greenhouse.io/v1/boards/${board}/jobs`,
      context,
    ) as { jobs?: GreenhouseJob[] };
    if (!Array.isArray(payload.jobs)) {
      throw new ProviderError("SCHEMA_DRIFT", "Greenhouse feed jobs must be a list.");
    }
    const allJobs = payload.jobs;
    validateProviderRecords(this.id, allJobs.map((job) => ({
      id: String(job.id ?? ""),
      title: stringValue(job.title),
      url: stringValue(job.absolute_url),
    })));
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
    return {
      jobs,
      diagnostics,
      feed: {
        complete: true,
        sourceJobIds: allJobs.map((job) => String(job.id ?? "")).filter(Boolean),
      },
    };
  }

  async fetch(job: DiscoveredJob, context: ProviderContext) {
    const board = encodeURIComponent(connectorToken(context));
    const payload = await fetchJson(
      this.id,
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
      providerExternalId: posting.externalId,
    };
  }

  validate = validateForImport;

  async health(context: ProviderContext) {
    return configuredHealth(this.name, context);
  }
}
