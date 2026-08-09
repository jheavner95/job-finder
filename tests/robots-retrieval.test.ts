import { describe, expect, it } from "vitest";

import { checkRobots, robotsRetryDelay, type RobotsDocumentCache } from "../lib/job-sources/robots";
import { getOperationalCapability } from "../lib/job-sources/capabilities";

const URL_A = "https://tenant-a.recruitee.com/robots.txt";
const PATH = "/api/offers/";

/** Fetch double returning a scripted sequence of responses, counting calls. */
function scripted(responses: Array<() => Response>) {
  const calls: string[] = [];
  const client = (async (input: string | URL | Request) => {
    calls.push(String(input));
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    return next();
  }) as unknown as typeof fetch;
  return { client, calls };
}

const tooMany = (retryAfter?: string) => () =>
  new Response("Too Many Requests", {
    status: 429,
    headers: retryAfter ? { "Retry-After": retryAfter } : {},
  });
const ok = (body: string) => () => new Response(body, { status: 200 });
const status = (code: number) => () => new Response("", { status: code });

/** No real waiting in tests; capture what the delay would have been. */
function runtime() {
  const waited: number[] = [];
  return { waited, rt: { sleep: async (ms: number) => { waited.push(ms); }, now: () => 1_000_000 } };
}

describe("robots 429 handling", () => {
  it("honours Retry-After and succeeds on the single retry", async () => {
    const { client, calls } = scripted([tooMany("2"), ok("User-agent: *\nAllow: /")]);
    const { waited, rt } = runtime();
    const decision = await checkRobots(URL_A, PATH, client, "fail-closed", undefined, rt);
    expect(decision.allowed).toBe(true);
    expect(calls).toHaveLength(2);
    expect(waited).toEqual([2_000]);
  });

  it("fails closed when the retry is rate-limited again", async () => {
    const { client, calls } = scripted([tooMany("1"), tooMany("1")]);
    const { rt } = runtime();
    await expect(checkRobots(URL_A, PATH, client, "fail-closed", undefined, rt))
      .rejects.toThrow(/rate-limited the request twice/);
    expect(calls).toHaveLength(2);
  });

  it("retries at most once — never a retry storm", async () => {
    const { client, calls } = scripted([tooMany(), tooMany(), ok("Allow: /")]);
    const { rt } = runtime();
    await expect(checkRobots(URL_A, PATH, client, "fail-closed", undefined, rt)).rejects.toThrow();
    expect(calls).toHaveLength(2);
  });

  it("bounds an excessive Retry-After", async () => {
    const { client } = scripted([tooMany("86400"), ok("Allow: /")]);
    const { waited, rt } = runtime();
    await checkRobots(URL_A, PATH, client, "fail-closed", undefined, rt);
    expect(waited[0]).toBe(5_000);
  });

  it("uses a bounded default when Retry-After is absent", async () => {
    const { client } = scripted([tooMany(), ok("Allow: /")]);
    const { waited, rt } = runtime();
    await checkRobots(URL_A, PATH, client, "fail-closed", undefined, rt);
    expect(waited).toEqual([1_000]);
  });

  it("caps every delay form at five seconds", () => {
    expect(robotsRetryDelay("2")).toBe(2_000);
    expect(robotsRetryDelay("86400")).toBe(5_000);
    expect(robotsRetryDelay(null)).toBe(1_000);
    expect(robotsRetryDelay("not-a-number")).toBe(1_000);
    expect(robotsRetryDelay("-5")).toBe(1_000);
  });

  it("respects an explicit Disallow served on the retry", async () => {
    const { client } = scripted([tooMany("1"), ok("User-agent: *\nDisallow: /api/")]);
    const { rt } = runtime();
    const decision = await checkRobots(URL_A, PATH, client, "fail-closed", undefined, rt);
    expect(decision.allowed).toBe(false);
    expect(decision.policy).toBe("disallow");
  });

  it("treats 429 as slow-down even under the RFC 9309 unavailable policy", async () => {
    // 429 means "you are going too fast", not "the policy is unavailable".
    // Ashby's 4xx allowance must not turn a rate limit into permission.
    const { client } = scripted([tooMany("1"), tooMany("1")]);
    const { rt } = runtime();
    await expect(checkRobots(URL_A, PATH, client, "rfc9309-unavailable", undefined, rt))
      .rejects.toThrow(/rate-limited/);
  });
});

describe("unchanged failure modes", () => {
  it("still fails closed on 5xx", async () => {
    for (const code of [500, 502, 503]) {
      const { client, calls } = scripted([status(code)]);
      await expect(checkRobots(URL_A, PATH, client)).rejects.toThrow(/could not be verified/);
      expect(calls, `HTTP ${code} must not retry`).toHaveLength(1);
    }
  });

  it("still fails closed on a network error", async () => {
    const client = (async () => { throw new Error("socket hang up"); }) as unknown as typeof fetch;
    await expect(checkRobots(URL_A, PATH, client)).rejects.toThrow("socket hang up");
  });

  it("still treats 404 as not-published", async () => {
    const { client } = scripted([status(404)]);
    const decision = await checkRobots(URL_A, PATH, client);
    expect(decision.allowed).toBe(true);
    expect(decision.policy).toBe("not-published");
  });

  it("keeps Ashby's 4xx policy intact for non-429 statuses", async () => {
    const policy = getOperationalCapability("ashby").robotsUnavailablePolicy;
    for (const code of [400, 401, 403, 410]) {
      const { client } = scripted([status(code)]);
      const decision = await checkRobots(URL_A, PATH, client, policy);
      expect(decision.allowed, `HTTP ${code}`).toBe(true);
      expect(decision.policy).toBe("unavailable-4xx");
    }
  });

  it("keeps other providers failing closed on the same statuses", async () => {
    for (const provider of ["greenhouse", "lever", "recruitee", "workable"]) {
      const policy = getOperationalCapability(provider).robotsUnavailablePolicy;
      const { client } = scripted([status(401)]);
      await expect(checkRobots(URL_A, PATH, client, policy), provider)
        .rejects.toThrow(/could not be verified/);
    }
  });
});

describe("robots document cache", () => {
  it("fetches one document per host and evaluates each path against it", async () => {
    // Greenhouse serves one robots.txt for every board; only the path varies.
    const { client, calls } = scripted([ok("User-agent: *\nDisallow: /embed/")]);
    const cache: RobotsDocumentCache = new Map();
    const url = "https://boards-api.greenhouse.io/robots.txt";
    const a = await checkRobots(url, "/v1/boards/alpha/jobs", client, "fail-closed", cache);
    const b = await checkRobots(url, "/v1/boards/beta/jobs", client, "fail-closed", cache);
    const blocked = await checkRobots(url, "/embed/board", client, "fail-closed", cache);
    expect(calls).toHaveLength(1);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    expect(blocked.allowed).toBe(false);
  });

  it("never reuses one tenant's policy for another host", async () => {
    // Recruitee serves a robots host per tenant, so each needs its own fetch.
    const { client, calls } = scripted([ok("User-agent: *\nAllow: /")]);
    const cache: RobotsDocumentCache = new Map();
    await checkRobots("https://tenant-a.recruitee.com/robots.txt", PATH, client, "fail-closed", cache);
    await checkRobots("https://tenant-b.recruitee.com/robots.txt", PATH, client, "fail-closed", cache);
    expect(calls).toHaveLength(2);
    expect(cache.size).toBe(2);
  });

  it("does not cache a failed retrieval", async () => {
    const { client } = scripted([status(500)]);
    const cache: RobotsDocumentCache = new Map();
    await expect(checkRobots(URL_A, PATH, client, "fail-closed", cache)).rejects.toThrow();
    expect(cache.size).toBe(0);
  });
});
