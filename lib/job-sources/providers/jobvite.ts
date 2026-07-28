import {
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
import {
  employerFeedStore,
  type EmployerFeedConfiguration,
  type EmployerFeedStore,
} from "../employer-feed-config";
import { ProviderError } from "../errors";
import { executeProviderRequest, type RequestRuntime } from "../request-policy";
import { stringValue, validateProviderRecords } from "./provider-utils";

type JobviteRecord = Record<string, unknown>;
type JobvitePage = {
  records: JobviteRecord[];
  next: string | null;
};

const MAX_PAGES = 10_000;

function connectorId(context: ProviderContext) {
  if (!context.connectorId) {
    throw new ProviderError(
      "INVALID_CONFIGURATION",
      "The Jobvite feed must be registered before it can run.",
      { providerId: "jobvite" },
    );
  }
  return context.connectorId;
}

function recordList(value: unknown): JobviteRecord[] {
  const candidate = Array.isArray(value)
    ? value
    : value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>).jobs
        ?? (value as Record<string, unknown>).requisitions
        ?? [value]
      : null;
  if (!Array.isArray(candidate)) {
    throw new ProviderError("MALFORMED_FEED", "The Jobvite feed is not a JSON job list.");
  }
  return candidate.map((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new ProviderError("SCHEMA_DRIFT", "The Jobvite feed contains an invalid job record.");
    }
    return record as JobviteRecord;
  });
}

function parsePage(value: unknown): JobvitePage {
  const records = recordList(value);
  let next: string | null = null;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const root = value as Record<string, unknown>;
    const links = root.links && typeof root.links === "object" && !Array.isArray(root.links)
      ? root.links as Record<string, unknown>
      : null;
    const candidate = stringValue(links?.next ?? root.next);
    next = candidate || null;
  }
  return { records, next };
}

function required(record: JobviteRecord, field: string) {
  const value = stringValue(record[field]);
  if (!value) {
    throw new ProviderError(
      field === "eId" ? "MISSING_ID" : "SCHEMA_DRIFT",
      `A Jobvite job is missing ${field}.`,
      { providerId: "jobvite", sourceJobId: stringValue(record.eId) || null },
    );
  }
  return value;
}

function absoluteUrl(record: JobviteRecord, field: string) {
  const value = required(record, field);
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    return url.toString();
  } catch {
    throw new ProviderError(
      "SCHEMA_DRIFT",
      `A Jobvite job has an invalid ${field}.`,
      { providerId: "jobvite", sourceJobId: stringValue(record.eId) || null },
    );
  }
}

function dateValue(value: unknown, field: string, id: string) {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(typeof value === "number" ? value : stringValue(value));
  if (Number.isNaN(date.getTime())) {
    throw new ProviderError(
      "SCHEMA_DRIFT",
      `A Jobvite job has an invalid ${field}.`,
      { providerId: "jobvite", sourceJobId: id },
    );
  }
  return date;
}

function location(record: JobviteRecord) {
  return [
    stringValue(record.location),
    stringValue(record.locationCity),
    stringValue(record.locationState),
    stringValue(record.locationCountry),
  ].filter((value, index, values) => value && values.indexOf(value) === index).join(", ");
}

function isPublished(record: JobviteRecord) {
  return stringValue(record.jobState).toLowerCase() === "open"
    && stringValue(record.postingType).toLowerCase() === "external"
    && record.distribution === true
    && record.internalOnly !== true
    && record.private !== true;
}

export class JobviteProvider implements JobSourceProvider {
  readonly id = "jobvite";
  readonly name = "Jobvite";

  constructor(
    private readonly client: FetchClient = fetch,
    private readonly feeds: EmployerFeedStore = employerFeedStore,
    private readonly runtime: RequestRuntime = {},
  ) {}

  async discover(criteria: JobSearchCriteria, context: ProviderContext) {
    return (await this.discoverDetailed(criteria, context)).jobs;
  }

  async discoverDetailed(criteria: JobSearchCriteria, context: ProviderContext) {
    const configuration = await this.configuration(context);
    const records = await this.download(configuration, context);
    this.certifyRecords(records, configuration);
    const active = records.filter(isPublished);
    validateProviderRecords(this.id, active.map((record) => ({
      id: required(record, "eId"),
      title: required(record, "title"),
      url: absoluteUrl(record, "detailLink"),
    })));

    const diagnostics: DiscoveryDiagnostics = {
      totalJobsDiscovered: active.length,
      titleMatches: 0,
      locationMatches: 0,
      excludedByTitle: 0,
      excludedByLocation: 0,
      excludedByEmploymentType: 0,
      excludedByHardExclusions: 0,
      closedJobs: records.length - active.length,
      excludedJobs: [],
    };
    const jobs: DiscoveredJob[] = [];
    for (const record of active) {
      const title = required(record, "title");
      const place = location(record);
      const titleMatch = !criteria.titles.length
        || criteria.titles.some((term) => title.toLowerCase().includes(term.toLowerCase()));
      const locationMatch = !criteria.locations.length
        || criteria.locations.some((term) => place.toLowerCase().includes(term.toLowerCase()));
      if (titleMatch) diagnostics.titleMatches += 1;
      if (titleMatch && locationMatch) diagnostics.locationMatches += 1;
      if (!titleMatch || !locationMatch) {
        const reason = titleMatch ? "location" as const : "title" as const;
        if (reason === "title") diagnostics.excludedByTitle += 1;
        else diagnostics.excludedByLocation += 1;
        diagnostics.excludedJobs.push({
          externalId: required(record, "eId"),
          title,
          canonicalUrl: absoluteUrl(record, "detailLink"),
          reason,
          matchedTitleTerms: titleMatch ? criteria.titles : [],
          excludedTitleTerms: titleMatch ? [] : criteria.titles,
          detail: reason === "title"
            ? `Title did not match: ${criteria.titles.join(", ")}.`
            : `Location did not match: ${criteria.locations.join(", ")}.`,
        });
        continue;
      }
      jobs.push({
        providerId: this.id,
        externalId: required(record, "eId"),
        title,
        company: context.company,
        location: place,
        canonicalUrl: absoluteUrl(record, "detailLink"),
        discoveredVia: "canonical",
        providerPayload: record,
      });
    }
    return {
      jobs,
      diagnostics,
      feed: {
        complete: true,
        sourceJobIds: active.map((record) => required(record, "eId")),
      },
    };
  }

  async fetch(job: DiscoveredJob) {
    if (!job.providerPayload || typeof job.providerPayload !== "object") {
      throw new ProviderError(
        "INVALID_CONFIGURATION",
        "The certified Jobvite feed record is unavailable.",
        { providerId: this.id, sourceJobId: job.externalId },
      );
    }
    return {
      providerId: this.id,
      externalId: job.externalId,
      canonicalUrl: job.canonicalUrl,
      payload: job.providerPayload,
      fetchedAt: new Date(),
    };
  }

  normalize(posting: CanonicalJobPosting, context: ProviderContext) {
    const record = posting.payload as JobviteRecord;
    return {
      title: required(record, "title"),
      company: context.company,
      description: textFromHtml(stringValue(record.description)),
      url: absoluteUrl(record, "detailLink"),
      applicationUrl: stringValue(record.applyLink)
        ? absoluteUrl(record, "applyLink")
        : undefined,
      source: this.name,
      salary: "",
      location: location(record),
      employmentType: stringValue(record.jobType),
      department: stringValue(record.department ?? record.category),
      postedAt: dateValue(record.sentDate, "sentDate", posting.externalId),
      sourceUpdatedAt: dateValue(record.lastUpdatedDate, "lastUpdatedDate", posting.externalId),
      providerExternalId: posting.externalId,
    };
  }

  validate = validateForImport;

  async health(context: ProviderContext) {
    if (context.enabled === false) {
      return {
        status: "Disabled" as const,
        message: "Jobvite feed is disabled.",
        checkedAt: new Date(),
      };
    }
    const configuration = await this.configuration(context);
    const records = await this.download(configuration, context);
    this.certifyRecords(records, configuration);
    return {
      status: "Healthy" as const,
      message: "Jobvite employer feed is valid and complete.",
      checkedAt: new Date(),
      diagnostics: { records: records.length, feedVersion: configuration.schemaVersion },
    };
  }

  async validateFeed(
    configuration: EmployerFeedConfiguration,
    context: ProviderContext,
  ) {
    const records = await this.download(configuration, context);
    if (!records.length) {
      throw new ProviderError(
        "INVALID_CONFIGURATION",
        "An empty Jobvite feed cannot establish employer ownership or stable identity.",
        { providerId: this.id },
      );
    }
    this.certifyRecords(records, configuration);
    return { records: records.length, complete: true as const };
  }

  private async configuration(context: ProviderContext) {
    const configuration = await this.feeds.get(this.id, connectorId(context));
    if (!configuration) {
      throw new ProviderError(
        "INVALID_CONFIGURATION",
        "A reviewed Jobvite employer feed has not been configured.",
        { providerId: this.id, connectorId: context.connectorId ?? null },
      );
    }
    return configuration;
  }

  private async download(configuration: EmployerFeedConfiguration, context: ProviderContext) {
    let next: string | null = configuration.url;
    const seen = new Set<string>();
    const records: JobviteRecord[] = [];
    const origin = new URL(configuration.url).origin;
    while (next) {
      if (seen.has(next) || seen.size >= MAX_PAGES) {
        throw new ProviderError("SCHEMA_DRIFT", "Jobvite feed pagination did not terminate safely.");
      }
      const pageUrl: URL = new URL(next);
      if (pageUrl.protocol !== "https:" || pageUrl.origin !== origin) {
        throw new ProviderError(
          "SCHEMA_DRIFT",
          "Jobvite pagination left the reviewed employer feed origin.",
          { providerId: this.id, origin: pageUrl.origin },
        );
      }
      seen.add(next);
      const payload = await executeProviderRequest({
        providerId: this.id,
        client: this.client,
        url: next,
        context,
        responseType: "json",
        runtime: this.runtime,
      });
      const page = parsePage(payload);
      records.push(...page.records);
      next = page.next ? new URL(page.next, pageUrl).toString() : null;
    }
    return records;
  }

  private certifyRecords(records: JobviteRecord[], configuration: EmployerFeedConfiguration) {
    if (!records.length) return;
    for (const record of records) {
      required(record, "eId");
      required(record, "title");
      absoluteUrl(record, "detailLink");
      if (stringValue(record.companyId) !== configuration.employerId) {
        throw new ProviderError(
          "INVALID_CONFIGURATION",
          "The Jobvite feed contains a job owned by a different employer.",
          { providerId: this.id, sourceJobId: stringValue(record.eId) || null },
        );
      }
      if (typeof record.distribution !== "boolean"
        || !stringValue(record.jobState)
        || !stringValue(record.postingType)) {
        throw new ProviderError(
          "SCHEMA_DRIFT",
          "The Jobvite feed is missing publication-state fields.",
          { providerId: this.id, sourceJobId: stringValue(record.eId) || null },
        );
      }
    }
    validateProviderRecords(this.id, records.map((record) => ({
      id: required(record, "eId"),
      title: required(record, "title"),
      url: absoluteUrl(record, "detailLink"),
    })));
  }
}
