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

type RecruiteeOffer = {
  id?: number;
  slug?: string;
  title?: string;
  description?: string;
  requirements?: string;
  careers_url?: string;
  employment_type?: string;
  location?: string;
  locations?: Array<{ city?: string; state?: string; country?: string }>;
  remote?: boolean;
};

function offers(payload: unknown): RecruiteeOffer[] {
  if (Array.isArray(payload)) return payload as RecruiteeOffer[];
  if (payload && typeof payload === "object") {
    const value = payload as { offers?: RecruiteeOffer[]; offer?: RecruiteeOffer };
    return value.offers ?? (value.offer ? [value.offer] : []);
  }
  return [];
}

function locationFor(offer: RecruiteeOffer) {
  const structured = offer.locations?.map((item) =>
    [item.city, item.state, item.country].filter(Boolean).join(", ")).filter(Boolean) ?? [];
  return [offer.remote ? "Remote" : "", offer.location, ...structured].filter(Boolean).join(" · ");
}

function matches(offer: RecruiteeOffer, criteria: JobSearchCriteria) {
  const title = stringValue(offer.title).toLowerCase();
  const location = locationFor(offer).toLowerCase();
  return (!criteria.titles.length || criteria.titles.some((term) =>
    title.includes(term.toLowerCase())))
    && (!criteria.locations.length || criteria.locations.some((term) =>
      location.includes(term.toLowerCase())));
}

export class RecruiteeProvider implements JobSourceProvider {
  readonly id = "recruitee";
  readonly name = "Recruitee";

  constructor(private readonly client: FetchClient = fetch) {}

  async discover(criteria: JobSearchCriteria, context: ProviderContext) {
    const company = encodeURIComponent(connectorToken(context));
    const payload = await fetchJson(
      this.client,
      `https://${company}.recruitee.com/api/offers/`,
      context,
    );
    return offers(payload).filter((offer) => matches(offer, criteria)).map(
      (offer): DiscoveredJob => ({
        providerId: this.id,
        externalId: String(offer.slug ?? offer.id ?? ""),
        title: stringValue(offer.title),
        company: context.company,
        location: locationFor(offer),
        canonicalUrl: stringValue(offer.careers_url)
          || `https://${company}.recruitee.com/o/${encodeURIComponent(String(offer.slug ?? ""))}`,
        discoveredVia: "canonical",
      }),
    );
  }

  async fetch(job: DiscoveredJob, context: ProviderContext) {
    const company = encodeURIComponent(connectorToken(context));
    const payload = await fetchJson(
      this.client,
      `https://${company}.recruitee.com/api/offers/${encodeURIComponent(job.externalId)}`,
      context,
    );
    const offer = offers(payload)[0] ?? payload;
    return {
      providerId: this.id,
      externalId: job.externalId,
      canonicalUrl: job.canonicalUrl,
      payload: offer,
      fetchedAt: new Date(),
    };
  }

  normalize(posting: CanonicalJobPosting, context: ProviderContext) {
    const offer = posting.payload as RecruiteeOffer;
    return {
      title: stringValue(offer.title),
      company: context.company,
      description: textFromHtml(
        [stringValue(offer.description), stringValue(offer.requirements)].filter(Boolean).join("\n"),
      ),
      url: stringValue(offer.careers_url) || posting.canonicalUrl,
      source: this.name,
      salary: "",
      location: locationFor(offer),
      employmentType: stringValue(offer.employment_type),
    };
  }

  validate = validateForImport;

  async health(context: ProviderContext) {
    return configuredHealth(this.name, context);
  }
}
