import {
  assertFetchAllowed,
  textFromHtml,
  validateForImport,
  type FetchClient,
  type JobSourceProvider,
} from "../provider";
import type {
  CanonicalJobPosting,
  DiscoveryDiagnostics,
  DiscoveredJob,
  JobSearchCriteria,
  ProviderContext,
} from "../types";
import { configuredHealth, stringValue } from "./provider-utils";
import {
  executeProviderRequest,
  type RequestRuntime,
} from "../request-policy";
export { retryAfterMilliseconds } from "../request-policy";
import { evaluateRoleRelevance } from "../role-relevance";

type JobScoreCustomField = { label?: unknown; content?: unknown };

export type JobScoreJob = {
  id?: unknown;
  title?: unknown;
  department?: unknown;
  location?: unknown;
  city?: unknown;
  state?: unknown;
  country?: unknown;
  description?: unknown;
  apply_url?: unknown;
  detail_url?: unknown;
  opened_date?: unknown;
  last_updated_date?: unknown;
  custom_fields?: unknown;
};

type JobScoreFeed = {
  publisher?: unknown;
  company?: unknown;
  company_url?: unknown;
  jobs?: unknown;
};

type JobScoreRuntime = RequestRuntime;

function accountKey(context: ProviderContext) {
  const key = context.connectorKey.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(key)) {
    throw new Error("JobScore connector key must be a valid careers account code.");
  }
  return key;
}

function feedUrl(context: ProviderContext) {
  return `https://careers.jobscore.com/jobs/${encodeURIComponent(accountKey(context))}/feed.json`;
}

function validUrl(value: unknown, field: string, jobId: string) {
  const text = stringValue(value);
  if (!text) return "";
  try {
    const url = new URL(text);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    return url.toString();
  } catch {
    throw new Error(`JobScore feed invalid: position ${jobId} has invalid ${field}.`);
  }
}

function dateValue(value: unknown, field: string, jobId: string) {
  const text = stringValue(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`JobScore feed invalid: position ${jobId} has invalid ${field}.`);
  }
  return date;
}

function customFields(job: JobScoreJob) {
  if (job.custom_fields === undefined || job.custom_fields === null) return [];
  if (!Array.isArray(job.custom_fields)) {
    throw new Error(`JobScore feed invalid: position ${stringValue(job.id)} custom_fields must be a list.`);
  }
  return job.custom_fields.map((item) =>
    item && typeof item === "object" ? item as JobScoreCustomField : {});
}

function employmentType(job: JobScoreJob) {
  return customFields(job)
    .filter((field) => /employment type|commitment/i.test(stringValue(field.label)))
    .map((field) => stringValue(field.content))
    .filter(Boolean)
    .join(" · ");
}

function jobLocation(job: JobScoreJob) {
  return stringValue(job.location) || [
    stringValue(job.city),
    stringValue(job.state),
    stringValue(job.country),
  ].filter(Boolean).join(", ");
}

export function parseJobScoreFeed(payload: unknown): {
  company: string;
  jobs: JobScoreJob[];
} {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("JobScore feed invalid: expected a JSON object.");
  }
  const feed = payload as JobScoreFeed;
  const company = stringValue(feed.company);
  if (!company) throw new Error("JobScore feed invalid: company is required.");
  if (!Array.isArray(feed.jobs)) {
    throw new Error("JobScore feed invalid: jobs must be a list.");
  }
  const seen = new Set<string>();
  const jobs = feed.jobs.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`JobScore feed invalid: position ${index + 1} must be an object.`);
    }
    const job = item as JobScoreJob;
    const id = stringValue(job.id);
    const title = stringValue(job.title);
    const description = stringValue(job.description);
    if (!id) throw new Error(`JobScore feed invalid: position ${index + 1} is missing id.`);
    if (seen.has(id)) throw new Error(`JobScore feed invalid: duplicate position id "${id}".`);
    if (!title) throw new Error(`JobScore feed invalid: position ${id} is missing title.`);
    if (!description) throw new Error(`JobScore feed invalid: position ${id} is missing description.`);
    if (!stringValue(job.detail_url)) {
      throw new Error(`JobScore feed invalid: position ${id} is missing detail_url.`);
    }
    validUrl(job.detail_url, "detail_url", id);
    validUrl(job.apply_url, "apply_url", id);
    dateValue(job.opened_date, "opened_date", id);
    dateValue(job.last_updated_date, "last_updated_date", id);
    customFields(job);
    seen.add(id);
    return job;
  });
  return { company, jobs };
}

async function download(
  client: FetchClient,
  context: ProviderContext,
  runtime: Required<JobScoreRuntime>,
) {
  assertFetchAllowed(context);
  const payload = await executeProviderRequest({
    providerId: "jobscore",
    client,
    url: feedUrl(context),
    context,
    responseType: "json",
    runtime,
  });
  return parseJobScoreFeed(payload);
}

function analyze(job: JobScoreJob, criteria: JobSearchCriteria) {
  const title = stringValue(job.title);
  const location = jobLocation(job);
  const type = employmentType(job);
  const description = stringValue(job.description);
  const relevance = evaluateRoleRelevance(title, {
    department: stringValue(job.department),
  });
  const titleMatch = relevance.relevant;
  const locationMatch = !criteria.locations.length
    || criteria.locations.some((term) => location.toLowerCase().includes(term.toLowerCase()));
  const employmentMatch = !criteria.employmentTypes?.length
    || criteria.employmentTypes.some((term) => type.toLowerCase().includes(term.toLowerCase()));
  const hardTerm = criteria.hardExclusions?.find((term) =>
    `${title}\n${description}`.toLowerCase().includes(term.toLowerCase()));
  const reason: "title" | "location" | "employment_type" | "hard_exclusion" | null =
    !titleMatch ? "title"
      : !locationMatch ? "location"
        : !employmentMatch ? "employment_type"
          : hardTerm ? "hard_exclusion" : null;
  return { titleMatch, locationMatch, reason, hardTerm, relevance };
}

export class JobScoreProvider implements JobSourceProvider {
  readonly id = "jobscore";
  readonly name = "JobScore";
  private readonly runtime: Required<JobScoreRuntime>;

  constructor(
    private readonly client: FetchClient = fetch,
    runtime: JobScoreRuntime = {},
  ) {
    this.runtime = {
      sleep: runtime.sleep ?? ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds))),
      random: runtime.random ?? Math.random,
      now: runtime.now ?? Date.now,
    };
  }

  async discover(criteria: JobSearchCriteria, context: ProviderContext) {
    return (await this.discoverDetailed(criteria, context)).jobs;
  }

  async discoverDetailed(criteria: JobSearchCriteria, context: ProviderContext) {
    const feed = await download(this.client, context, this.runtime);
    const diagnostics: DiscoveryDiagnostics = {
      totalJobsDiscovered: feed.jobs.length,
      titleMatches: 0,
      locationMatches: 0,
      excludedByTitle: 0,
      excludedByLocation: 0,
      excludedByEmploymentType: 0,
      excludedByHardExclusions: 0,
      closedJobs: 0,
      excludedJobs: [],
    };
    const jobs: DiscoveredJob[] = [];
    for (const job of feed.jobs) {
      const id = stringValue(job.id);
      const title = stringValue(job.title);
      const canonicalUrl = validUrl(job.detail_url, "detail_url", id);
      const result = analyze(job, criteria);
      if (result.titleMatch) diagnostics.titleMatches += 1;
      if (result.titleMatch && result.locationMatch) diagnostics.locationMatches += 1;
      if (result.reason) {
        if (result.reason === "title") diagnostics.excludedByTitle += 1;
        if (result.reason === "location") diagnostics.excludedByLocation += 1;
        if (result.reason === "employment_type") diagnostics.excludedByEmploymentType += 1;
        if (result.reason === "hard_exclusion") diagnostics.excludedByHardExclusions += 1;
        diagnostics.excludedJobs.push({
          externalId: id,
          title,
          canonicalUrl,
          reason: result.reason,
          matchedTitleTerms: result.relevance.signals,
          excludedTitleTerms: result.relevance.rejectedBy ? [result.relevance.rejectedBy] : [],
          detail: result.reason === "title" ? result.relevance.detail
            : result.reason === "location" ? `Location did not match: ${criteria.locations.join(", ")}.`
              : result.reason === "employment_type" ? `Employment type did not match: ${criteria.employmentTypes?.join(", ")}.`
                : `Posting contained hard exclusion "${result.hardTerm}".`,
        });
        continue;
      }
      jobs.push({
        providerId: this.id,
        externalId: id,
        title,
        company: context.company,
        location: jobLocation(job),
        canonicalUrl,
        discoveredVia: "canonical",
      });
    }
    return {
      jobs,
      diagnostics,
      feed: {
        complete: true,
        sourceJobIds: feed.jobs.map((job) => stringValue(job.id)).filter(Boolean),
      },
    };
  }

  async fetch(job: DiscoveredJob, context: ProviderContext) {
    const feed = await download(this.client, context, this.runtime);
    const position = feed.jobs.find((item) => stringValue(item.id) === job.externalId);
    if (!position) throw new Error(`JobScore position "${job.externalId}" is no longer public.`);
    return {
      providerId: this.id,
      externalId: job.externalId,
      canonicalUrl: validUrl(position.detail_url, "detail_url", job.externalId),
      payload: position,
      fetchedAt: new Date(),
    };
  }

  normalize(posting: CanonicalJobPosting, context: ProviderContext) {
    const job = posting.payload as JobScoreJob;
    const id = stringValue(job.id);
    return {
      title: stringValue(job.title),
      company: context.company,
      description: textFromHtml(stringValue(job.description)),
      url: validUrl(job.detail_url, "detail_url", id) || posting.canonicalUrl,
      source: this.name,
      salary: "",
      location: jobLocation(job),
      employmentType: employmentType(job),
      department: stringValue(job.department),
      postedAt: dateValue(job.opened_date, "opened_date", id) ?? undefined,
      sourceUpdatedAt: dateValue(job.last_updated_date, "last_updated_date", id) ?? undefined,
      applicationUrl: validUrl(job.apply_url, "apply_url", id) || undefined,
      providerExternalId: posting.externalId,
    };
  }

  validate = validateForImport;

  async health(context: ProviderContext) {
    accountKey(context);
    return configuredHealth(this.name, context);
  }
}
