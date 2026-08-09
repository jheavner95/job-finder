import { describe, expect, it } from "vitest";

import {
  getOperationalCapability,
  OPERATIONAL_PROVIDER_CAPABILITIES,
} from "../lib/job-sources/capabilities";
import { checkRobots } from "../lib/job-sources/robots";

const ASHBY_ROBOTS = "https://api.ashbyhq.com/robots.txt";
const ASHBY_PATH = "/posting-api/job-board/example";

/** Minimal fetch double returning one canned robots.txt response. */
function robotsResponder(status: number, body = "") {
  return async () =>
    new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}

function failingResponder(message: string) {
  return async () => {
    throw new Error(message);
  };
}

const ashbyPolicy = () => getOperationalCapability("ashby").robotsUnavailablePolicy;

describe("Ashby documented public API robots policy", () => {
  it("declares the RFC 9309 unavailable policy", () => {
    expect(ashbyPolicy()).toBe("rfc9309-unavailable");
  });

  it("permits the public API when robots.txt returns 401", async () => {
    const decision = await checkRobots(
      ASHBY_ROBOTS,
      ASHBY_PATH,
      robotsResponder(401, "Unauthorized") as unknown as typeof fetch,
      ashbyPolicy(),
    );
    expect(decision.allowed).toBe(true);
    expect(decision.policy).toBe("unavailable-4xx");
    expect(decision.reason).toContain("RFC 9309");
    expect(decision.reason).toContain("401");
  });

  it("permits the public API when robots.txt returns 404", async () => {
    const decision = await checkRobots(
      ASHBY_ROBOTS,
      ASHBY_PATH,
      robotsResponder(404) as unknown as typeof fetch,
      ashbyPolicy(),
    );
    expect(decision.allowed).toBe(true);
    expect(decision.policy).toBe("not-published");
  });

  it("permits the public API for other 4xx statuses", async () => {
    // 429 is deliberately absent: a rate limit is not an unavailable policy.
    for (const status of [400, 403, 410]) {
      const decision = await checkRobots(
        ASHBY_ROBOTS,
        ASHBY_PATH,
        robotsResponder(status) as unknown as typeof fetch,
        ashbyPolicy(),
      );
      expect(decision.allowed, `HTTP ${status}`).toBe(true);
    }
  });

  it("does NOT treat 429 as an unavailable policy", async () => {
    // "Slow down" must never be read as "crawl freely", even for a provider
    // holding the RFC 9309 4xx allowance. Retried once, then failed closed.
    await expect(checkRobots(
      ASHBY_ROBOTS,
      ASHBY_PATH,
      robotsResponder(429, "Too Many Requests") as unknown as typeof fetch,
      ashbyPolicy(),
      undefined,
      { sleep: async () => {} },
    )).rejects.toThrow(/rate-limited/);
  });

  it("respects an explicit Disallow that covers the endpoint", async () => {
    const decision = await checkRobots(
      ASHBY_ROBOTS,
      ASHBY_PATH,
      robotsResponder(200, "User-agent: *\nDisallow: /posting-api/") as unknown as typeof fetch,
      ashbyPolicy(),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.policy).toBe("disallow");
  });

  it("still allows when a served robots.txt does not cover the endpoint", async () => {
    const decision = await checkRobots(
      ASHBY_ROBOTS,
      ASHBY_PATH,
      robotsResponder(200, "User-agent: *\nDisallow: /admin/") as unknown as typeof fetch,
      ashbyPolicy(),
    );
    expect(decision.allowed).toBe(true);
    expect(decision.policy).toBe("allow");
  });

  it("fails closed on 5xx", async () => {
    for (const status of [500, 502, 503]) {
      await expect(checkRobots(
        ASHBY_ROBOTS,
        ASHBY_PATH,
        robotsResponder(status) as unknown as typeof fetch,
        ashbyPolicy(),
      )).rejects.toThrow(/could not be verified/);
    }
  });

  it("fails closed on a network failure", async () => {
    await expect(checkRobots(
      ASHBY_ROBOTS,
      ASHBY_PATH,
      failingResponder("socket hang up") as unknown as typeof fetch,
      ashbyPolicy(),
    )).rejects.toThrow("socket hang up");
  });
});

describe("the exception is scoped to Ashby alone", () => {
  it("leaves every other provider failing closed on 4xx", () => {
    const exceptions = OPERATIONAL_PROVIDER_CAPABILITIES
      .filter((capability) => capability.robotsUnavailablePolicy !== "fail-closed")
      .map((capability) => capability.providerId);
    expect(exceptions).toEqual(["ashby"]);
  });

  it("blocks a 401 for a provider without the policy", async () => {
    for (const providerId of ["greenhouse", "lever", "workable", "recruitee"]) {
      await expect(checkRobots(
        "https://example.invalid/robots.txt",
        "/jobs",
        robotsResponder(401, "Unauthorized") as unknown as typeof fetch,
        getOperationalCapability(providerId).robotsUnavailablePolicy,
      ), providerId).rejects.toThrow(/could not be verified/);
    }
  });

  it("defaults to fail-closed when no policy is supplied", async () => {
    await expect(checkRobots(
      "https://example.invalid/robots.txt",
      "/jobs",
      robotsResponder(401) as unknown as typeof fetch,
    )).rejects.toThrow(/could not be verified/);
  });
});
