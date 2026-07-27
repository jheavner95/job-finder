import { XMLParser, XMLValidator } from "fast-xml-parser";

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
import {
  DEFAULT_PERSONIO_LOCALE,
  PERSONIO_LOCALES,
  type PersonioLocale,
} from "../types";
import { configuredHealth, stringValue } from "./provider-utils";
import { executeProviderRequest } from "../request-policy";

type PersonioDescription = { name?: unknown; value?: unknown };

export type PersonioPosition = {
  id?: unknown;
  subcompany?: unknown;
  office?: unknown;
  department?: unknown;
  recruitingCategory?: unknown;
  name?: unknown;
  jobDescriptions?: { jobDescription?: PersonioDescription | PersonioDescription[] };
  employmentType?: unknown;
  seniority?: unknown;
  schedule?: unknown;
  yearsOfExperience?: unknown;
  keywords?: unknown;
  occupation?: unknown;
  occupationCategory?: unknown;
};

type PersonioFeed = {
  "workzag-jobs"?: "" | {
    position?: PersonioPosition | PersonioPosition[];
  };
};

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
  processEntities: false,
  isArray: (name) => name === "position" || name === "jobDescription",
});

function accountKey(context: ProviderContext) {
  const key = context.connectorKey.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(key)) {
    throw new Error("Personio connector key must be a valid jobs.personio.de account name.");
  }
  return key;
}

export function personioLocale(context: ProviderContext): PersonioLocale {
  let configured = "";
  try {
    configured = new URL(context.careerUrl).searchParams.get("language")?.toLowerCase() ?? "";
  } catch {
    throw new Error("Personio career URL is invalid.");
  }
  if (!configured) return DEFAULT_PERSONIO_LOCALE;
  if (!PERSONIO_LOCALES.includes(configured as PersonioLocale)) {
    throw new Error(
      `Personio locale "${configured}" is unsupported. Use ${PERSONIO_LOCALES.join(", ")}.`,
    );
  }
  return configured as PersonioLocale;
}

function feedUrl(context: ProviderContext) {
  return `https://${accountKey(context)}.jobs.personio.de/xml?language=${personioLocale(context)}`;
}

function canonicalUrl(context: ProviderContext, id: string) {
  return `https://${accountKey(context)}.jobs.personio.de/job/${encodeURIComponent(id)}`;
}

export function parsePersonioFeed(xml: string): PersonioPosition[] {
  if (!xml.trim()) throw new Error("Personio feed invalid: response was empty.");
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new Error(
      `Personio feed malformed: ${validation.err.msg} at line ${validation.err.line}.`,
    );
  }
  const feed = parser.parse(xml) as PersonioFeed;
  const root = feed["workzag-jobs"];
  if (root === undefined || root === null) {
    throw new Error("Personio feed invalid: expected workzag-jobs root.");
  }
  if (root === "") return [];
  if (typeof root !== "object") {
    throw new Error("Personio feed invalid: workzag-jobs root must be an element.");
  }
  const positions = root.position ?? [];
  if (!Array.isArray(positions)) throw new Error("Personio feed invalid: position must be a list.");
  const seen = new Set<string>();
  for (const [index, position] of positions.entries()) {
    const id = stringValue(position.id).trim();
    const title = stringValue(position.name).trim();
    if (!id) throw new Error(`Personio feed invalid: position ${index + 1} is missing id.`);
    if (!title) {
      throw new Error(`Personio feed invalid: position ${id} is missing name.`);
    }
    if (seen.has(id)) throw new Error(`Personio feed invalid: duplicate position id "${id}".`);
    seen.add(id);
  }
  return positions;
}

function descriptions(position: PersonioPosition) {
  const entries = position.jobDescriptions?.jobDescription;
  const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
  return list.map((entry) => ({
    name: stringValue(entry.name),
    value: stringValue(entry.value),
  })).filter((entry) => entry.value);
}

function employment(position: PersonioPosition) {
  return [stringValue(position.employmentType), stringValue(position.schedule)]
    .filter(Boolean)
    .join(" · ");
}

function analyze(position: PersonioPosition, criteria: JobSearchCriteria) {
  const title = stringValue(position.name);
  const location = stringValue(position.office);
  const type = employment(position);
  const content = descriptions(position).map((item) => item.value).join("\n");
  const titleMatch = !criteria.titles.length
    || criteria.titles.some((term) => title.toLowerCase().includes(term.toLowerCase()));
  const locationMatch = !criteria.locations.length
    || criteria.locations.some((term) => location.toLowerCase().includes(term.toLowerCase()));
  const employmentMatch = !criteria.employmentTypes?.length
    || criteria.employmentTypes.some((term) => type.toLowerCase().includes(term.toLowerCase()));
  const hardTerm = criteria.hardExclusions?.find((term) =>
    `${title}\n${content}`.toLowerCase().includes(term.toLowerCase()));
  const reason: "title" | "location" | "employment_type" | "hard_exclusion" | null =
    !titleMatch ? "title"
    : !locationMatch ? "location"
      : !employmentMatch ? "employment_type"
        : hardTerm ? "hard_exclusion"
            : null;
  return { titleMatch, locationMatch, reason, hardTerm };
}

async function download(client: FetchClient, context: ProviderContext) {
  assertFetchAllowed(context);
  const xml = await executeProviderRequest({
    providerId: "personio",
    client,
    url: feedUrl(context),
    context,
    responseType: "text",
  });
  return parsePersonioFeed(xml as string);
}

export class PersonioProvider implements JobSourceProvider {
  readonly id = "personio";
  readonly name = "Personio";

  constructor(private readonly client: FetchClient = fetch) {}

  async discover(criteria: JobSearchCriteria, context: ProviderContext) {
    return (await this.discoverDetailed(criteria, context)).jobs;
  }

  async discoverDetailed(criteria: JobSearchCriteria, context: ProviderContext) {
    const positions = await download(this.client, context);
    const diagnostics: DiscoveryDiagnostics = {
      totalJobsDiscovered: positions.length,
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
    for (const position of positions) {
      const id = stringValue(position.id);
      const title = stringValue(position.name);
      const result = analyze(position, criteria);
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
          canonicalUrl: canonicalUrl(context, id),
          reason: result.reason,
          matchedTitleTerms: result.titleMatch ? criteria.titles : [],
          excludedTitleTerms: result.titleMatch ? [] : criteria.titles,
          detail: result.reason === "title" ? `Title did not match: ${criteria.titles.join(", ")}.`
            : result.reason === "location" ? `Office did not match: ${criteria.locations.join(", ")}.`
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
        location: stringValue(position.office),
        canonicalUrl: canonicalUrl(context, id),
        discoveredVia: "canonical",
      });
    }
    return {
      jobs,
      diagnostics,
      feed: {
        complete: true,
        sourceJobIds: positions.map((position) => stringValue(position.id)).filter(Boolean),
      },
    };
  }

  async fetch(job: DiscoveredJob, context: ProviderContext) {
    const positions = await download(this.client, context);
    const position = positions.find((item) => stringValue(item.id) === job.externalId);
    if (!position) throw new Error(`Personio position "${job.externalId}" is no longer public.`);
    return {
      providerId: this.id,
      externalId: job.externalId,
      canonicalUrl: canonicalUrl(context, job.externalId),
      payload: position,
      fetchedAt: new Date(),
    };
  }

  normalize(posting: CanonicalJobPosting, context: ProviderContext) {
    const position = posting.payload as PersonioPosition;
    return {
      title: stringValue(position.name),
      company: context.company,
      description: textFromHtml(
        descriptions(position)
          .map((item) => item.name ? `${item.name}\n${item.value}` : item.value)
          .join("\n"),
      ),
      url: posting.canonicalUrl,
      source: this.name,
      salary: "",
      location: stringValue(position.office),
      employmentType: employment(position),
      department: stringValue(position.department),
      providerExternalId: posting.externalId,
    };
  }

  validate = validateForImport;

  async health(context: ProviderContext) {
    accountKey(context);
    personioLocale(context);
    return configuredHealth(this.name, context);
  }
}
