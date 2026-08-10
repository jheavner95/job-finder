import { describe, expect, it } from "vitest";

import {
  CAREERS_PATHS,
  MAX_REDIRECTS,
  MAX_REQUESTS_PER_EMPLOYER,
  anchors,
  atsLinks,
  careersConfidence,
  careersLinks,
  embeddedAtsUrls,
  discoverAtsFromCareersPage,
  sameEmployerDomain,
  tokenMatchesName,
} from "../lib/job-sources/careers-discovery";
import { detectCompanySource } from "../lib/job-sources/detection";
import { boardCandidates } from "../lib/job-sources/board-resolution";

/**
 * A scripted fetch. Every response is canned; nothing here reaches a network.
 */
function harness(routes: Record<string, { status?: number; body?: string; location?: string }>) {
  const calls: string[] = [];
  const client = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const route = routes[url];
    if (!route) return new Response("", { status: 404 });
    if (route.location) {
      return new Response("", { status: route.status ?? 302, headers: { location: route.location } });
    }
    return new Response(route.body ?? "", {
      status: route.status ?? 200,
      headers: { "Content-Type": "text/html" },
    });
  }) as unknown as typeof fetch;
  return { client, calls };
}

const ROBOTS_OPEN = { body: "User-agent: *\nAllow: /" };

describe("the failure this phase exists to fix", () => {
  it("cannot reach any of the real tokens by name derivation", () => {
    // Every one of these is a live board whose token is not the company name.
    const impossible: Array<[string, string]> = [
      ["Anysphere (Cursor)", "cursor"],
      ["Captions", "mirage"],
      ["Hebbia", "hebbia-ai"],
      ["Sourcegraph", "sourcegraph91"],
      ["Addepar", "addepar1"],
    ];
    for (const [name, actual] of impossible) {
      const derived = boardCandidates(name).map((candidate) => candidate.token);
      expect(derived, `${name} → ${actual}`).not.toContain(actual);
    }
  });

  it("reads every one of them straight off an ATS URL", () => {
    const observed: Array<[string, string, string]> = [
      ["https://jobs.ashbyhq.com/cursor", "ashby", "cursor"],
      ["https://jobs.ashbyhq.com/mirage", "ashby", "mirage"],
      ["https://jobs.ashbyhq.com/hebbia-ai", "ashby", "hebbia-ai"],
      ["https://boards.greenhouse.io/sourcegraph91", "greenhouse", "sourcegraph91"],
      ["https://job-boards.greenhouse.io/addepar1", "greenhouse", "addepar1"],
    ];
    for (const [url, providerId, connectorKey] of observed) {
      expect(detectCompanySource(url), url).toMatchObject({ providerId, connectorKey });
    }
  });
});

describe("employer domain safety", () => {
  it("accepts the domain and its subdomains, nothing else", () => {
    expect(sameEmployerDomain("cursor.com", "https://cursor.com/careers")).toBe(true);
    expect(sameEmployerDomain("cursor.com", "https://careers.cursor.com/")).toBe(true);
    expect(sameEmployerDomain("cursor.com", "https://www.cursor.com/jobs")).toBe(true);
    expect(sameEmployerDomain("cursor.com", "https://notcursor.com/careers")).toBe(false);
    expect(sameEmployerDomain("cursor.com", "https://cursor.com.evil.test/careers")).toBe(false);
  });

  it("keeps the known-path list short rather than a dictionary", () => {
    expect(CAREERS_PATHS.length).toBeLessThanOrEqual(4);
  });

  it("declares hard request and redirect bounds", () => {
    expect(MAX_REQUESTS_PER_EMPLOYER).toBeLessThanOrEqual(8);
    expect(MAX_REDIRECTS).toBeLessThanOrEqual(3);
  });

  it("never follows a careers link off the employer's domain", () => {
    const html = `<a href="https://partner.example/careers">Careers</a><a href="/careers">Jobs</a>`;
    const links = careersLinks(anchors(html, "https://acme.test/"), "acme.test");
    expect(links).toEqual(["https://acme.test/careers"]);
  });
});

describe("ATS link extraction", () => {
  const page = `
    <a href="https://jobs.ashbyhq.com/mirage">See open roles</a>
    <a href="https://www.linkedin.com/company/captions/jobs">LinkedIn</a>
    <a href="https://twitter.com/captions">Follow us</a>
  `;

  it("finds the supported board and ignores aggregators", () => {
    const { supported } = atsLinks(anchors(page, "https://captions.ai/careers"), "https://captions.ai/careers");
    expect(supported).toHaveLength(1);
    expect(supported[0]).toMatchObject({ providerId: "ashby", connectorKey: "mirage" });
  });

  it("records an unsupported ATS instead of resolving it", () => {
    const html = `<a href="https://acme.icims.com/jobs/search">Open roles</a>`;
    const { supported, unsupported } = atsLinks(anchors(html, "https://acme.test/careers"), "https://acme.test/careers");
    expect(supported).toHaveLength(0);
    expect(unsupported[0]).toMatchObject({ ats: "iCIMS", host: "acme.icims.com" });
  });

  it("deduplicates repeated links to the same board", () => {
    const html = `
      <a href="https://jobs.ashbyhq.com/cursor">Careers</a>
      <a href="https://jobs.ashbyhq.com/cursor/1234">A role</a>
      <a href="https://jobs.ashbyhq.com/cursor">Footer careers</a>`;
    const { supported } = atsLinks(anchors(html, "https://cursor.com/careers"), "https://cursor.com/careers");
    expect(supported).toHaveLength(1);
  });
});

describe("link extraction shapes that occur in the wild", () => {
  it("reads an anchor that wraps a block of markup", () => {
    // Job cards nest a lot between <a> and </a>. Requiring a nearby closing
    // tag found nothing on Sourcegraph's careers page.
    const html = `
      <a href="https://job-boards.greenhouse.io/sourcegraph91/jobs/6103567004">
        <div class="card"><h3>Staff Product Designer</h3>
          <p>${"detail ".repeat(80)}</p>
          <span>Remote</span></div>
      </a>`;
    const { supported } = atsLinks(anchors(html, "https://sourcegraph.com/jobs"), "https://sourcegraph.com/jobs");
    expect(supported[0]).toMatchObject({ providerId: "greenhouse", connectorKey: "sourcegraph91" });
  });

  it("reads ATS deep links embedded in a data payload", () => {
    // Cursor and Hebbia publish their board this way — per-posting URLs inside
    // a script blob rather than a link to the board root.
    const html = `<script>{"jobs":[
      {"url":"https://jobs.ashbyhq.com/cursor/bff67718-1dbf-4d66-bcef-8b68d93d716f"},
      {"url":"https://jobs.ashbyhq.com/cursor/13ceadb8-638f-40c7-a59d-70dab2f4de0b"}]}</script>`;
    const embedded = embeddedAtsUrls(html);
    expect(embedded).toHaveLength(2);
    const { supported } = atsLinks(
      embedded.map((entry) => ({ href: entry.url, text: "" })),
      "https://cursor.com/careers",
    );
    expect(supported).toHaveLength(1);
    expect(supported[0]).toMatchObject({ providerId: "ashby", connectorKey: "cursor" });
  });

  it("counts repeats, which is what separates a board from a mention", () => {
    const html = `
      https://jobs.ashbyhq.com/hebbia-ai/a1 https://jobs.ashbyhq.com/hebbia-ai/a1
      https://jobs.ashbyhq.com/someone-else/x`;
    const counted = embeddedAtsUrls(html);
    expect(counted.find((entry) => entry.url.includes("/a1"))?.occurrences).toBe(2);
    expect(counted.find((entry) => entry.url.includes("someone-else"))?.occurrences).toBe(1);
  });

  it("ignores generic API templates that name no board", () => {
    // Glean's careers page carries `.../v1/boards/${company}/jobs` — a runtime
    // integration, not a published token.
    const html = "fetch(`https://boards-api.greenhouse.io/v1/boards/${company}/jobs?content=true`)";
    const { supported } = atsLinks(
      embeddedAtsUrls(html).map((entry) => ({ href: entry.url, text: "" })),
      "https://glean.com/careers",
    );
    expect(supported.map((entry) => entry.connectorKey)).not.toContain("${company}");
  });
});

describe("confidence", () => {
  const base = { verifiedJobCount: 12, reachedVia: "known-path" as const, nameMatchesToken: false };

  it("outranks name-derived resolution when the board verifies", () => {
    // Name derivation tops out around 80; this must sit above it.
    const single = careersConfidence({ ...base, sightings: [{} as never] });
    expect(single).toBeGreaterThan(80);
  });

  it("penalises a page advertising several different boards", () => {
    // A recruiting vendor or customer-logo wall, not an employer careers page.
    const many = careersConfidence({ ...base, sightings: [{}, {}, {}] as never[] });
    const one = careersConfidence({ ...base, sightings: [{} as never] });
    expect(many).toBeLessThan(one - 20);
  });

  it("penalises a board that cannot be verified", () => {
    const unverified = careersConfidence({ ...base, sightings: [{} as never], verifiedJobCount: null });
    expect(unverified).toBeLessThan(60);
  });

  it("never penalises a token that differs from the company name", () => {
    // That mismatch is the entire case this phase handles.
    const mismatch = careersConfidence({ ...base, sightings: [{} as never], nameMatchesToken: false });
    expect(mismatch).toBeGreaterThanOrEqual(85);
  });

  it("never claims certainty", () => {
    const best = careersConfidence({
      sightings: [{} as never],
      verifiedJobCount: 99,
      reachedVia: "redirect",
      nameMatchesToken: true,
    });
    expect(best).toBeLessThanOrEqual(95);
  });

  it("matches a token against the name without fuzzy guessing", () => {
    expect(tokenMatchesName("Sourcegraph", "sourcegraph")).toBe(true);
    expect(tokenMatchesName("Captions", "mirage")).toBe(false);
  });
});

describe("end-to-end discovery, against canned pages", () => {
  it("follows a homepage careers link to the board", async () => {
    const { client, calls } = harness({
      "https://captions.ai/robots.txt": ROBOTS_OPEN,
      "https://captions.ai": { body: `<a href="/careers">Careers</a>` },
      "https://captions.ai/careers": { body: `<a href="https://jobs.ashbyhq.com/mirage">Open roles</a>` },
      "https://api.ashbyhq.com/posting-api/job-board/mirage": {
        body: JSON.stringify({ jobs: [{ jobUrl: "https://jobs.ashbyhq.com/mirage/1" }] }),
      },
    });
    const result = await discoverAtsFromCareersPage("Captions", "captions.ai", { client });
    expect(result.providerId).toBe("ashby");
    expect(result.connectorKey).toBe("mirage");
    expect(result.verifiedJobCount).toBe(1);
    expect(result.confidence).toBeGreaterThanOrEqual(85);
    expect(result.trail).toContain("https://jobs.ashbyhq.com/mirage");
    expect(calls.length).toBeLessThanOrEqual(MAX_REQUESTS_PER_EMPLOYER + 2);
  });

  it("treats a careers redirect straight to the board as the answer", async () => {
    const { client } = harness({
      "https://cursor.com/robots.txt": ROBOTS_OPEN,
      "https://cursor.com": { body: `<p>No links here</p>` },
      "https://cursor.com/careers": { location: "https://jobs.ashbyhq.com/cursor" },
      "https://api.ashbyhq.com/posting-api/job-board/cursor": {
        body: JSON.stringify({ jobs: [{ jobUrl: "https://jobs.ashbyhq.com/cursor/9" }] }),
      },
    });
    const result = await discoverAtsFromCareersPage("Anysphere (Cursor)", "cursor.com", { client });
    expect(result.connectorKey).toBe("cursor");
    expect(result.atsUrl).toBe("https://jobs.ashbyhq.com/cursor");
  });

  it("recovers a numeric-suffixed Greenhouse token", async () => {
    const { client } = harness({
      "https://sourcegraph.com/robots.txt": ROBOTS_OPEN,
      "https://sourcegraph.com": { body: `<a href="/jobs">Join us</a>` },
      "https://sourcegraph.com/jobs": { body: `<a href="https://boards.greenhouse.io/sourcegraph91">Apply</a>` },
      "https://boards-api.greenhouse.io/v1/boards/sourcegraph91/jobs": {
        body: JSON.stringify({ jobs: [{ absolute_url: "https://boards.greenhouse.io/sourcegraph91/jobs/1" }] }),
      },
    });
    const result = await discoverAtsFromCareersPage("Sourcegraph", "sourcegraph.com", { client });
    expect(result).toMatchObject({ providerId: "greenhouse", connectorKey: "sourcegraph91" });
  });

  it("fails closed when the employer's robots policy cannot be verified", async () => {
    const { client, calls } = harness({ "https://acme.test/robots.txt": { status: 503 } });
    const result = await discoverAtsFromCareersPage("Acme", "acme.test", { client });
    expect(result.providerId).toBeNull();
    expect(result.reason).toMatch(/robots policy/i);
    // Nothing beyond the policy check was requested.
    expect(calls.every((url) => url.endsWith("/robots.txt"))).toBe(true);
  });

  it("respects an explicit disallow on the careers path", async () => {
    const { client } = harness({
      "https://acme.test/robots.txt": { body: "User-agent: *\nDisallow: /" },
      "https://acme.test": { body: `<a href="https://jobs.ashbyhq.com/acme">Careers</a>` },
    });
    const result = await discoverAtsFromCareersPage("Acme", "acme.test", { client });
    expect(result.providerId).toBeNull();
  });

  it("reports an unsupported ATS instead of falling silent", async () => {
    const { client } = harness({
      "https://acme.test/robots.txt": ROBOTS_OPEN,
      "https://acme.test": { body: `<a href="/careers">Careers</a>` },
      "https://acme.test/careers": { body: `<a href="https://acme.icims.com/jobs">Search openings</a>` },
    });
    const result = await discoverAtsFromCareersPage("Acme", "acme.test", { client });
    expect(result.providerId).toBeNull();
    expect(result.unsupported[0].ats).toBe("iCIMS");
    expect(result.reason).toMatch(/iCIMS/);
  });

  it("does not accept a board the provider cannot confirm", async () => {
    const { client } = harness({
      "https://acme.test/robots.txt": ROBOTS_OPEN,
      "https://acme.test": { body: `<a href="/careers">Careers</a>` },
      "https://acme.test/careers": { body: `<a href="https://jobs.ashbyhq.com/stale-token">Roles</a>` },
      // The board 404s: a stale link the employer never removed.
    });
    const result = await discoverAtsFromCareersPage("Acme", "acme.test", { client });
    expect(result.verifiedJobCount).toBeNull();
    expect(result.confidence).toBeLessThan(60);
  });

  it("distrusts a surface advertising many unrelated boards", async () => {
    // A recruiting agency's client list, not an employer careers page.
    const { client } = harness({
      "https://agency.test/robots.txt": ROBOTS_OPEN,
      "https://agency.test": { body: `<a href="/careers">Careers</a>` },
      "https://agency.test/careers": {
        body: `
          <a href="https://jobs.ashbyhq.com/alpha">Alpha</a>
          <a href="https://jobs.ashbyhq.com/beta">Beta</a>
          <a href="https://boards.greenhouse.io/gamma">Gamma</a>`,
      },
      "https://api.ashbyhq.com/posting-api/job-board/alpha": {
        body: JSON.stringify({ jobs: [{ jobUrl: "https://jobs.ashbyhq.com/alpha/1" }] }),
      },
    });
    const result = await discoverAtsFromCareersPage("Agency", "agency.test", { client });
    expect(result.sightings.length).toBeGreaterThan(2);
    expect(result.confidence).toBeLessThan(70);
  });

  it("stays inside its request budget on an unhelpful site", async () => {
    const { client, calls } = harness({ "https://empty.test/robots.txt": ROBOTS_OPEN });
    const result = await discoverAtsFromCareersPage("Empty", "empty.test", { client, maxRequests: 6 });
    expect(result.providerId).toBeNull();
    expect(calls.length).toBeLessThanOrEqual(8);
    expect(result.requests).toBeLessThanOrEqual(8);
  });

  it("refuses to act without a recorded domain", async () => {
    const { client, calls } = harness({});
    const result = await discoverAtsFromCareersPage("Nameless", "", { client });
    expect(result.providerId).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
