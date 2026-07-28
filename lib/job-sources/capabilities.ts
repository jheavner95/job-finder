export type ProviderCapability =
  | "Official public API"
  | "Public job feed"
  | "Employer-authorized API"
  | "Employer-provided feed"
  | "Public career page"
  | "Manual canonical import"
  | "Unsupported"
  | "Blocked";

export type ProviderCapabilityRecord = {
  id: string;
  name: string;
  capability: ProviderCapability;
  implemented: boolean;
  reason: string;
  documentation?: string;
};

export type OperationalProviderCapability = {
  providerId: string;
  supportsRetryAfter: boolean;
  supportsPagination: boolean;
  supportsDeletion: boolean;
  supportsAuthentication: boolean;
  supportsFeed: boolean;
  authenticationType: "none" | "api-key" | "employer-feed";
  pollingFloorMs: number;
  defaultPolling: "Manual" | "Daily";
  requestTimeoutMs: number;
  retryPolicy: {
    maximumAttempts: number;
    retryStatuses: number[];
    retryNetworkErrors: boolean;
  };
  schemaValidator: "adapter";
  diagnosticSupport: "standard";
  feedCompleteness: "complete" | "partial";
  robotsTarget: (connector: {
    connectorKey: string;
    careerUrl: string;
    credentialRegion?: string | null;
    feedOrigin?: string | null;
    feedPath?: string | null;
  }) => { url: string; path: string };
};

const hour = 60 * 60 * 1_000;
const standard = {
  supportsRetryAfter: true,
  supportsPagination: false,
  supportsDeletion: true,
  supportsAuthentication: false,
  supportsFeed: false,
  authenticationType: "none" as const,
  pollingFloorMs: 0,
  defaultPolling: "Manual" as const,
  requestTimeoutMs: 15_000,
  retryPolicy: {
    maximumAttempts: 3,
    retryStatuses: [429, 502, 503, 504],
    retryNetworkErrors: true,
  },
  schemaValidator: "adapter" as const,
  diagnosticSupport: "standard" as const,
  feedCompleteness: "complete" as const,
};
const encoded = (value: string) => encodeURIComponent(value);

export const OPERATIONAL_PROVIDER_CAPABILITIES: OperationalProviderCapability[] = [
  {
    ...standard,
    providerId: "greenhouse",
    robotsTarget: ({ connectorKey }) => ({
      url: "https://boards-api.greenhouse.io/robots.txt",
      path: `/v1/boards/${encoded(connectorKey)}/jobs`,
    }),
  },
  {
    ...standard,
    providerId: "lever",
    robotsTarget: ({ connectorKey, careerUrl }) => ({
      url: `https://api${careerUrl.includes("jobs.eu.lever.co") ? ".eu" : ""}.lever.co/robots.txt`,
      path: `/v0/postings/${encoded(connectorKey)}`,
    }),
  },
  {
    ...standard,
    providerId: "ashby",
    robotsTarget: ({ connectorKey }) => ({
      url: "https://api.ashbyhq.com/robots.txt",
      path: `/posting-api/job-board/${encoded(connectorKey)}`,
    }),
  },
  {
    ...standard,
    providerId: "smartrecruiters",
    supportsPagination: true,
    feedCompleteness: "partial",
    robotsTarget: ({ connectorKey }) => ({
      url: "https://api.smartrecruiters.com/robots.txt",
      path: `/v1/companies/${encoded(connectorKey)}/postings`,
    }),
  },
  {
    ...standard,
    providerId: "workable",
    robotsTarget: ({ connectorKey }) => ({
      url: "https://www.workable.com/robots.txt",
      path: `/api/accounts/${encoded(connectorKey)}`,
    }),
  },
  {
    ...standard,
    providerId: "recruitee",
    robotsTarget: ({ connectorKey }) => ({
      url: `https://${connectorKey}.recruitee.com/robots.txt`,
      path: "/api/offers/",
    }),
  },
  {
    ...standard,
    providerId: "comeet",
    robotsTarget: ({ connectorKey }) => ({
      url: "https://www.comeet.co/robots.txt",
      path: `/careers-api/2.0/company/${encoded(connectorKey.split(":", 1)[0])}/positions`,
    }),
  },
  {
    ...standard,
    providerId: "personio",
    robotsTarget: ({ connectorKey }) => ({
      url: `https://${connectorKey}.jobs.personio.de/robots.txt`,
      path: "/xml",
    }),
  },
  {
    ...standard,
    providerId: "jobscore",
    pollingFloorMs: hour,
    defaultPolling: "Daily",
    robotsTarget: ({ connectorKey }) => ({
      url: "https://careers.jobscore.com/robots.txt",
      path: `/jobs/${encoded(connectorKey)}/feed.json`,
    }),
  },
  {
    ...standard,
    providerId: "teamtailor",
    supportsPagination: true,
    supportsAuthentication: true,
    authenticationType: "api-key",
    defaultPolling: "Daily",
    robotsTarget: ({ credentialRegion }) => {
      const host = credentialRegion === "na"
        ? "api.na.teamtailor.com"
        : "api.teamtailor.com";
      return {
        url: `https://${host}/robots.txt`,
        path: "/v1/jobs",
      };
    },
  },
  {
    ...standard,
    providerId: "jobvite",
    supportsFeed: true,
    supportsPagination: true,
    authenticationType: "employer-feed",
    pollingFloorMs: hour,
    defaultPolling: "Daily",
    robotsTarget: ({ feedOrigin, feedPath }) => ({
      url: `${feedOrigin ?? "https://invalid.local"}/robots.txt`,
      path: feedPath ?? "/blocked",
    }),
  },
  {
    ...standard,
    providerId: "workday",
    supportsRetryAfter: false,
    supportsDeletion: false,
    feedCompleteness: "partial",
    robotsTarget: () => ({
      url: "https://invalid.local/robots.txt",
      path: "/blocked",
    }),
  },
];

export function getOperationalCapability(providerId: string) {
  const capability = OPERATIONAL_PROVIDER_CAPABILITIES.find(
    (candidate) => candidate.providerId === providerId,
  );
  if (!capability) {
    throw new Error(`Operational capabilities are not configured for ${providerId}.`);
  }
  return capability;
}

export const PROVIDER_CAPABILITIES: ProviderCapabilityRecord[] = [
  { id: "greenhouse", name: "Greenhouse", capability: "Official public API", implemented: true, reason: "Public Job Board API, scoped to one registered employer board at a time.", documentation: "https://developers.greenhouse.io/job-board.html" },
  { id: "lever", name: "Lever", capability: "Public job feed", implemented: true, reason: "Public postings feed." },
  { id: "ashby", name: "Ashby", capability: "Public job feed", implemented: true, reason: "Public job board endpoint." },
  { id: "workable", name: "Workable", capability: "Public job feed", implemented: true, reason: "Public account jobs feed." },
  { id: "smartrecruiters", name: "SmartRecruiters", capability: "Official public API", implemented: true, reason: "Public postings API." },
  { id: "teamtailor", name: "Teamtailor", capability: "Employer-authorized API", implemented: true, reason: "Official jobs API with an explicit employer-issued Public read API key.", documentation: "https://docs.teamtailor.com/" },
  { id: "jobvite", name: "Jobvite", capability: "Employer-provided feed", implemented: true, reason: "Reviewed employer-provided Jobvite JSON feed; disabled until schema, ownership, completeness, and robots checks pass.", documentation: "https://careers.jobvite.com/careersite/job_feed_api.html" },
  { id: "recruitee", name: "Recruitee", capability: "Official public API", implemented: true, reason: "Official Careers Site API is documented as unauthenticated.", documentation: "https://docs.recruitee.com/reference/intro-to-careers-site-api" },
  { id: "bamboohr", name: "BambooHR", capability: "Unsupported", implemented: false, reason: "Official applicant-tracking jobs API requires authenticated ATS access." },
  { id: "pinpoint", name: "Pinpoint", capability: "Public job feed", implemented: false, reason: "Certified unauthenticated postings.json feed; connector implementation is the remaining step.", documentation: "https://developers.pinpointhq.com/docs/jobs-json-endpoint" },
  { id: "comeet", name: "Comeet", capability: "Official public API", implemented: true, reason: "Official Careers API uses an employer-scoped public company UID and token.", documentation: "https://developers.comeet.com/reference/careers-api-overview" },
  { id: "personio", name: "Personio", capability: "Public job feed", implemented: true, reason: "Official employer-scoped public XML career-site feed with deterministic locale selection.", documentation: "https://developer.personio.de/docs/retrieving-open-job-positions" },
  { id: "jobscore", name: "JobScore", capability: "Public job feed", implemented: true, reason: "Official employer-scoped public JSON feed; default daily polling with a hard one-hour minimum.", documentation: "https://support.jobscore.com/hc/en-us/articles/202001320-Developers-Guide-to-Job-Feed-APIs" },
  { id: "jazzhr", name: "JazzHR", capability: "Unsupported", implemented: false, reason: "No verified unauthenticated official endpoint has been approved for this connector." },
  { id: "icims", name: "iCIMS", capability: "Unsupported", implemented: false, reason: "Public career pages vary by tenant; no stable permitted API contract is configured." },
  { id: "oracle", name: "Oracle Recruiting Cloud", capability: "Unsupported", implemented: false, reason: "Tenant APIs require configuration and access verification; no speculative adapter is provided." },
  { id: "successfactors", name: "SAP SuccessFactors", capability: "Unsupported", implemented: false, reason: "No verified unauthenticated official jobs API is configured." },
  { id: "ukg", name: "UKG Recruiting", capability: "Unsupported", implemented: false, reason: "No verified unauthenticated official jobs API is configured." },
  { id: "dayforce", name: "Dayforce", capability: "Unsupported", implemented: false, reason: "No verified unauthenticated official jobs API is configured." },
  { id: "workday", name: "Workday", capability: "Blocked", implemented: true, reason: "Undocumented career-site route is intentionally blocked; official tenant APIs require authorization." },
];
