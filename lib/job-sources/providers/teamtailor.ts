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
  providerCredentialStore,
  type ProviderCredentialStore,
  type TeamtailorCredential,
} from "../credentials";
import { isProviderError, ProviderError } from "../errors";
import { executeProviderRequest, type RequestRuntime } from "../request-policy";
import { stringValue, validateProviderRecords } from "./provider-utils";

type JsonApiResource = {
  id?: unknown;
  type?: unknown;
  attributes?: unknown;
  relationships?: unknown;
};

type TeamtailorDocument = {
  data?: unknown;
  included?: unknown;
  links?: unknown;
  meta?: unknown;
};

type TeamtailorPosting = {
  resource: JsonApiResource;
  included: JsonApiResource[];
};

const DEFAULT_API_VERSION = "20240404";
const MAX_PAGES = 10_000;

function connectorId(context: ProviderContext) {
  if (!context.connectorId) {
    throw new ProviderError(
      "INVALID_CONFIGURATION",
      "The Teamtailor connector must be persisted before credentials can be used.",
      { providerId: "teamtailor" },
    );
  }
  return context.connectorId;
}

function apiBase(credential: TeamtailorCredential) {
  return credential.region === "na"
    ? "https://api.na.teamtailor.com"
    : "https://api.teamtailor.com";
}

function attributes(resource: JsonApiResource) {
  if (!resource.attributes || typeof resource.attributes !== "object"
    || Array.isArray(resource.attributes)) {
    throw new ProviderError(
      "SCHEMA_DRIFT",
      "A Teamtailor job is missing its attributes object.",
      { providerId: "teamtailor", sourceJobId: stringValue(resource.id) },
    );
  }
  return resource.attributes as Record<string, unknown>;
}

function resources(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new ProviderError(
      "SCHEMA_DRIFT",
      `The Teamtailor ${field} field must be a list.`,
      { providerId: "teamtailor" },
    );
  }
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ProviderError(
        "SCHEMA_DRIFT",
        `The Teamtailor ${field} field contains an invalid resource.`,
        { providerId: "teamtailor" },
      );
    }
    return item as JsonApiResource;
  });
}

function included(value: unknown) {
  return value === undefined ? [] : resources(value, "included");
}

function linkNext(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const next = (value as Record<string, unknown>).next;
  return typeof next === "string" && next.trim() ? next : null;
}

function attribute(resource: JsonApiResource, name: string) {
  return attributes(resource)[name];
}

function canonicalUrl(resource: JsonApiResource) {
  return stringValue(attribute(resource, "careersite-job-url"));
}

function relationshipIds(resource: JsonApiResource, name: string) {
  const relationships = resource.relationships;
  if (!relationships || typeof relationships !== "object" || Array.isArray(relationships)) return [];
  const relation = (relationships as Record<string, unknown>)[name];
  if (!relation || typeof relation !== "object" || Array.isArray(relation)) return [];
  const data = (relation as Record<string, unknown>).data;
  const values = Array.isArray(data) ? data : data ? [data] : [];
  return values.map((item) =>
    item && typeof item === "object" ? stringValue((item as Record<string, unknown>).id) : "",
  ).filter(Boolean);
}

function relatedNames(posting: TeamtailorPosting, type: string, ids: string[]) {
  return posting.included
    .filter((item) => stringValue(item.type) === type && ids.includes(stringValue(item.id)))
    .map((item) => stringValue(attribute(item, "name")))
    .filter(Boolean);
}

function dateAttribute(resource: JsonApiResource, name: string) {
  const value = stringValue(attribute(resource, name));
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ProviderError(
      "SCHEMA_DRIFT",
      `A Teamtailor job has an invalid ${name} value.`,
      { providerId: "teamtailor", sourceJobId: stringValue(resource.id) },
    );
  }
  return date;
}

function analyze(posting: TeamtailorPosting, criteria: JobSearchCriteria) {
  const title = stringValue(attribute(posting.resource, "title"));
  const locations = relatedNames(
    posting,
    "locations",
    relationshipIds(posting.resource, "locations"),
  );
  const remote = stringValue(attribute(posting.resource, "remote-status"));
  const location = [...locations, remote && remote !== "none" ? remote : ""].filter(Boolean).join(" · ");
  const titleMatch = !criteria.titles.length
    || criteria.titles.some((term) => title.toLowerCase().includes(term.toLowerCase()));
  const locationMatch = !criteria.locations.length
    || criteria.locations.some((term) => location.toLowerCase().includes(term.toLowerCase()));
  return { title, location, titleMatch, locationMatch };
}

export class TeamtailorProvider implements JobSourceProvider {
  readonly id = "teamtailor";
  readonly name = "Teamtailor";

  constructor(
    private readonly client: FetchClient = fetch,
    private readonly credentials: ProviderCredentialStore = providerCredentialStore,
    private readonly runtime: RequestRuntime = {},
  ) {}

  async validateAuthentication(context: ProviderContext) {
    const credential = await this.credential(context);
    await this.request(
      `${apiBase(credential)}/v1/jobs?page[size]=1`,
      context,
      credential,
    );
    return {
      status: "Healthy" as const,
      message: "Teamtailor credentials are valid.",
      checkedAt: new Date(),
      diagnostics: {
        authenticationType: "api-key",
        credentialConfigured: true,
        region: credential.region,
      },
    };
  }

  async discover(criteria: JobSearchCriteria, context: ProviderContext) {
    return (await this.discoverDetailed(criteria, context)).jobs;
  }

  async discoverDetailed(criteria: JobSearchCriteria, context: ProviderContext) {
    const credential = await this.credential(context);
    let next: string | null =
      `${apiBase(credential)}/v1/jobs?page[size]=30&include=department,locations&filter[status]=published&filter[feed]=public`;
    const seenPages = new Set<string>();
    const postings: TeamtailorPosting[] = [];
    while (next) {
      if (seenPages.has(next) || seenPages.size >= MAX_PAGES) {
        throw new ProviderError(
          "SCHEMA_DRIFT",
          "Teamtailor pagination did not terminate safely.",
          { providerId: this.id, pagesProcessed: seenPages.size },
        );
      }
      this.assertApiUrl(next, credential);
      seenPages.add(next);
      const document = await this.request(next, context, credential) as TeamtailorDocument;
      const pageResources = resources(document.data, "data");
      const pageIncluded = included(document.included);
      postings.push(...pageResources.map((resource) => ({
        resource,
        included: pageIncluded,
      })));
      next = linkNext(document.links);
    }

    validateProviderRecords(this.id, postings.map((posting) => ({
      id: stringValue(posting.resource.id),
      title: stringValue(attribute(posting.resource, "title")),
      url: canonicalUrl(posting.resource),
    })));
    const diagnostics: DiscoveryDiagnostics = {
      totalJobsDiscovered: postings.length,
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
    for (const posting of postings) {
      const result = analyze(posting, criteria);
      if (result.titleMatch) diagnostics.titleMatches += 1;
      if (result.titleMatch && result.locationMatch) diagnostics.locationMatches += 1;
      if (!result.titleMatch || !result.locationMatch) {
        const reason = result.titleMatch ? "location" as const : "title" as const;
        if (reason === "title") diagnostics.excludedByTitle += 1;
        else diagnostics.excludedByLocation += 1;
        diagnostics.excludedJobs.push({
          externalId: stringValue(posting.resource.id),
          title: result.title,
          canonicalUrl: canonicalUrl(posting.resource),
          reason,
          matchedTitleTerms: result.titleMatch ? criteria.titles : [],
          excludedTitleTerms: result.titleMatch ? [] : criteria.titles,
          detail: reason === "title"
            ? `Title did not match: ${criteria.titles.join(", ")}.`
            : `Location did not match: ${criteria.locations.join(", ")}.`,
        });
        continue;
      }
      jobs.push({
        providerId: this.id,
        externalId: stringValue(posting.resource.id),
        title: result.title,
        company: context.company,
        location: result.location,
        canonicalUrl: canonicalUrl(posting.resource),
        discoveredVia: "canonical",
      });
    }
    return {
      jobs,
      diagnostics,
      feed: {
        complete: true,
        sourceJobIds: postings.map((posting) => stringValue(posting.resource.id)),
      },
    };
  }

  async fetch(job: DiscoveredJob, context: ProviderContext) {
    const credential = await this.credential(context);
    const payload = await this.request(
      `${apiBase(credential)}/v1/jobs/${encodeURIComponent(job.externalId)}?include=department,locations`,
      context,
      credential,
    ) as TeamtailorDocument;
    if (!payload.data || Array.isArray(payload.data) || typeof payload.data !== "object") {
      throw new ProviderError(
        "SCHEMA_DRIFT",
        "Teamtailor job detail is missing its data resource.",
        { providerId: this.id, sourceJobId: job.externalId },
      );
    }
    return {
      providerId: this.id,
      externalId: job.externalId,
      canonicalUrl: job.canonicalUrl,
      payload: {
        resource: payload.data as JsonApiResource,
        included: included(payload.included),
      } satisfies TeamtailorPosting,
      fetchedAt: new Date(),
    };
  }

  normalize(posting: CanonicalJobPosting, context: ProviderContext) {
    const payload = posting.payload as TeamtailorPosting;
    const resource = payload.resource;
    const locationNames = relatedNames(
      payload,
      "locations",
      relationshipIds(resource, "locations"),
    );
    const remote = stringValue(attribute(resource, "remote-status"));
    return {
      title: stringValue(attribute(resource, "title")),
      company: context.company,
      description: textFromHtml([
        stringValue(attribute(resource, "pitch")),
        stringValue(attribute(resource, "body")),
      ].filter(Boolean).join("\n")),
      url: canonicalUrl(resource) || posting.canonicalUrl,
      applicationUrl: stringValue(attribute(resource, "careersite-job-apply-url")) || undefined,
      source: this.name,
      salary: "",
      location: [
        ...locationNames,
        remote && remote !== "none" ? remote : "",
      ].filter(Boolean).join(" · "),
      employmentType: stringValue(attribute(resource, "employment-type")),
      department: relatedNames(
        payload,
        "departments",
        relationshipIds(resource, "department"),
      )[0] ?? "",
      postedAt: dateAttribute(resource, "created-at"),
      sourceUpdatedAt: dateAttribute(resource, "updated-at"),
      providerExternalId: posting.externalId,
    };
  }

  validate = validateForImport;

  async health(context: ProviderContext) {
    if (context.enabled === false) {
      return {
        status: "Disabled" as const,
        message: "Teamtailor connector is disabled.",
        checkedAt: new Date(),
        diagnostics: { credentialConfigured: false },
      };
    }
    return this.validateAuthentication(context);
  }

  private async credential(context: ProviderContext) {
    const value = await this.credentials.get(this.id, connectorId(context));
    if (!value) {
      throw new ProviderError(
        "AUTH_REQUIRED",
        "Teamtailor credentials have not been configured.",
        { providerId: this.id, connectorId: context.connectorId ?? null },
      );
    }
    return value;
  }

  private async request(
    url: string,
    context: ProviderContext,
    credential: TeamtailorCredential,
  ) {
    try {
      return await executeProviderRequest({
        providerId: this.id,
        client: this.client,
        url,
        context,
        responseType: "json",
        runtime: this.runtime,
        init: {
          headers: {
            Authorization: `Token token=${credential.apiKey}`,
            "X-Api-Version": credential.apiVersion || DEFAULT_API_VERSION,
          },
        },
      });
    } catch (error) {
      if (isProviderError(error) && error.code === "AUTH_REQUIRED") {
        throw new ProviderError(
          "AUTH_EXPIRED",
          "The configured Teamtailor credential was rejected.",
          { providerId: this.id, connectorId: context.connectorId ?? null },
          { cause: error },
        );
      }
      throw error;
    }
  }

  private assertApiUrl(value: string, credential: TeamtailorCredential) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new ProviderError(
        "SCHEMA_DRIFT",
        "Teamtailor returned an invalid pagination URL.",
        { providerId: this.id },
      );
    }
    if (url.protocol !== "https:" || url.origin !== apiBase(credential)) {
      throw new ProviderError(
        "SCHEMA_DRIFT",
        "Teamtailor pagination left the authorized API origin.",
        { providerId: this.id, origin: url.origin },
      );
    }
  }
}
