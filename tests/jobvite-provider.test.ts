import { afterEach, describe, expect, it, vi } from "vitest";

import { getOperationalCapability } from "../lib/job-sources/capabilities";
import { MemoryEmployerFeedStore } from "../lib/job-sources/employer-feed-config";
import { JobviteProvider } from "../lib/job-sources/providers/jobvite";
import {
  configureJobviteFeed,
  removeJobviteFeed,
} from "../lib/job-sources/services/jobvite-feed-service";
import type { ProviderContext } from "../lib/job-sources/types";
import {
  jobviteClosedJob,
  jobviteJob,
  jobvitePage,
  jobviteSecondJob,
} from "./fixtures/jobvite";
import { createTestDatabase, releaseTestDatabases } from "./test-database";

const connectorId = "jobvite-test";
const configuration = {
  url: "https://feeds.example.com/jobvite/jobs?reviewed=token",
  employerId: "company-42",
  schemaVersion: "jobvite-v2" as const,
};
const context: ProviderContext = {
  connectorId,
  company: "Example",
  careerUrl: "https://jobs.jobvite.com/example",
  connectorKey: "example",
  enabled: true,
  robotsPolicy: "allow",
  feedOrigin: "https://feeds.example.com",
  feedPath: "/jobvite/jobs",
  feedVersion: "jobvite-v2",
};
const database = () => createTestDatabase({ label: "jobvite" });

afterEach(releaseTestDatabases);

function response(value: unknown, status = 200, headers?: HeadersInit) {
  return Promise.resolve(new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  }));
}

async function provider(
  client: typeof fetch = vi.fn(() => response(jobvitePage([jobviteJob]))),
) {
  const store = new MemoryEmployerFeedStore();
  await store.set("jobvite", connectorId, configuration);
  return new JobviteProvider(client, store, { random: () => 0 });
}

describe("Jobvite employer feed connector", () => {
  it("declares the authorized feed capabilities and daily polling floor", () => {
    expect(getOperationalCapability("jobvite")).toMatchObject({
      supportsFeed: true,
      supportsDeletion: true,
      supportsPagination: true,
      supportsRetryAfter: true,
      authenticationType: "employer-feed",
      feedCompleteness: "complete",
      defaultPolling: "Daily",
      pollingFloorMs: 3_600_000,
    });
  });

  it("requires a reviewed feed configuration", async () => {
    const subject = new JobviteProvider(vi.fn(), new MemoryEmployerFeedStore());
    await expect(subject.discover({ titles: [], locations: [] }, context))
      .rejects.toMatchObject({ code: "INVALID_CONFIGURATION" });
  });

  it("normalizes supported Jobvite fields without fabricating salary or remote", async () => {
    const subject = await provider();
    const result = await subject.discoverDetailed({ titles: [], locations: [] }, context);
    const posting = await subject.fetch(result.jobs[0]);
    expect(subject.normalize(posting, context)).toMatchObject({
      title: "Staff Product Designer",
      company: "Example",
      description: "Lead enterprise product design.",
      url: jobviteJob.detailLink,
      applicationUrl: jobviteJob.applyLink,
      department: "Product",
      employmentType: "Full-time",
      salary: "",
      providerExternalId: "jv-101",
    });
    expect(result.feed).toEqual({ complete: true, sourceJobIds: ["jv-101"] });
  });

  it("paginates on the reviewed origin and certifies a complete feed", async () => {
    const next = "https://feeds.example.com/jobvite/jobs?page=2";
    const client = vi.fn<typeof fetch>((request) =>
      String(request).includes("page=2")
        ? response(jobvitePage([jobviteSecondJob]))
        : response(jobvitePage([jobviteJob], next)));
    const result = await (await provider(client))
      .discoverDetailed({ titles: [], locations: [] }, context);
    expect(result.feed.sourceJobIds).toEqual(["jv-101", "jv-102"]);
    expect(client).toHaveBeenCalledTimes(2);
  });

  it("rejects cross-origin pagination", async () => {
    const subject = await provider(vi.fn(() =>
      response(jobvitePage([jobviteJob], "https://attacker.example/jobs"))));
    await expect(subject.discover({ titles: [], locations: [] }, context))
      .rejects.toMatchObject({ code: "SCHEMA_DRIFT" });
  });

  it.each([
    ["malformed JSON", () => Promise.resolve(new Response("{", { status: 200 }))],
    ["network failure", () => Promise.reject(new TypeError("offline"))],
    ["timeout", () => Promise.reject(new DOMException("timed out", "AbortError"))],
  ])("reports deterministic errors for %s", async (_label, client) => {
    const subject = await provider(vi.fn(client));
    await expect(subject.discover({ titles: [], locations: [] }, context)).rejects.toBeDefined();
  });

  it("rejects missing IDs, duplicate IDs, ownership changes, and schema drift", async () => {
    const cases = [
      [{ ...jobviteJob, eId: "" }, "MISSING_ID"],
      [[jobviteJob, jobviteJob], "DUPLICATE_ID"],
      [{ ...jobviteJob, companyId: "other" }, "INVALID_CONFIGURATION"],
      [{ ...jobviteJob, distribution: "yes" }, "SCHEMA_DRIFT"],
    ] as const;
    for (const [records, code] of cases) {
      const list = Array.isArray(records) ? records : [records];
      const subject = await provider(vi.fn(() => response(jobvitePage(list))));
      await expect(subject.discover({ titles: [], locations: [] }, context))
        .rejects.toMatchObject({ code });
    }
  });

  it("treats unpublished jobs as deleted from the complete active feed", async () => {
    const subject = await provider(vi.fn(() =>
      response(jobvitePage([jobviteJob, jobviteClosedJob]))));
    const result = await subject.discoverDetailed({ titles: [], locations: [] }, context);
    expect(result.feed.sourceJobIds).toEqual(["jv-101"]);
    expect(result.diagnostics.closedJobs).toBe(1);
  });

  it("honors Retry-After through the shared request executor", async () => {
    const client = vi.fn<typeof fetch>()
      .mockImplementationOnce(() => response({}, 429, { "Retry-After": "0" }))
      .mockImplementationOnce(() => response(jobvitePage([jobviteJob])));
    const result = await (await provider(client))
      .discoverDetailed({ titles: [], locations: [] }, context);
    expect(result.jobs).toHaveLength(1);
    expect(client).toHaveBeenCalledTimes(2);
  });

  it("does not request detail pages or scrape HTML", async () => {
    const client = vi.fn<typeof fetch>(() => response(jobvitePage([jobviteJob])));
    const subject = await provider(client);
    const result = await subject.discoverDetailed({ titles: [], locations: [] }, context);
    await subject.fetch(result.jobs[0]);
    expect(client).toHaveBeenCalledTimes(1);
  });

  it("onboards only after feed and robots certification, then removes safely", async () => {
    const db = await database();
    await db.companyConnector.create({
      data: {
        id: connectorId,
        company: "Example",
        careerUrl: context.careerUrl,
        atsType: "jobvite",
        connectorKey: "example",
        enabled: false,
        feedStatus: "Missing",
      },
    });
    const store = new MemoryEmployerFeedStore();
    const client = vi.fn<typeof fetch>((request) =>
      String(request).endsWith("/robots.txt")
        ? Promise.resolve(new Response("User-agent: *\nAllow: /", { status: 200 }))
        : response(jobvitePage([jobviteJob])));
    await expect(configureJobviteFeed(db, {
      connectorId,
      feedUrl: configuration.url,
      employerId: configuration.employerId,
    }, { store, client })).resolves.toEqual({ records: 1, complete: true });
    expect(await db.companyConnector.findUnique({ where: { id: connectorId } }))
      .toMatchObject({
        enabled: true,
        feedStatus: "Valid",
        feedOrigin: "https://feeds.example.com",
        feedPath: "/jobvite/jobs",
        feedVersion: "jobvite-v2",
      });
    expect(await store.get("jobvite", connectorId)).toEqual(configuration);

    await removeJobviteFeed(db, connectorId, store);
    expect(await store.get("jobvite", connectorId)).toBeNull();
    expect(await db.companyConnector.findUnique({ where: { id: connectorId } }))
      .toMatchObject({ enabled: false, feedStatus: "Missing", feedOrigin: null });
  });

  it("fails closed on robots denial without replacing the previous feed", async () => {
    const db = await database();
    await db.companyConnector.create({
      data: {
        id: connectorId,
        company: "Example",
        careerUrl: context.careerUrl,
        atsType: "jobvite",
        connectorKey: "example",
        enabled: false,
        feedStatus: "Missing",
      },
    });
    const store = new MemoryEmployerFeedStore();
    await store.set("jobvite", connectorId, configuration);
    const denied = vi.fn<typeof fetch>((request) =>
      String(request).endsWith("/robots.txt")
        ? Promise.resolve(new Response("User-agent: *\nDisallow: /", { status: 200 }))
        : response(jobvitePage([jobviteJob])));
    await expect(configureJobviteFeed(db, {
      connectorId,
      feedUrl: "https://feeds.example.com/jobvite/replacement",
      employerId: configuration.employerId,
    }, { store, client: denied })).rejects.toMatchObject({ code: "ROBOTS_DENIED" });
    expect(await store.get("jobvite", connectorId)).toEqual(configuration);
  });
});
