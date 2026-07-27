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
import {
  configuredHealth,
  connectorToken,
  stringValue,
  validateProviderRecords,
} from "./provider-utils";
import { ProviderError } from "../errors";

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
    if (Array.isArray(value.offers)) return value.offers;
    if (value.offer) return [value.offer];
  }
  throw new ProviderError("SCHEMA_DRIFT", "Recruitee feed offers must be a list.");
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
    return (await this.discoverDetailed(criteria, context)).jobs;
  }

  async discoverDetailed(criteria: JobSearchCriteria, context: ProviderContext) {
    const company = encodeURIComponent(connectorToken(context));
    const payload = await fetchJson(
      this.id,
      this.client,
      `https://${company}.recruitee.com/api/offers/`,
      context,
    );
    const allOffers = offers(payload);
    validateProviderRecords(this.id, allOffers.map((offer) => ({
      id: String(offer.slug ?? offer.id ?? ""),
      title: stringValue(offer.title),
      url: stringValue(offer.careers_url)
        || `https://${company}.recruitee.com/o/${encodeURIComponent(String(offer.slug ?? ""))}`,
    })));
    const jobs = allOffers.filter((offer) => matches(offer, criteria)).map(
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
    return {
      jobs,
      diagnostics: {
        totalJobsDiscovered: allOffers.length,
        titleMatches: jobs.length,
        locationMatches: jobs.length,
        excludedByTitle: allOffers.length - jobs.length,
        excludedByLocation: 0,
        excludedByEmploymentType: 0,
        excludedByHardExclusions: 0,
        closedJobs: 0,
        excludedJobs: [],
      },
      feed: {
        complete: true,
        sourceJobIds: allOffers
          .map((offer) => String(offer.slug ?? offer.id ?? ""))
          .filter(Boolean),
      },
    };
  }

  async fetch(job: DiscoveredJob, context: ProviderContext) {
    const company = encodeURIComponent(connectorToken(context));
    const payload = await fetchJson(
      this.id,
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
      providerExternalId: posting.externalId,
    };
  }

  validate = validateForImport;

  async health(context: ProviderContext) {
    return configuredHealth(this.name, context);
  }
}
