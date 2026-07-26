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
};

export type ProviderContext = {
  company: string;
  careerUrl: string;
  connectorKey: string;
  enabled?: boolean;
  robotsPolicy?: string | null;
  crawlDelay?: number | null;
  rateLimit?: number | null;
};

export const DEFAULT_PRODUCT_DESIGN_SEARCH: JobSearchCriteria = {
  titles: [
    "Senior Product Designer",
    "Lead Product Designer",
    "Principal Product Designer",
    "Staff Product Designer",
    "Director Product Design",
  ],
  locations: ["Remote", "Hybrid", "United States", "Kansas City"],
  remote: true,
  hybrid: true,
  country: "United States",
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
  discoveredVia?: "canonical" | "linkedin" | "indeed" | "google-jobs" | "ziprecruiter";
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
