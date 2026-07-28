import type { JobImportInput } from "../job-import";

export const CONNECTOR_HEALTH_STATUSES = [
  "Healthy",
  "Warning",
  "Disabled",
  "Error",
] as const;

export type ConnectorHealthStatus =
  (typeof CONNECTOR_HEALTH_STATUSES)[number];

export type ConnectorHealth = {
  status: ConnectorHealthStatus;
  message: string;
  checkedAt: Date;
  diagnostics?: Record<string, string | number | boolean | null>;
};

export type JobSearchCriteria = {
  titles: string[];
  locations: string[];
  remote?: boolean;
  hybrid?: boolean;
  country?: string;
  keywords?: string[];
  employmentTypes?: string[];
  hardExclusions?: string[];
};

export type ProviderContext = {
  connectorId?: string;
  company: string;
  careerUrl: string;
  connectorKey: string;
  enabled?: boolean;
  robotsPolicy?: string | null;
  crawlDelay?: number | null;
  rateLimit?: number | null;
  credentialRegion?: string | null;
  feedOrigin?: string | null;
  feedPath?: string | null;
  feedVersion?: string | null;
};

export const PERSONIO_LOCALES = ["de", "en", "fr", "es", "nl", "it", "pt"] as const;
export type PersonioLocale = (typeof PERSONIO_LOCALES)[number];
export const DEFAULT_PERSONIO_LOCALE: PersonioLocale = "en";

export const DEFAULT_PRODUCT_DESIGN_SEARCH: JobSearchCriteria = {
  titles: [
    "Senior Product Designer",
    "Lead Product Designer",
    "Principal Product Designer",
    "Staff Product Designer",
    "Director Product Design",
  ],
  locations: ["Remote", "Hybrid", "United States"],
  remote: true,
  hybrid: true,
  country: "United States",
};

export const EMPTY_JOB_SEARCH: JobSearchCriteria = {
  titles: [],
  locations: [],
  remote: true,
  hybrid: true,
};

export type CrawlSummary = {
  companiesProcessed: number;
  jobsDiscovered: number;
  jobsImported: number;
  duplicates: number;
  failures: number;
  durationMs: number;
};

export type DiscoveredJob = {
  providerId: string;
  externalId: string;
  title: string;
  company: string;
  location?: string;
  canonicalUrl: string;
  providerPayload?: unknown;
  discoveredVia?: "canonical" | "linkedin" | "indeed" | "google-jobs" | "ziprecruiter";
};

export type ExcludedJobDiagnostic = {
  externalId: string;
  title: string;
  canonicalUrl: string;
  reason: "title" | "location" | "employment_type" | "hard_exclusion" | "closed";
  matchedTitleTerms: string[];
  excludedTitleTerms: string[];
  detail: string;
};

export type DiscoveryDiagnostics = {
  totalJobsDiscovered: number;
  titleMatches: number;
  locationMatches: number;
  excludedByTitle: number;
  excludedByLocation: number;
  excludedByEmploymentType: number;
  excludedByHardExclusions: number;
  closedJobs: number;
  excludedJobs: ExcludedJobDiagnostic[];
};

export type ProviderDiscoveryResult = {
  jobs: DiscoveredJob[];
  diagnostics: DiscoveryDiagnostics;
  feed: {
    complete: boolean;
    sourceJobIds: string[];
  };
};

export type CanonicalJobPosting = {
  providerId: string;
  externalId: string;
  canonicalUrl: string;
  payload: unknown;
  fetchedAt: Date;
};

// This alias is deliberate: every adapter must produce exactly the certified
// import pipeline's normalized input model, not a parallel representation.
export type ProviderNormalizedOpportunity = JobImportInput;

export type ProviderValidation = {
  valid: boolean;
  errors: string[];
};

export type DiscoveryImportResult = {
  providerId: string;
  externalId: string;
  canonicalUrl: string;
  jobId: string;
  duplicate: boolean;
  score: number;
  confidence: number;
};

export const JOB_DISPOSITIONS = [
  "IMPORTED",
  "DUPLICATE",
  "EXCLUDED",
  "INVALID",
  "NORMALIZATION_FAILED",
  "PERSISTENCE_FAILED",
] as const;

export type JobDispositionCode = (typeof JOB_DISPOSITIONS)[number];

export type JobDisposition = {
  externalId: string;
  title: string;
  canonicalUrl: string;
  disposition: JobDispositionCode;
  jobId?: string;
  score?: number;
  errorCode?: string;
  message?: string;
};
