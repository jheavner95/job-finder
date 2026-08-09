/**
 * Employer name sources.
 *
 * These are public, documented, unauthenticated JSON endpoints. We use them for
 * ONE thing: learning that an employer exists. We do not import their job
 * content, and we do not treat their postings as canonical — once a name is
 * known, board-resolution finds that employer's own ATS board and every job is
 * retrieved from the employer's canonical public feed.
 *
 * Every host is robots-checked before its first request and the result is
 * cached for the run. A source that fails robots, errors, or changes shape is
 * skipped; harvesting is best-effort by design and never blocks discovery.
 */
import { checkRobots } from "./robots";

export type EmployerNameSource = {
  id: string;
  label: string;
  robots: { url: string; path: string };
  collect: (client: typeof fetch) => Promise<string[]>;
};

export type HarvestResult = {
  sourceId: string;
  label: string;
  names: string[];
  skipped: boolean;
  reason?: string;
};

const TIMEOUT_MS = 20_000;
const HEADERS = { "User-Agent": "job-search-intelligence/1.0", Accept: "application/json" };

async function getJson(client: typeof fetch, url: string): Promise<unknown> {
  const response = await client(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#38": "&",
};

/**
 * Source feeds hand back HTML-escaped company names ("NHS Ayrshire &amp; Arran").
 * Left encoded, the `&amp;` survives into slug derivation and corrupts the board
 * token, so entities are decoded before the name is ever normalised.
 */
export function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const key = entity.toLowerCase();
    if (HTML_ENTITIES[key]) return HTML_ENTITIES[key];
    if (key.startsWith("#x")) {
      const code = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (key.startsWith("#")) {
      const code = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return match;
  });
}

function texts(values: Array<unknown>): string[] {
  return values
    .map((value) => (typeof value === "string" ? decodeHtmlEntities(value).trim() : ""))
    .filter((value) => value.length > 1 && value.length < 120);
}

export const EMPLOYER_NAME_SOURCES: EmployerNameSource[] = [
  {
    id: "remotive",
    label: "Remotive public jobs API",
    robots: { url: "https://remotive.com/robots.txt", path: "/api/remote-jobs" },
    collect: async (client) => {
      const categories = [
        "design", "software-dev", "product", "data", "devops", "finance-legal",
        "marketing", "customer-support", "qa", "hr", "writing", "sales", "business", "all-others",
      ];
      const names: string[] = [];
      for (const category of categories) {
        try {
          const payload = await getJson(client, `https://remotive.com/api/remote-jobs?category=${category}`);
          const jobs = (payload as { jobs?: Array<{ company_name?: unknown }> })?.jobs ?? [];
          names.push(...texts(jobs.map((job) => job.company_name)));
        } catch {
          // one bad category should not lose the rest
        }
      }
      return names;
    },
  },
  {
    id: "remoteok",
    label: "RemoteOK public jobs API",
    robots: { url: "https://remoteok.com/robots.txt", path: "/api" },
    collect: async (client) => {
      const payload = await getJson(client, "https://remoteok.com/api");
      const rows = Array.isArray(payload) ? (payload as Array<{ company?: unknown }>) : [];
      return texts(rows.map((row) => row.company));
    },
  },
  {
    id: "arbeitnow",
    label: "Arbeitnow public job board API",
    robots: { url: "https://www.arbeitnow.com/robots.txt", path: "/api/job-board-api" },
    collect: async (client) => {
      const names: string[] = [];
      for (let page = 1; page <= 60; page += 1) {
        try {
          const payload = await getJson(client, `https://www.arbeitnow.com/api/job-board-api?page=${page}`);
          const rows = (payload as { data?: Array<{ company_name?: unknown }> })?.data ?? [];
          if (!rows.length) break;
          names.push(...texts(rows.map((row) => row.company_name)));
        } catch {
          break;
        }
      }
      return names;
    },
  },
  {
    id: "himalayas",
    label: "Himalayas public jobs API",
    robots: { url: "https://himalayas.app/robots.txt", path: "/jobs/api" },
    collect: async (client) => {
      const names: string[] = [];
      for (let offset = 0; offset < 3000; offset += 20) {
        try {
          const payload = await getJson(client, `https://himalayas.app/jobs/api?limit=20&offset=${offset}`);
          const rows = (payload as { jobs?: Array<{ companyName?: unknown }> })?.jobs ?? [];
          if (!rows.length) break;
          names.push(...texts(rows.map((row) => row.companyName)));
        } catch {
          break;
        }
      }
      return names;
    },
  },
];

export async function harvestEmployerNames(
  client: typeof fetch = fetch,
  sources: EmployerNameSource[] = EMPLOYER_NAME_SOURCES,
): Promise<HarvestResult[]> {
  const results: HarvestResult[] = [];
  for (const source of sources) {
    try {
      const robots = await checkRobots(source.robots.url, source.robots.path, client);
      if (!robots.allowed) {
        results.push({ sourceId: source.id, label: source.label, names: [], skipped: true, reason: robots.reason });
        continue;
      }
    } catch (error) {
      results.push({
        sourceId: source.id,
        label: source.label,
        names: [],
        skipped: true,
        reason: `robots policy unverifiable: ${error instanceof Error ? error.message : "unknown"}`,
      });
      continue;
    }
    try {
      const names = await source.collect(client);
      results.push({ sourceId: source.id, label: source.label, names, skipped: false });
    } catch (error) {
      results.push({
        sourceId: source.id,
        label: source.label,
        names: [],
        skipped: true,
        reason: error instanceof Error ? error.message : "collection failed",
      });
    }
  }
  return results;
}
