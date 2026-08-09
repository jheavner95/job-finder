import { ProviderError } from "./errors";
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

export async function checkRobots(
  robotsUrl: string,
  path: string,
  client: typeof fetch = fetch,
  unavailablePolicy: RobotsUnavailablePolicy = "fail-closed",
): Promise<RobotsDecision> {
  const response = await client(robotsUrl, {
    headers: { "User-Agent": "job-search-intelligence/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) {
    return {
      allowed: true,
      policy: "not-published",
      crawlDelay: null,
      reason: "No robots.txt policy was published by the API host.",
    };
  }
  // RFC 9309 §2.3.1.3: 400-499 means the policy is "Unavailable" and a crawler
  // MAY proceed. Only providers that declare the policy get this reading; every
  // other provider keeps failing closed on the same status.
  if (
    unavailablePolicy === "rfc9309-unavailable"
    && response.status >= 400
    && response.status <= 499
  ) {
    return {
      allowed: true,
      policy: "unavailable-4xx",
      crawlDelay: null,
      reason: `robots.txt returned HTTP ${response.status}; treated as unavailable under RFC 9309 §2.3.1.3. Request limited to the provider's documented public API.`,
    };
  }
  if (!response.ok) {
    throw new ProviderError(
      "UNEXPECTED_RESPONSE",
      `The provider robots policy could not be verified because the policy endpoint returned HTTP ${response.status}. Discovery failed closed.`,
      { robotsUrl, path, status: response.status },
    );
  }
  return evaluateRobots(
    await response.text(),
    path,
  );
}
