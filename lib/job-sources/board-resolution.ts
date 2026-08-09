/**
 * Board resolution.
 *
 * Turns an employer NAME into a verified public ATS board. ATS APIs are
 * employer-scoped by design — none of them offer a global directory or a
 * cross-employer search — so the only compliant way to find an employer's board
 * is to derive candidate identifiers from the company's own name and ask each
 * provider's documented public endpoint whether such a board exists.
 *
 * This is bounded lookup, not enumeration: candidates come from real observed
 * company names, every probe is a documented public read endpoint, and each
 * name gets a small fixed number of attempts.
 */
import { createHash } from "node:crypto";

export type BoardCandidate = {
  token: string;
  /** derivation strength — an exact slug of the full name is worth more than a suffix-stripped guess */
  exact: boolean;
};

export type ResolvedBoard = {
  providerId: string;
  boardToken: string;
  careerUrl: string;
  jobCount: number;
  identity: string | null;
  identityConfirmed: boolean;
  confidence: number;
  fingerprint: string;
};

export type BoardProbeOutcome =
  | { status: "resolved"; board: ResolvedBoard }
  | { status: "empty"; providerId: string; token: string }
  | { status: "absent"; providerId: string; token: string };

type ProviderProbe = {
  providerId: string;
  url: (token: string) => string;
  careerUrl: (token: string) => string;
  responseType: "json" | "text";
  /** returns null when the payload is not a recognisable board */
  read: (payload: unknown, token: string) => { jobCount: number; identity: string | null } | null;
};

const COMPANY_SUFFIXES =
  /\b(gmbh|mbh|ag|inc|llc|l\.l\.c|ltd|limited|corp|corporation|co|bv|b\.v|nv|n\.v|sa|s\.a|srl|s\.r\.l|plc|oy|ab|as|aps|kg|kft|sp z o o|pte|pty|group|holding|holdings|the)\b/g;

const NOISE_WORDS = /\b(technologies|technology|labs|laboratories|software|solutions|systems|consulting|services|digital|studio|studios|ventures|partners|global|international|worldwide)\b/g;

export function normalizeCompanyName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Candidate identifiers, strongest first. Deliberately small — we are looking
 * up a name we already have, not sweeping a keyspace.
 */
export function boardCandidates(name: string): BoardCandidate[] {
  const base = normalizeCompanyName(name);
  if (!base) return [];
  const stripped = base.replace(COMPANY_SUFFIXES, " ").replace(/\s+/g, " ").trim();
  const core = stripped.replace(NOISE_WORDS, " ").replace(/\s+/g, " ").trim();

  const seen = new Map<string, boolean>();
  const add = (value: string, exact: boolean) => {
    const token = value.trim();
    if (token.length < 2 || token.length > 64) return;
    if (!seen.has(token)) seen.set(token, exact);
  };

  add(base.replace(/[\s-]+/g, ""), true);
  add(base.replace(/\s+/g, "-"), true);
  if (stripped && stripped !== base) {
    add(stripped.replace(/[\s-]+/g, ""), false);
    add(stripped.replace(/\s+/g, "-"), false);
  }
  if (core && core !== stripped) {
    add(core.replace(/[\s-]+/g, ""), false);
  }
  return [...seen.entries()].map(([token, exact]) => ({ token, exact }));
}

function urlToken(value: unknown, token: string) {
  return typeof value === "string" && value.toLowerCase().includes(`/${token.toLowerCase()}/`);
}

export const BOARD_PROBES: ProviderProbe[] = [
  {
    providerId: "greenhouse",
    url: (token) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs`,
    careerUrl: (token) => `https://job-boards.greenhouse.io/${token}`,
    responseType: "json",
    read: (payload, token) => {
      const jobs = (payload as { jobs?: Array<{ absolute_url?: string }> })?.jobs;
      if (!Array.isArray(jobs)) return null;
      const confirmed = jobs.some((job) => urlToken(job.absolute_url, token));
      return { jobCount: jobs.length, identity: confirmed ? token : null };
    },
  },
  {
    providerId: "lever",
    url: (token) => `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`,
    careerUrl: (token) => `https://jobs.lever.co/${token}`,
    responseType: "json",
    read: (payload, token) => {
      if (!Array.isArray(payload)) return null;
      const jobs = payload as Array<{ hostedUrl?: string }>;
      const confirmed = jobs.some((job) => urlToken(job.hostedUrl, token));
      return { jobCount: jobs.length, identity: confirmed ? token : null };
    },
  },
  {
    providerId: "ashby",
    url: (token) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}`,
    careerUrl: (token) => `https://jobs.ashbyhq.com/${token}`,
    responseType: "json",
    read: (payload, token) => {
      const jobs = (payload as { jobs?: Array<{ jobUrl?: string }> })?.jobs;
      if (!Array.isArray(jobs)) return null;
      const confirmed = jobs.some((job) => urlToken(job.jobUrl, token));
      return { jobCount: jobs.length, identity: confirmed ? token : null };
    },
  },
  {
    providerId: "workable",
    url: (token) => `https://www.workable.com/api/accounts/${encodeURIComponent(token)}?details=true`,
    careerUrl: (token) => `https://apply.workable.com/${token}`,
    responseType: "json",
    read: (payload) => {
      const account = payload as { name?: string; jobs?: unknown[] };
      if (!account || typeof account.name !== "string") return null;
      return {
        jobCount: Array.isArray(account.jobs) ? account.jobs.length : 0,
        // Workable is the one provider that names the employer back to us.
        identity: account.name,
      };
    },
  },
  {
    providerId: "smartrecruiters",
    url: (token) =>
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings?limit=100&destination=PUBLIC`,
    careerUrl: (token) => `https://jobs.smartrecruiters.com/${token}`,
    responseType: "json",
    read: (payload) => {
      const result = payload as { totalFound?: number; content?: unknown[] };
      if (!result || !Array.isArray(result.content)) return null;
      return { jobCount: result.content.length, identity: null };
    },
  },
  {
    providerId: "recruitee",
    url: (token) => `https://${encodeURIComponent(token)}.recruitee.com/api/offers/`,
    careerUrl: (token) => `https://${token}.recruitee.com`,
    responseType: "json",
    read: (payload) => {
      const result = payload as { offers?: unknown[] };
      if (!result || !Array.isArray(result.offers)) return null;
      return { jobCount: result.offers.length, identity: null };
    },
  },
  {
    providerId: "personio",
    url: (token) => `https://${encodeURIComponent(token)}.jobs.personio.de/xml?language=en`,
    careerUrl: (token) => `https://${token}.jobs.personio.de`,
    responseType: "text",
    read: (payload) => {
      if (typeof payload !== "string" || !payload.includes("<position>")) return null;
      return { jobCount: payload.split("<position>").length - 1, identity: null };
    },
  },
];

export function boardFingerprint(providerId: string, token: string, identity: string | null) {
  return createHash("sha256")
    .update(`${providerId}:${token.toLowerCase()}:${identity ? normalizeCompanyName(identity) : ""}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Short, generic tokens are where slug collisions happen — "coalition",
 * "molecule", "roo" all resolve to a real board belonging to some other
 * company. Those need corroboration before we trust them.
 */
function collisionProne(token: string, name: string) {
  const words = normalizeCompanyName(name).split(" ").filter(Boolean);
  return token.length <= 6 || words.length === 1;
}

export function scoreConfidence(input: {
  name: string;
  candidate: BoardCandidate;
  jobCount: number;
  identity: string | null;
}) {
  let confidence = 55;
  // An exact slug of the full name is strong evidence; a suffix-stripped guess
  // is weaker but still usually right — companies routinely drop "Inc"/"GmbH".
  confidence += input.candidate.exact ? 25 : 12;
  if (input.identity) {
    const flatten = (value: string) => normalizeCompanyName(value).replace(/[\s-]/g, "");
    confidence += flatten(input.identity) === flatten(input.name) ? 20 : -15;
  } else if (collisionProne(input.candidate.token, input.name)) {
    confidence -= 15;
  }
  if (input.jobCount >= 5) confidence += 5;
  if (input.jobCount >= 25) confidence += 5;
  return Math.max(0, Math.min(100, confidence));
}
