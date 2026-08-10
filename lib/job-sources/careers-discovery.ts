/**
 * Careers-page ATS discovery.
 *
 * Board resolution has so far worked backwards: derive a plausible token from
 * the employer's name, then ask every provider whether such a board exists.
 * That fails whenever the board token is not the company name — and DE-2G
 * showed how routine that is. Anysphere's board is `cursor`, Captions' board is
 * `mirage`, Hebbia's is `hebbia-ai`, Sourcegraph's is `sourcegraph91`. No amount
 * of name normalisation reaches any of them.
 *
 * The employer already publishes the answer. Their careers page links to their
 * own board, which makes the ATS identity an observation rather than a guess.
 *
 * This module reads that one fact and stops. It does not scrape jobs — the
 * output is `provider + token`, handed to the existing provider layer.
 *
 * What it deliberately reuses rather than reimplements:
 *   - `detectCompanySource` for ATS URL → provider + token
 *   - `BOARD_PROBES` to verify the token against the provider's public API
 *   - `checkRobots` for policy, on the employer's domain as well as the ATS
 */
import { BOARD_PROBES, boardFingerprint, normalizeCompanyName } from "./board-resolution";
import { detectCompanySource } from "./detection";
import { checkRobots, type RobotsDocumentCache } from "./robots";

/* ------------------------------------------------------------------ *
 * Bounds
 *
 * Every limit here exists because this runs across employers in a loop.
 * ------------------------------------------------------------------ */

/** Total HTTP requests allowed per employer, careers hunt plus verification. */
export const MAX_REQUESTS_PER_EMPLOYER = 8;
/** Redirects followed on any single request. */
export const MAX_REDIRECTS = 3;
/** Bytes of HTML read from any one page. Careers pages are small; marketing
 *  homepages are not, and an unbounded read is how a loop exhausts memory. */
export const MAX_HTML_BYTES = 1_500_000;
const REQUEST_TIMEOUT_MS = 12_000;
const USER_AGENT = "job-search-intelligence/1.0";

/**
 * Employer-owned paths worth trying when the homepage yields no careers link.
 *
 * Four, not a dictionary. This is a short list of conventional locations on a
 * domain we were given, not a path sweep.
 */
export const CAREERS_PATHS = ["/careers", "/jobs", "/company/careers", "/about/careers"];

/* ------------------------------------------------------------------ *
 * ATS host vocabulary
 * ------------------------------------------------------------------ */

/** Hosts `detectCompanySource` can turn into a provider + token. */
const SUPPORTED_ATS_HOST =
  /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|recruitee\.com|workable\.com|jobscore\.com|teamtailor\.com|jobvite\.com|jobs\.personio\.de|myworkdayjobs\.com)$/i;

/**
 * Applicant tracking systems Job Finder has no provider for.
 *
 * Detected and reported, never resolved — the point is to turn "we could not
 * resolve this employer" into "this employer uses an ATS we have not built",
 * which is a roadmap input rather than a failure.
 */
const UNSUPPORTED_ATS_HOSTS: Array<{ pattern: RegExp; ats: string }> = [
  { pattern: /(^|\.)icims\.com$/i, ats: "iCIMS" },
  { pattern: /(^|\.)taleo\.net$/i, ats: "Oracle Taleo" },
  { pattern: /(^|\.)successfactors\.(com|eu)$/i, ats: "SAP SuccessFactors" },
  { pattern: /(^|\.)bamboohr\.com$/i, ats: "BambooHR" },
  { pattern: /(^|\.)breezy\.hr$/i, ats: "Breezy HR" },
  { pattern: /(^|\.)rippling\.com$/i, ats: "Rippling" },
  { pattern: /(^|\.)paylocity\.com$/i, ats: "Paylocity" },
  { pattern: /(^|\.)pinpointhq\.com$/i, ats: "Pinpoint" },
  { pattern: /(^|\.)dover\.com$/i, ats: "Dover" },
  { pattern: /(^|\.)gem\.com$/i, ats: "Gem" },
  { pattern: /(^|\.)paycomonline\.net$/i, ats: "Paycom" },
  { pattern: /(^|\.)ultipro\.com$/i, ats: "UKG" },
  { pattern: /(^|\.)adp\.com$/i, ats: "ADP" },
  { pattern: /(^|\.)jazzhr\.com$/i, ats: "JazzHR" },
  { pattern: /(^|\.)applytojob\.com$/i, ats: "JazzHR" },
  { pattern: /(^|\.)polymer\.co$/i, ats: "Polymer" },
  { pattern: /(^|\.)hire\.trakstar\.com$/i, ats: "Trakstar Hire" },
  { pattern: /(^|\.)eightfold\.ai$/i, ats: "Eightfold" },
  { pattern: /(^|\.)phenompeople\.com$/i, ats: "Phenom" },
  { pattern: /(^|\.)avature\.net$/i, ats: "Avature" },
];

/**
 * Job aggregators and marketplaces. An employer linking to their LinkedIn jobs
 * page is not evidence of an ATS, and following it would take us off any
 * surface the employer controls.
 */
const AGGREGATOR_HOSTS =
  /(^|\.)(linkedin\.com|indeed\.com|glassdoor\.com|wellfound\.com|angel\.co|ziprecruiter\.com|monster\.com|dice\.com|builtin\.com|otta\.com|welcometothejungle\.com|remoteok\.com|weworkremotely\.com|ycombinator\.com|x\.com|twitter\.com|facebook\.com|instagram\.com)$/i;

/* ------------------------------------------------------------------ *
 * Result shape
 * ------------------------------------------------------------------ */

export type AtsSighting = {
  url: string;
  providerId: string;
  connectorKey: string;
  /** Which surface the link was found on. */
  foundOn: string;
};

export type UnsupportedAtsSighting = {
  ats: string;
  host: string;
  url: string;
  foundOn: string;
};

export type CareersDiscovery = {
  officialDomain: string;
  /** Employer-owned surface actually reached, if any. */
  careersUrl: string | null;
  /** The ATS destination chosen, if any. */
  atsUrl: string | null;
  providerId: string | null;
  connectorKey: string | null;
  /** 0-100. Only meaningful when a provider and token were found. */
  confidence: number;
  /** Set once the token was checked against the provider's public API. */
  verifiedJobCount: number | null;
  /** domain → careers surface → ATS URL, in the order they were reached. */
  trail: string[];
  /** Every supported-ATS link seen, before selection. */
  sightings: AtsSighting[];
  /** ATS platforms with no Job Finder provider. Reported, never resolved. */
  unsupported: UnsupportedAtsSighting[];
  requests: number;
  reason: string;
};

/* ------------------------------------------------------------------ *
 * Fetching
 * ------------------------------------------------------------------ */

type Budget = { spent: number; readonly limit: number };

type PageRead = {
  finalUrl: string;
  html: string;
  /** Redirect chain, when the request left where it started. */
  redirectedFrom: string | null;
  status: number;
};

/**
 * One bounded GET.
 *
 * Redirects are followed manually so the chain can be capped and so a redirect
 * straight from `/careers` to the ATS is observable — for several employers
 * that redirect *is* the entire answer.
 */
async function readPage(
  client: typeof fetch,
  url: string,
  budget: Budget,
): Promise<PageRead | null> {
  let current = url;
  let redirectedFrom: string | null = null;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (budget.spent >= budget.limit) return null;
    budget.spent += 1;

    let response: Response;
    try {
      response = await client(current, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      return null;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      let next: string;
      try {
        next = new URL(location, current).toString();
      } catch {
        return null;
      }
      redirectedFrom = redirectedFrom ?? current;
      current = next;
      // A redirect that lands on an ATS is the answer; stop and report it
      // rather than spending another request rendering the board.
      if (atsHostOf(current)) {
        return { finalUrl: current, html: "", redirectedFrom, status: response.status };
      }
      continue;
    }

    if (!response.ok) return { finalUrl: current, html: "", redirectedFrom, status: response.status };

    const html = await readBounded(response);
    return { finalUrl: current, html, redirectedFrom, status: response.status };
  }
  return null;
}

/** Read at most MAX_HTML_BYTES, then stop pulling from the socket. */
async function readBounded(response: Response): Promise<string> {
  const body = response.body;
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    text += decoder.decode(value, { stream: true });
    if (size >= MAX_HTML_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return text;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function atsHostOf(url: string): boolean {
  const host = hostOf(url);
  return host !== null && SUPPORTED_ATS_HOST.test(host);
}

/** `careers.example.com` and `example.com` are the same employer. */
export function sameEmployerDomain(domain: string, url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  const root = domain.toLowerCase().replace(/^www\./, "");
  return host === root || host.endsWith(`.${root}`);
}

/* ------------------------------------------------------------------ *
 * Link extraction
 * ------------------------------------------------------------------ */

/**
 * Href first, text second.
 *
 * Matching `<a …>text</a>` as one unit looked reasonable and silently dropped
 * every link whose anchor wraps a block of markup — which is how modern job
 * cards are built. Sourcegraph's careers page carries 67 anchors and the
 * board link was in one of them; requiring a nearby `</a>` found none of it.
 */
const ANCHOR_HREF = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>/gi;
const ANCHOR_TEXT = /^([\s\S]{0,300}?)<\/a>/i;
const CAREERS_TEXT = /\b(careers?|jobs?|join us|open roles?|opportunities|we'?re hiring|work with us|openings?)\b/i;

export type Anchor = { href: string; text: string };

export function anchors(html: string, base: string): Anchor[] {
  const found: Anchor[] = [];
  for (const match of html.matchAll(ANCHOR_HREF)) {
    let href: string;
    try {
      href = new URL(match[1], base).toString();
    } catch {
      continue;
    }
    const after = html.slice((match.index ?? 0) + match[0].length);
    const text = (ANCHOR_TEXT.exec(after)?.[1] ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    found.push({ href, text });
  }
  return found;
}

/**
 * ATS URLs that are present on the page but not in an anchor.
 *
 * Cursor and Hebbia both publish their board on their own careers page as deep
 * links to individual postings embedded in a data payload rather than as a
 * link to the board root. That is still the employer naming their own ATS, and
 * ignoring it discards the exact evidence this phase set out to read.
 *
 * Repetition is the corroboration: a real board appears once per open role,
 * whereas a passing mention of somebody else's board appears once.
 */
const EMBEDDED_ATS_URL =
  /https?:\/\/(?:[a-z0-9-]+\.)*(?:greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|recruitee\.com|workable\.com|jobscore\.com|teamtailor\.com|jobvite\.com|personio\.de|myworkdayjobs\.com)\/[^"'\\\s<>)]{1,120}/gi;

export function embeddedAtsUrls(html: string): Array<{ url: string; occurrences: number }> {
  const counts = new Map<string, number>();
  for (const match of html.matchAll(EMBEDDED_ATS_URL)) {
    const url = match[0].replace(/[.,;]+$/, "");
    counts.set(url, (counts.get(url) ?? 0) + 1);
  }
  return [...counts.entries()].map(([url, occurrences]) => ({ url, occurrences }));
}

/** Careers links on the employer's own domain, best first. */
export function careersLinks(list: Anchor[], domain: string): string[] {
  const scored = list
    .filter((anchor) => sameEmployerDomain(domain, anchor.href))
    .filter((anchor) => CAREERS_TEXT.test(anchor.text) || CAREERS_TEXT.test(anchor.href))
    .map((anchor) => ({
      href: anchor.href.split("#")[0],
      // Link text is the stronger signal: a URL can contain "jobs" incidentally.
      rank: (CAREERS_TEXT.test(anchor.text) ? 2 : 0) + (/\/(careers?|jobs?)\/?$/i.test(anchor.href) ? 1 : 0),
    }))
    .sort((left, right) => right.rank - left.rank);
  return [...new Set(scored.map((item) => item.href))];
}

/** Every ATS destination on a page, supported and not. */
export function atsLinks(list: Anchor[], foundOn: string) {
  const supported: AtsSighting[] = [];
  const unsupported: UnsupportedAtsSighting[] = [];
  const seen = new Set<string>();

  for (const anchor of list) {
    const host = hostOf(anchor.href);
    if (!host || AGGREGATOR_HOSTS.test(host)) continue;

    if (SUPPORTED_ATS_HOST.test(host)) {
      const detected = detectCompanySource(anchor.href);
      if (!detected) continue;
      const key = `${detected.providerId}:${detected.connectorKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      supported.push({
        url: anchor.href,
        providerId: detected.providerId,
        connectorKey: detected.connectorKey,
        foundOn,
      });
      continue;
    }

    const gap = UNSUPPORTED_ATS_HOSTS.find((entry) => entry.pattern.test(host));
    if (gap && !seen.has(`gap:${host}`)) {
      seen.add(`gap:${host}`);
      unsupported.push({ ats: gap.ats, host, url: anchor.href, foundOn });
    }
  }
  return { supported, unsupported };
}

/* ------------------------------------------------------------------ *
 * Confidence
 * ------------------------------------------------------------------ */

/**
 * Careers-derived identity outranks a name-derived guess, because the employer
 * published the link themselves — but publishing is not proof, so the checks
 * below still apply.
 *
 * Name derivation tops out around 80 (exact slug + confirmed identity). This
 * starts at 80 and can reach 95, which keeps the two orderable without ever
 * claiming certainty.
 */
export function careersConfidence(input: {
  sightings: AtsSighting[];
  verifiedJobCount: number | null;
  reachedVia: "redirect" | "homepage-link" | "known-path";
  nameMatchesToken: boolean;
}): number {
  let confidence = 80;

  // A redirect from the employer's own careers path to the board is the
  // strongest form of this evidence: the employer routes users there.
  if (input.reachedVia === "redirect") confidence += 5;

  // One board per employer is the normal shape. Several distinct tokens on one
  // page is what a recruiting vendor, a portfolio site, or a customer-logo wall
  // looks like, and that ambiguity has to cost something.
  if (input.sightings.length === 1) confidence += 5;
  else if (input.sightings.length > 2) confidence -= 25;
  else confidence -= 10;

  // Verified against the provider's public API and returning jobs.
  if (input.verifiedJobCount !== null && input.verifiedJobCount > 0) confidence += 5;
  else if (input.verifiedJobCount === 0) confidence -= 20;
  else confidence -= 30;

  // Corroboration when the token happens to match the name; never a penalty
  // when it does not, since a mismatched token is the case this phase exists
  // to handle.
  if (input.nameMatchesToken) confidence += 5;

  return Math.max(0, Math.min(95, confidence));
}

export function tokenMatchesName(name: string, token: string): boolean {
  const flat = (value: string) => normalizeCompanyName(value).replace(/[\s-]/g, "");
  return flat(token) === flat(name) || flat(name).startsWith(flat(token));
}

/* ------------------------------------------------------------------ *
 * Verification
 * ------------------------------------------------------------------ */

/**
 * Confirm the discovered token is a live board on that provider.
 *
 * This is the guard against stale links, example URLs and typos: the employer
 * said the board exists, and the provider's own API has to agree.
 */
export async function verifyBoard(
  client: typeof fetch,
  providerId: string,
  token: string,
  budget: Budget,
): Promise<number | null> {
  const probe = BOARD_PROBES.find((entry) => entry.providerId === providerId);
  if (!probe) return null;
  if (budget.spent >= budget.limit) return null;
  budget.spent += 1;
  try {
    const response = await client(probe.url(token), {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: probe.responseType === "json" ? "application/json" : "text/xml, application/xml",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const payload = probe.responseType === "json" ? await response.json() : await response.text();
    const read = probe.read(payload as unknown, token);
    return read ? read.jobCount : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Orchestration
 * ------------------------------------------------------------------ */

export type CareersDiscoveryOptions = {
  client?: typeof fetch;
  robotsCache?: RobotsDocumentCache;
  maxRequests?: number;
};

function empty(domain: string, reason: string, requests: number): CareersDiscovery {
  return {
    officialDomain: domain,
    careersUrl: null,
    atsUrl: null,
    providerId: null,
    connectorKey: null,
    confidence: 0,
    verifiedJobCount: null,
    trail: [],
    sightings: [],
    unsupported: [],
    requests,
    reason,
  };
}

/**
 * Find an employer's ATS from their own careers surface.
 *
 * @param officialDomain must come from trusted employer intelligence. This
 *   function never guesses a domain from a company name and never searches.
 */
export async function discoverAtsFromCareersPage(
  name: string,
  officialDomain: string,
  options: CareersDiscoveryOptions = {},
): Promise<CareersDiscovery> {
  const client = options.client ?? fetch;
  const budget: Budget = { spent: 0, limit: options.maxRequests ?? MAX_REQUESTS_PER_EMPLOYER };
  const domain = officialDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!domain) return empty(officialDomain, "No official domain recorded.", 0);

  const origin = `https://${domain}`;
  const trail: string[] = [origin];

  // The employer's own robots policy governs the careers hunt. Their ATS is
  // checked separately by the existing provider policy at scan time.
  let robotsAllows: (path: string) => Promise<boolean>;
  {
    const cache = options.robotsCache;
    robotsAllows = async (path: string) => {
      try {
        budget.spent += 1;
        const decision = await checkRobots(`${origin}/robots.txt`, path, client, "fail-closed", cache);
        return decision.allowed;
      } catch {
        // Fail closed: an unverifiable policy is not permission.
        return false;
      }
    };
  }

  if (!(await robotsAllows("/"))) {
    return empty(domain, "The employer's robots policy withheld the careers surface.", budget.spent);
  }

  const sightings: AtsSighting[] = [];
  const unsupported: UnsupportedAtsSighting[] = [];
  /** How often each ATS URL appeared, used to rank competing tokens. */
  const occurrences = new Map<string, number>();
  let careersUrl: string | null = null;
  let reachedVia: "redirect" | "homepage-link" | "known-path" = "known-path";

  const absorb = (page: PageRead) => {
    // A redirect that terminated on an ATS host carries no HTML but is itself
    // the evidence.
    if (!page.html && atsHostOf(page.finalUrl)) {
      const detected = detectCompanySource(page.finalUrl);
      if (detected) {
        sightings.push({
          url: page.finalUrl,
          providerId: detected.providerId,
          connectorKey: detected.connectorKey,
          foundOn: page.redirectedFrom ?? page.finalUrl,
        });
        reachedVia = "redirect";
      }
      return [];
    }
    const found = anchors(page.html, page.finalUrl);
    // Anchors first, then ATS URLs embedded in the page's data payloads. Both
    // are the employer publishing their own board on their own surface.
    const embedded = embeddedAtsUrls(page.html);
    for (const entry of embedded) {
      occurrences.set(entry.url, (occurrences.get(entry.url) ?? 0) + entry.occurrences);
    }
    const links = atsLinks(
      [...found, ...embedded.map((entry) => ({ href: entry.url, text: "" }))],
      page.finalUrl,
    );
    for (const sighting of links.supported) {
      if (!sightings.some((entry) => entry.providerId === sighting.providerId && entry.connectorKey === sighting.connectorKey)) {
        sightings.push(sighting);
      }
    }
    for (const gap of links.unsupported) {
      if (!unsupported.some((entry) => entry.host === gap.host)) unsupported.push(gap);
    }
    return found;
  };

  // 1. Homepage — often links straight to the careers surface, and sometimes
  //    carries the ATS link in the footer.
  const home = await readPage(client, origin, budget);
  let candidatePaths = [...CAREERS_PATHS];
  if (home) {
    trail.push(home.finalUrl);
    const homeAnchors = absorb(home);
    const linked = careersLinks(homeAnchors, domain);
    if (linked.length) {
      // An explicit link the employer wrote beats a path we assumed.
      candidatePaths = [];
      careersUrl = linked[0];
      reachedVia = "homepage-link";
      candidatePaths.push(...linked.slice(0, 2).map((url) => url.replace(origin, "")));
    }
  }

  // 2. The careers surface itself.
  for (const path of candidatePaths) {
    if (sightings.length) break;
    if (budget.spent >= budget.limit) break;
    const target = path.startsWith("http") ? path : `${origin}${path.startsWith("/") ? path : `/${path}`}`;
    if (!sameEmployerDomain(domain, target)) continue;
    if (!(await robotsAllows(new URL(target).pathname))) continue;

    const page = await readPage(client, target, budget);
    if (!page) continue;
    if (page.status >= 400) continue;
    careersUrl = page.finalUrl;
    trail.push(page.finalUrl);
    absorb(page);
  }

  if (!sightings.length) {
    return {
      ...empty(domain, unsupported.length
        ? `Careers surface uses ${unsupported[0].ats}, which Job Finder has no provider for.`
        : "No supported ATS link was found on the employer's careers surface.", budget.spent),
      careersUrl,
      trail,
      unsupported,
    };
  }

  // 3. Choose. With one sighting this is trivial; with several, prefer the one
  //    whose token resembles the employer name, then the first seen.
  // A real board is linked once per open role; an incidental mention of some
  // other company's board appears once. Weight of evidence decides first, then
  // a name match, then order seen.
  const weight = (sighting: AtsSighting) => {
    let total = 0;
    for (const [url, count] of occurrences) {
      const detected = detectCompanySource(url);
      if (detected?.providerId === sighting.providerId && detected.connectorKey === sighting.connectorKey) {
        total += count;
      }
    }
    return total;
  };
  const chosen = [...sightings].sort((left, right) =>
    weight(right) - weight(left)
    || Number(tokenMatchesName(name, right.connectorKey)) - Number(tokenMatchesName(name, left.connectorKey)),
  )[0];

  // 4. Verify against the provider's own API.
  const verifiedJobCount = await verifyBoard(client, chosen.providerId, chosen.connectorKey, budget);

  const confidence = careersConfidence({
    sightings,
    verifiedJobCount,
    reachedVia,
    nameMatchesToken: tokenMatchesName(name, chosen.connectorKey),
  });

  trail.push(chosen.url);

  return {
    officialDomain: domain,
    careersUrl,
    atsUrl: chosen.url,
    providerId: chosen.providerId,
    connectorKey: chosen.connectorKey,
    confidence,
    verifiedJobCount,
    trail,
    sightings,
    unsupported,
    requests: budget.spent,
    reason:
      verifiedJobCount === null
        ? "ATS link found on the employer's careers surface but the board could not be verified."
        : `ATS identity published by the employer and confirmed by ${chosen.providerId} (${verifiedJobCount} jobs).`,
  };
}

/** Fingerprint parity with name-derived resolution. */
export function careersBoardFingerprint(providerId: string, token: string) {
  return boardFingerprint(providerId, token, null);
}
