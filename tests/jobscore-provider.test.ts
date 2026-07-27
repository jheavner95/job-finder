import { copyFileSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DiscoveryService } from "../lib/job-sources/services/discovery-service";
import {
  JOBSCORE_MINIMUM_POLL_INTERVAL_MS,
  ProviderDiscoveryRunner,
} from "../lib/job-sources/services/provider-discovery";
import {
  JobScoreProvider,
  parseJobScoreFeed,
  retryAfterMilliseconds,
} from "../lib/job-sources/providers/jobscore";
import { JobSourceRegistry } from "../lib/job-sources/registry";
import type { ProviderContext } from "../lib/job-sources/types";
import {
  jobScoreEmptyFeed,
  jobScoreMissingOptionalFields,
  jobScoreMultipleJobs,
  jobScoreSingleJob,
} from "./fixtures/jobscore";

const databases: Array<{ client: PrismaClient; path: string }> = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async ({ client, path }) => {
    await client.$disconnect();
    unlinkSync(path);
  }));
});

const context: ProviderContext = {
  company: "Example Products",
  careerUrl: "https://careers.jobscore.com/jobs/example",
  connectorKey: "example",
  enabled: true,
  robotsPolicy: "allow",
};

function jsonResponse(payload: unknown, status = 200, headers?: HeadersInit) {
  return Promise.resolve(new Response(
    typeof payload === "string" ? payload : JSON.stringify(payload),
    { status, headers: { "Content-Type": "application/json", ...headers } },
  ));
}

function isolatedDatabase() {
  const path = `/tmp/job-search-intelligence-jobscore-${randomUUID()}.db`;
  copyFileSync("prisma/dev.db", path);
  const client = new PrismaClient({ datasourceUrl: `file:${path}` });
  databases.push({ client, path });
  return client;
}

describe("JobScore public connector", () => {
  it("parses a single job and documented feed fields", () => {
    expect(parseJobScoreFeed(jobScoreSingleJob)).toMatchObject({
      company: "Example Products",
      jobs: [{
        id: "JS-101",
        department: "Product Design",
        opened_date: "2026-07-01T12:00:00Z",
        last_updated_date: "2026-07-20T15:30:00Z",
      }],
    });
  });

  it("discovers multiple jobs and reports deterministic diagnostics", async () => {
    const provider = new JobScoreProvider(vi.fn(() => jsonResponse(jobScoreMultipleJobs)));
    const result = await provider.discoverDetailed({ titles: [], locations: [] }, context);
    expect(result.jobs.map((job) => job.externalId)).toEqual(["JS-101", "JS-102"]);
    expect(result.diagnostics).toMatchObject({
      totalJobsDiscovered: 2,
      titleMatches: 2,
      locationMatches: 2,
    });
  });

  it("normalizes canonical and application URLs, dates, department, and identity", async () => {
    const provider = new JobScoreProvider(vi.fn(() => jsonResponse(jobScoreSingleJob)));
    const [job] = await provider.discover({ titles: [], locations: [] }, context);
    const normalized = provider.normalize(await provider.fetch(job, context), context);
    expect(normalized).toMatchObject({
      title: "Staff Product Designer",
      company: "Example Products",
      department: "Product Design",
      location: "Chicago, IL",
      employmentType: "Full-time",
      salary: "",
      url: "https://careers.jobscore.com/careers/example/jobs/JS-101",
      applicationUrl: "https://careers.jobscore.com/careers/example/apply/JS-101",
      providerExternalId: "JS-101",
    });
    expect(normalized.postedAt?.toISOString()).toBe("2026-07-01T12:00:00.000Z");
    expect(normalized.sourceUpdatedAt?.toISOString()).toBe("2026-07-20T15:30:00.000Z");
    expect(provider.validate(normalized)).toEqual({ valid: true, errors: [] });
  });

  it("accepts missing optional fields without fabricating values", async () => {
    const provider = new JobScoreProvider(
      vi.fn(() => jsonResponse(jobScoreMissingOptionalFields)),
    );
    const [job] = await provider.discover({ titles: [], locations: [] }, context);
    const normalized = provider.normalize(await provider.fetch(job, context), context);
    expect(normalized).toMatchObject({
      salary: "",
      location: "",
      employmentType: "",
      department: "",
    });
    expect(normalized.postedAt).toBeUndefined();
    expect(normalized.sourceUpdatedAt).toBeUndefined();
    expect(normalized.applicationUrl).toBeUndefined();
  });

  it("fails closed for malformed JSON, schema drift, missing IDs, duplicate IDs, and invalid URLs", async () => {
    const malformed = new JobScoreProvider(vi.fn(() => jsonResponse("{bad json")));
    await expect(malformed.discover({ titles: [], locations: [] }, context))
      .rejects.toMatchObject({ code: "MALFORMED_FEED" });
    expect(() => parseJobScoreFeed({ company: "Example", positions: [] }))
      .toThrow(/jobs must be a list/);
    expect(() => parseJobScoreFeed({
      ...jobScoreSingleJob,
      jobs: [{ ...jobScoreSingleJob.jobs[0], id: "" }],
    })).toThrow(/missing id/);
    expect(() => parseJobScoreFeed({
      ...jobScoreSingleJob,
      jobs: [jobScoreSingleJob.jobs[0], jobScoreSingleJob.jobs[0]],
    })).toThrow(/duplicate position id/);
    expect(() => parseJobScoreFeed({
      ...jobScoreSingleJob,
      jobs: [{ ...jobScoreSingleJob.jobs[0], detail_url: "not-a-url" }],
    })).toThrow(/invalid detail_url/);
  });

  it("reports deleted jobs when a position disappears", async () => {
    const client = vi.fn()
      .mockImplementationOnce(() => jsonResponse(jobScoreSingleJob))
      .mockImplementationOnce(() => jsonResponse(jobScoreEmptyFeed));
    const provider = new JobScoreProvider(client);
    const [job] = await provider.discover({ titles: [], locations: [] }, context);
    await expect(provider.fetch(job, context)).rejects.toThrow(/no longer public/);
  });

  it("respects Retry-After and retries throttled feeds", async () => {
    const sleeps: number[] = [];
    const client = vi.fn()
      .mockImplementationOnce(() => jsonResponse("", 429, { "Retry-After": "2" }))
      .mockImplementationOnce(() => jsonResponse(jobScoreSingleJob));
    const provider = new JobScoreProvider(client, {
      sleep: async (milliseconds) => { sleeps.push(milliseconds); },
      random: () => 0,
      now: () => 0,
    });
    await expect(provider.discover({ titles: [], locations: [] }, context))
      .resolves.toHaveLength(1);
    expect(sleeps).toEqual([2_000]);
    expect(retryAfterMilliseconds("120", 0)).toBe(60_000);
  });

  it("uses bounded exponential backoff with jitter for transient failures", async () => {
    const sleeps: number[] = [];
    const client = vi.fn()
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockImplementationOnce(() => jsonResponse(jobScoreSingleJob));
    const provider = new JobScoreProvider(client, {
      sleep: async (milliseconds) => { sleeps.push(milliseconds); },
      random: () => 0,
      now: () => 0,
    });
    await provider.discover({ titles: [], locations: [] }, context);
    expect(sleeps).toEqual([250]);
  });

  it("fails closed on per-employer robots denial", async () => {
    const database = isolatedDatabase();
    const company = `JobScore Robots ${randomUUID()}`;
    const connector = await database.companyConnector.create({
      data: {
        company,
        careerUrl: "https://careers.jobscore.com/jobs/blocked",
        atsType: "jobscore",
        connectorKey: "blocked",
        enabled: true,
      },
    });
    const client = vi.fn(() => Promise.resolve(new Response(
      "User-agent: *\nDisallow: /jobs/blocked/feed.json",
      { status: 200 },
    )));
    const registry = new JobSourceRegistry().register(new JobScoreProvider(client));
    const result = await new ProviderDiscoveryRunner(
      database,
      "jobscore",
      client,
      registry,
      { connectorIds: [connector.id] },
    ).run();
    const crawl = await database.connectorCrawl.findFirstOrThrow({
      where: { connectorId: connector.id },
    });
    expect(result.failures).toBe(1);
    expect(crawl).toMatchObject({ status: "Blocked", failures: 1 });
    expect(client).toHaveBeenCalledTimes(1);
  });

  it("enforces the one-hour polling floor without issuing a request", async () => {
    const database = isolatedDatabase();
    const company = `JobScore Polling ${randomUUID()}`;
    const connector = await database.companyConnector.create({
      data: {
        company,
        careerUrl: "https://careers.jobscore.com/jobs/example",
        atsType: "jobscore",
        connectorKey: `poll-${randomUUID().slice(0, 8)}`,
        enabled: true,
        lastSuccessfulFetch: new Date(Date.now() - JOBSCORE_MINIMUM_POLL_INTERVAL_MS + 1_000),
      },
    });
    const client = vi.fn();
    const registry = new JobSourceRegistry().register(new JobScoreProvider(client));
    const result = await new ProviderDiscoveryRunner(
      database,
      "jobscore",
      client,
      registry,
      { connectorIds: [connector.id] },
    ).run();
    const crawl = await database.connectorCrawl.findFirstOrThrow({
      where: { connectorId: connector.id },
    });
    expect(result).toMatchObject({ companiesProcessed: 1, failures: 0 });
    expect(crawl.status).toBe("SkippedRateLimit");
    expect(crawl.metadata).toMatchObject({
      skipReason: "jobscore polling floor has not elapsed.",
    });
    expect(client).not.toHaveBeenCalled();
  });

  it("persists source identity and prevents repeat imports", async () => {
    const database = isolatedDatabase();
    const identityContext = {
      ...context,
      company: `JobScore Identity ${randomUUID()}`,
    };
    const provider = new JobScoreProvider(vi.fn(() => jsonResponse(jobScoreSingleJob)));
    const discovery = new DiscoveryService(
      database,
      new JobSourceRegistry().register(provider),
    );
    const [job] = await provider.discover({ titles: [], locations: [] }, identityContext);
    const first = await discovery.evaluateAndImport("jobscore", job, identityContext);
    const second = await discovery.evaluateAndImport("jobscore", job, identityContext);
    const persisted = await database.job.findMany({
      where: { source: { name: "JobScore" }, company: { name: identityContext.company } },
      select: {
        sourceJobId: true,
        sourceUrl: true,
        applicationUrl: true,
        department: true,
      },
    });
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(persisted).toEqual([{
      sourceJobId: "JS-101",
      sourceUrl: "https://careers.jobscore.com/careers/example/jobs/JS-101",
      applicationUrl: "https://careers.jobscore.com/careers/example/apply/JS-101",
      department: "Product Design",
    }]);
  });
});
