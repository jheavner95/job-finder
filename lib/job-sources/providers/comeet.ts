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
} from "../types";
import { configuredHealth, connectorToken, stringValue } from "./provider-utils";

type ComeetPosition = {
  uid?: string;
  name?: string;
  url_recruit_hosted_page?: string;
  position_url?: string;
  location?: { name?: string };
  employment_type?: string;
  details?: Array<{ name?: string; value?: string }>;
};

function credentials(context: ProviderContext) {
  const [companyUid, token] = connectorToken(context).split(":", 2);
  if (!companyUid || !token) {
    throw new Error("Comeet source key must use the public companyUid:token format.");
  }
  return { companyUid, token };
}

function positions(payload: unknown) {
  if (Array.isArray(payload)) return payload as ComeetPosition[];
  if (payload && typeof payload === "object") {
    const value = payload as { positions?: ComeetPosition[]; position?: ComeetPosition };
    return value.positions ?? (value.position ? [value.position] : []);
  }
  return [];
}

function matches(position: ComeetPosition, criteria: JobSearchCriteria) {
  const title = stringValue(position.name).toLowerCase();
  const location = stringValue(position.location?.name).toLowerCase();
  return (!criteria.titles.length || criteria.titles.some((term) =>
    title.includes(term.toLowerCase())))
    && (!criteria.locations.length || criteria.locations.some((term) =>
      location.includes(term.toLowerCase())));
}

export class ComeetProvider implements JobSourceProvider {
  readonly id = "comeet";
  readonly name = "Comeet";

  constructor(private readonly client: FetchClient = fetch) {}

  async discover(criteria: JobSearchCriteria, context: ProviderContext) {
    const { companyUid, token } = credentials(context);
    const payload = await fetchJson(
      this.client,
      `https://www.comeet.co/careers-api/2.0/company/${encodeURIComponent(companyUid)}/positions?token=${encodeURIComponent(token)}`,
      context,
    );
    return positions(payload).filter((position) => matches(position, criteria)).map(
      (position): DiscoveredJob => ({
        providerId: this.id,
        externalId: stringValue(position.uid),
        title: stringValue(position.name),
        company: context.company,
        location: stringValue(position.location?.name),
        canonicalUrl: stringValue(position.url_recruit_hosted_page),
        discoveredVia: "canonical",
      }),
    );
  }

  async fetch(job: DiscoveredJob, context: ProviderContext) {
    const { companyUid, token } = credentials(context);
    const payload = await fetchJson(
      this.client,
      `https://www.comeet.co/careers-api/2.0/company/${encodeURIComponent(companyUid)}/positions/${encodeURIComponent(job.externalId)}?token=${encodeURIComponent(token)}`,
      context,
    );
    return {
      providerId: this.id,
      externalId: job.externalId,
      canonicalUrl: job.canonicalUrl,
      payload: positions(payload)[0] ?? payload,
      fetchedAt: new Date(),
    };
  }

  normalize(posting: CanonicalJobPosting, context: ProviderContext) {
    const position = posting.payload as ComeetPosition;
    const detail = (name: RegExp) => position.details?.filter((item) =>
      name.test(stringValue(item.name))).map((item) => stringValue(item.value)).join("\n") ?? "";
    return {
      title: stringValue(position.name),
      company: context.company,
      description: textFromHtml(detail(/description|requirements/i)),
      url: stringValue(position.url_recruit_hosted_page) || posting.canonicalUrl,
      source: this.name,
      salary: detail(/salary|compensation/i),
      location: stringValue(position.location?.name),
      employmentType: stringValue(position.employment_type),
    };
  }

  validate = validateForImport;

  async health(context: ProviderContext) {
    credentials(context);
    return configuredHealth(this.name, context);
  }
}
