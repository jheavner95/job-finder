export type ProviderCapability =
  | "Official public API"
  | "Public job feed"
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

export const PROVIDER_CAPABILITIES: ProviderCapabilityRecord[] = [
  { id: "greenhouse", name: "Greenhouse", capability: "Official public API", implemented: true, reason: "Public Job Board API, scoped to one registered employer board at a time.", documentation: "https://developers.greenhouse.io/job-board.html" },
  { id: "lever", name: "Lever", capability: "Public job feed", implemented: true, reason: "Public postings feed." },
  { id: "ashby", name: "Ashby", capability: "Public job feed", implemented: true, reason: "Public job board endpoint." },
  { id: "workable", name: "Workable", capability: "Public job feed", implemented: true, reason: "Public account jobs feed." },
  { id: "smartrecruiters", name: "SmartRecruiters", capability: "Official public API", implemented: true, reason: "Public postings API." },
  { id: "teamtailor", name: "Teamtailor", capability: "Unsupported", implemented: false, reason: "Official jobs API requires a customer-issued API key, including public-scope access." },
  { id: "recruitee", name: "Recruitee", capability: "Official public API", implemented: true, reason: "Official Careers Site API is documented as unauthenticated.", documentation: "https://docs.recruitee.com/reference/intro-to-careers-site-api" },
  { id: "bamboohr", name: "BambooHR", capability: "Unsupported", implemented: false, reason: "Official applicant-tracking jobs API requires authenticated ATS access." },
  { id: "pinpoint", name: "Pinpoint", capability: "Unsupported", implemented: false, reason: "Official API documentation points to a separate careers JSON endpoint, but its public contract and robots allowance require per-site verification before implementation." },
  { id: "comeet", name: "Comeet", capability: "Official public API", implemented: true, reason: "Official Careers API uses an employer-scoped public company UID and token.", documentation: "https://developers.comeet.com/reference/careers-api-overview" },
  { id: "jazzhr", name: "JazzHR", capability: "Unsupported", implemented: false, reason: "No verified unauthenticated official endpoint has been approved for this connector." },
  { id: "icims", name: "iCIMS", capability: "Unsupported", implemented: false, reason: "Public career pages vary by tenant; no stable permitted API contract is configured." },
  { id: "oracle", name: "Oracle Recruiting Cloud", capability: "Unsupported", implemented: false, reason: "Tenant APIs require configuration and access verification; no speculative adapter is provided." },
  { id: "successfactors", name: "SAP SuccessFactors", capability: "Unsupported", implemented: false, reason: "No verified unauthenticated official jobs API is configured." },
  { id: "ukg", name: "UKG Recruiting", capability: "Unsupported", implemented: false, reason: "No verified unauthenticated official jobs API is configured." },
  { id: "dayforce", name: "Dayforce", capability: "Unsupported", implemented: false, reason: "No verified unauthenticated official jobs API is configured." },
  { id: "workday", name: "Workday", capability: "Blocked", implemented: true, reason: "Undocumented career-site route is intentionally blocked; official tenant APIs require authorization." },
];
