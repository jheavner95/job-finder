import { ProviderError } from "./errors";
import { retryAfterMilliseconds } from "./request-policy";
import type { RobotsUnavailablePolicy } from "./capabilities";

export type RobotsDecision = {
  allowed: boolean;
  policy: string;
  crawlDelay: number | null;
  reason: string;
};

type RobotsGroup = {
  agents: string[];
  rules: Array<{ allow: boolean; path: string }>;
  crawlDelay: number | null;
};

function parseGroups(text: string) {
  const groups: RobotsGroup[] = [];
  let group: RobotsGroup | null = null;
  let sawRule = false;
  for (const sourceLine of text.split(/\r?\n/)) {
    const line = sourceLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      if (!group || sawRule) {
        group = { agents: [], rules: [], crawlDelay: null };
        groups.push(group);
        sawRule = false;
      }
      group.agents.push(value.toLowerCase());
    } else if (group && (field === "allow" || field === "disallow")) {
      group.rules.push({ allow: field === "allow", path: value });
      sawRule = true;
    } else if (group && field === "crawl-delay") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) {
        group.crawlDelay = Math.round(seconds * 1_000);
      }
      sawRule = true;
    }
  }
  return groups;
}

export function evaluateRobots(
  text: string,
  path: string,
  userAgent = "job-search-intelligence",
): RobotsDecision {
  const groups = parseGroups(text);
  const selected = groups.filter((group) =>
    group.agents.some((agent) => agent === "*" || userAgent.toLowerCase().includes(agent)),
  );
  const rules = selected
    .flatMap((group) => group.rules)
    .filter((rule) => rule.path && path.startsWith(rule.path))
    .sort((a, b) => b.path.length - a.path.length);
  const winner = rules[0];
  const allowed = !winner || winner.allow;
  const crawlDelay = selected.reduce<number | null>(
    (largest, group) =>
      group.crawlDelay === null ? largest : Math.max(largest ?? 0, group.crawlDelay),
    null,
  );
  return {
    allowed,
    policy: allowed ? "allow" : "disallow",
    crawlDelay,
    reason: allowed
      ? `robots.txt permits ${path}.`
      : `robots.txt disallows ${winner.path}.`,
  };
}

export async function checkGreenhouseRobots(
  client: typeof fetch = fetch,
): Promise<RobotsDecision> {
  return checkRobots(
    "https://boards-api.greenhouse.io/robots.txt",
    "/v1/boards/",
    client,
  );
}

/**
 * A fetched robots.txt outcome, independent of any particular path.
 *
 * One document governs every path on its host, so this is the unit worth
 * caching — the decision is not, because the decision depends on the path.
 */
export type RobotsDocument =
  | { kind: "rules"; text: string }
  | { kind: "not-published" }
  | { kind: "unavailable"; status: number };

/** Keyed by robots URL. Never keyed by path, and never shared across hosts. */
export type RobotsDocumentCache = Map<string, RobotsDocument>;

/**
 * A 429 on robots.txt means "slow down", not "you may not crawl" and not
 * "crawl freely". We wait once — honouring Retry-After when the server sends
 * one — and retry. A second 429 fails closed.
 *
 * The wait is capped hard: a robots fetch sits inside the scan loop, so an
 * erroneous or hostile `Retry-After: 86400` must not stall discovery.
 */
const ROBOTS_MAX_RETRY_WAIT_MS = 5_000;
const ROBOTS_DEFAULT_RETRY_WAIT_MS = 1_000;

export type RobotsRuntime = { sleep?: (ms: number) => Promise<void>; now?: () => number };

export function robotsRetryDelay(retryAfter: string | null, now = Date.now()) {
  const directed = retryAfterMilliseconds(retryAfter, now);
  // A missing, malformed or already-elapsed Retry-After must not become a
  // zero-delay retry — that is the hammering this change exists to stop.
  if (directed === null || directed <= 0) return ROBOTS_DEFAULT_RETRY_WAIT_MS;
  return Math.min(ROBOTS_MAX_RETRY_WAIT_MS, directed);
}

async function fetchRobotsDocument(
  robotsUrl: string,
  path: string,
  client: typeof fetch,
  runtime: RobotsRuntime,
): Promise<RobotsDocument> {
  const sleep = runtime.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = runtime.now ?? Date.now;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await client(robotsUrl, {
      headers: { "User-Agent": "job-search-intelligence/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 429) {
      // One bounded retry, then fail closed. Never reinterpreted as permission.
      if (attempt === 0) {
        await sleep(robotsRetryDelay(response.headers.get("Retry-After"), now()));
        continue;
      }
      throw new ProviderError(
        "RATE_LIMITED",
        "The provider robots policy could not be verified because the policy endpoint rate-limited the request twice (HTTP 429). Discovery failed closed.",
        { robotsUrl, path, status: 429 },
      );
    }
    if (response.status === 404) return { kind: "not-published" };
    if (response.status >= 400 && response.status <= 499) {
      return { kind: "unavailable", status: response.status };
    }
    if (!response.ok) {
      throw new ProviderError(
        "UNEXPECTED_RESPONSE",
        `The provider robots policy could not be verified because the policy endpoint returned HTTP ${response.status}. Discovery failed closed.`,
        { robotsUrl, path, status: response.status },
      );
    }
    return { kind: "rules", text: await response.text() };
  }
  /* c8 ignore next */
  throw new ProviderError("RATE_LIMITED", "The provider robots policy could not be verified.", { robotsUrl, path });
}

export async function checkRobots(
  robotsUrl: string,
  path: string,
  client: typeof fetch = fetch,
  unavailablePolicy: RobotsUnavailablePolicy = "fail-closed",
  documentCache?: RobotsDocumentCache,
  runtime: RobotsRuntime = {},
): Promise<RobotsDecision> {
  const cached = documentCache?.get(robotsUrl);
  const document = cached ?? await fetchRobotsDocument(robotsUrl, path, client, runtime);
  // Only successful outcomes are cached; a failure must be retried, not sticky.
  if (!cached) documentCache?.set(robotsUrl, document);

  if (document.kind === "not-published") {
    return {
      allowed: true,
      policy: "not-published",
      crawlDelay: null,
      reason: "No robots.txt policy was published by the API host.",
    };
  }
  if (document.kind === "unavailable") {
    // RFC 9309 §2.3.1.3: 400-499 means the policy is "Unavailable" and a crawler
    // MAY proceed. Only providers that declare the policy get this reading; every
    // other provider keeps failing closed on the same status.
    if (unavailablePolicy === "rfc9309-unavailable") {
      return {
        allowed: true,
        policy: "unavailable-4xx",
        crawlDelay: null,
        reason: `robots.txt returned HTTP ${document.status}; treated as unavailable under RFC 9309 §2.3.1.3. Request limited to the provider's documented public API.`,
      };
    }
    throw new ProviderError(
      "UNEXPECTED_RESPONSE",
      `The provider robots policy could not be verified because the policy endpoint returned HTTP ${document.status}. Discovery failed closed.`,
      { robotsUrl, path, status: document.status },
    );
  }
  return evaluateRobots(document.text, path);
}
