import { copyFileSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MemoryCredentialStore } from "../lib/job-sources/credentials";
import { TeamtailorProvider } from "../lib/job-sources/providers/teamtailor";
import { JobSourceRegistry } from "../lib/job-sources/registry";
import { ProviderDiscoveryRunner } from "../lib/job-sources/services/provider-discovery";
import {
  configureTeamtailorCredential,
  removeTeamtailorCredential,
  testTeamtailorCredential,
} from "../lib/job-sources/services/teamtailor-credential-service";
import type { ProviderContext } from "../lib/job-sources/types";
import { getOperationalCapability } from "../lib/job-sources/capabilities";
import {
  teamtailorDetail,
  teamtailorIncluded,
  teamtailorJob,
  teamtailorPage,
  teamtailorSecondJob,
} from "./fixtures/teamtailor";

const databases: Array<{ client: PrismaClient; path: string }> = [];
const connectorId = "teamtailor-test-connector";
const credential = {
  apiKey: "authorized-test-key",
  region: "eu" as const,
  apiVersion: "20240404",
};
const context: ProviderContext = {
  connectorId,
  company: "Example Teamtailor",
  careerUrl: "https://example.teamtailor.com",
  connectorKey: "example",
  enabled: true,
  robotsPolicy: "allow",
  credentialRegion: "eu",
};

function database() {
  const path = `/tmp/job-search-intelligence-teamtailor-${randomUUID()}.db`;
  copyFileSync("prisma/dev.db", path);
  const client = new PrismaClient({ datasourceUrl: `file:${path}` });
  databases.push({ client, path });
  return client;
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async ({ client, path }) => {
    await client.$disconnect();
    unlinkSync(path);
  }));
});

function jsonResponse(value: unknown, status = 200, headers?: HeadersInit) {
  return Promise.resolve(new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/vnd.api+json", ...headers },
  }));
}

async function authorizedStore(id = connectorId) {
  const store = new MemoryCredentialStore();
  await store.set("teamtailor", id, credential);
  return store;
}

describe("Teamtailor authorized connector", () => {
  it("declares authenticated pagination and complete-feed capabilities", () => {
    expect(getOperationalCapability("teamtailor")).toMatchObject({
      supportsAuthentication: true,
      authenticationType: "api-key",
      supportsPagination: true,
      supportsRetryAfter: true,
      supportsDeletion: true,
      feedCompleteness: "complete",
      defaultPolling: "Daily",
    });
  });

  it("requires explicit credentials and validates valid credentials without exposing the key", async () => {
    const missing = new TeamtailorProvider(vi.fn(), new MemoryCredentialStore());
    await expect(missing.validateAuthentication(context))
      .rejects.toMatchObject({ code: "AUTH_REQUIRED" });

    const store = await authorizedStore();
    const client = vi.fn<typeof fetch>(() => jsonResponse(teamtailorPage([teamtailorJob])));
    await expect(new TeamtailorProvider(client, store).validateAuthentication(context))
      .resolves.toMatchObject({
        status: "Healthy",
        diagnostics: { credentialConfigured: true, region: "eu" },
      });
    const init = client.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("Authorization"))
      .toBe("Token token=authorized-test-key");
    expect(JSON.stringify(init)).toContain("authorized-test-key");
  });

  it("classifies rejected configured credentials as expired", async () => {
    const store = await authorizedStore();
    const provider = new TeamtailorProvider(
      vi.fn(() => jsonResponse({ errors: [] }, 401)),
      store,
    );
    await expect(provider.validateAuthentication(context))
      .rejects.toMatchObject({ code: "AUTH_EXPIRED" });
  });

  it("classifies authenticated request timeouts without exposing credentials", async () => {
    const store = await authorizedStore();
    const timeout = Object.assign(new Error("secret transport detail"), {
      name: "TimeoutError",
    });
    const provider = new TeamtailorProvider(
      vi.fn().mockRejectedValue(timeout),
      store,
      { sleep: async () => undefined, random: () => 0 },
    );
    await expect(provider.discoverDetailed({ titles: [], locations: [] }, context))
      .rejects.toMatchObject({
        code: "TIMEOUT",
        providerMessage: "The provider request timed out.",
        diagnosticContext: { providerId: "teamtailor" },
      });
  });

  it("paginates the complete feed and normalizes documented fields", async () => {
    const store = await authorizedStore();
    const next = "https://api.teamtailor.com/v1/jobs?page[after]=cursor&page[size]=30";
    const client = vi.fn((input) => {
      const url = String(input);
      if (url.includes("page[after]")) {
        return jsonResponse(teamtailorPage([teamtailorSecondJob]));
      }
      if (url.includes("/v1/jobs/tt-101")) return jsonResponse(teamtailorDetail());
      return jsonResponse(teamtailorPage([teamtailorJob], next));
    });
    const provider = new TeamtailorProvider(client, store);
    const result = await provider.discoverDetailed({ titles: [], locations: [] }, context);
    expect(result.feed).toEqual({
      complete: true,
      sourceJobIds: ["tt-101", "tt-102"],
    });
    expect(result.diagnostics.totalJobsDiscovered).toBe(2);
    const normalized = provider.normalize(
      await provider.fetch(result.jobs[0], context),
      context,
    );
    expect(normalized).toMatchObject({
      title: "Staff Product Designer",
      company: "Example Teamtailor",
      department: "Product Design",
      location: "Chicago · hybrid",
      employmentType: "full-time",
      providerExternalId: "tt-101",
      applicationUrl: "https://example.teamtailor.com/jobs/tt-101-staff-product-designer/applications/new",
    });
    expect(normalized.postedAt?.toISOString()).toBe("2026-07-01T12:00:00.000Z");
    expect(normalized.sourceUpdatedAt?.toISOString()).toBe("2026-07-20T15:30:00.000Z");
  });

  it("fails partial pagination without producing a reconcilable feed", async () => {
    const store = await authorizedStore();
    const next = "https://api.teamtailor.com/v1/jobs?page[after]=cursor&page[size]=30";
    const client = vi.fn((input) =>
      String(input).includes("page[after]")
        ? Promise.reject(new TypeError("network unavailable"))
        : jsonResponse(teamtailorPage([teamtailorJob], next)));
    const provider = new TeamtailorProvider(client, store, {
      sleep: async () => undefined,
      random: () => 0,
    });
    await expect(provider.discoverDetailed({ titles: [], locations: [] }, context))
      .rejects.toMatchObject({ code: "NETWORK" });
  });

  it("honors Retry-After through the shared request executor", async () => {
    const store = await authorizedStore();
    const sleeps: number[] = [];
    const client = vi.fn()
      .mockImplementationOnce(() => jsonResponse({}, 429, { "Retry-After": "2" }))
      .mockImplementationOnce(() => jsonResponse(teamtailorPage([teamtailorJob])));
    const provider = new TeamtailorProvider(client, store, {
      sleep: async (milliseconds) => { sleeps.push(milliseconds); },
      random: () => 0,
      now: () => 0,
    });
    await provider.discoverDetailed({ titles: [], locations: [] }, context);
    expect(sleeps).toEqual([2_000]);
  });

  it("configures, replaces, tests, and safely removes credentials", async () => {
    const db = database();
    const id = randomUUID();
    await db.companyConnector.create({
      data: {
        id,
        company: `Teamtailor Credential ${id}`,
        careerUrl: "https://example.teamtailor.com",
        atsType: "teamtailor",
        connectorKey: `example-${id}`,
        enabled: false,
        credentialStatus: "Missing",
      },
    });
    const store = new MemoryCredentialStore();
    const client = vi.fn(() => jsonResponse(teamtailorPage([teamtailorJob])));
    await configureTeamtailorCredential(db, {
      connectorId: id,
      apiKey: "first-key",
      region: "eu",
    }, { store, client });
    await configureTeamtailorCredential(db, {
      connectorId: id,
      apiKey: "replacement-key",
      region: "na",
    }, { store, client });
    expect(await store.get("teamtailor", id)).toEqual({
      apiKey: "replacement-key",
      region: "na",
      apiVersion: "20240404",
    });
    await expect(testTeamtailorCredential(db, id, { store, client }))
      .resolves.toMatchObject({ status: "Healthy" });
    await removeTeamtailorCredential(db, id, store);
    expect(await store.get("teamtailor", id)).toBeNull();
    await expect(db.companyConnector.findUniqueOrThrow({ where: { id } }))
      .resolves.toMatchObject({
        enabled: false,
        health: "Disabled",
        credentialStatus: "Missing",
        credentialRegion: null,
      });
  });

  it("does not store invalid credentials and disables expired credentials", async () => {
    const db = database();
    const id = randomUUID();
    await db.companyConnector.create({
      data: {
        id,
        company: `Teamtailor Invalid ${id}`,
        careerUrl: "https://example.teamtailor.com",
        atsType: "teamtailor",
        connectorKey: `invalid-${id}`,
        enabled: false,
        credentialStatus: "Missing",
      },
    });
    const store = new MemoryCredentialStore();
    const rejected = vi.fn(() => jsonResponse({ errors: [] }, 401));
    await expect(configureTeamtailorCredential(db, {
      connectorId: id,
      apiKey: "invalid-key",
      region: "eu",
    }, { store, client: rejected })).rejects.toMatchObject({ code: "AUTH_EXPIRED" });
    expect(await store.get("teamtailor", id)).toBeNull();

    await store.set("teamtailor", id, credential);
    await expect(testTeamtailorCredential(db, id, {
      store,
      client: rejected,
    })).rejects.toMatchObject({ code: "AUTH_EXPIRED" });
    await expect(db.companyConnector.findUniqueOrThrow({ where: { id } }))
      .resolves.toMatchObject({
        enabled: false,
        credentialStatus: "Expired",
      });
  });

  it("validates credentials before robots and persists typed robots denial", async () => {
    const db = database();
    const id = randomUUID();
    const connector = await db.companyConnector.create({
      data: {
        id,
        company: `Teamtailor Robots ${id}`,
        careerUrl: "https://example.teamtailor.com",
        atsType: "teamtailor",
        connectorKey: `example-${id}`,
        enabled: true,
        credentialStatus: "Valid",
        credentialRegion: "eu",
      },
    });
    const store = await authorizedStore(id);
    const client = vi.fn((input) =>
      String(input).endsWith("/robots.txt")
        ? Promise.resolve(new Response("User-agent: *\nDisallow: /v1/jobs"))
        : jsonResponse(teamtailorPage([teamtailorJob])));
    const registry = new JobSourceRegistry().register(
      new TeamtailorProvider(client, store),
    );
    await expect(new ProviderDiscoveryRunner(
      db,
      "teamtailor",
      client,
      registry,
      { connectorIds: [connector.id] },
    ).run()).resolves.toMatchObject({ failures: 1 });
    expect(client.mock.calls.map(([input]) => String(input))).toEqual([
      "https://api.teamtailor.com/v1/jobs?page[size]=1",
      "https://api.teamtailor.com/robots.txt",
    ]);
    await expect(db.connectorCrawl.findFirstOrThrow({
      where: { connectorId: connector.id },
    })).resolves.toMatchObject({
      status: "Blocked",
      errorCode: "ROBOTS_DENIED",
    });
  });

  it("prevents repeat imports and reconciles deletion only after a complete feed", async () => {
    const db = database();
    const id = randomUUID();
    const company = `Teamtailor Reconciliation ${id}`;
    const connector = await db.companyConnector.create({
      data: {
        id,
        company,
        careerUrl: "https://example.teamtailor.com",
        atsType: "teamtailor",
        connectorKey: `example-${id}`,
        enabled: true,
        credentialStatus: "Valid",
        credentialRegion: "eu",
        crawlDelay: 0,
        rateLimit: 600,
        searchCriteria: { titles: [], locations: [] },
      },
    });
    const store = await authorizedStore(id);
    let currentJobs = [teamtailorJob];
    let partial = false;
    const partialNext = "https://api.teamtailor.com/v1/jobs?page[after]=partial&page[size]=30";
    const client = vi.fn((input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) {
        return Promise.resolve(new Response("User-agent: *\nDisallow:"));
      }
      if (url.includes("page[after]=partial")) {
        return Promise.reject(new TypeError("pagination interrupted"));
      }
      if (url.includes("/v1/jobs/tt-101")) return jsonResponse(teamtailorDetail());
      return jsonResponse(teamtailorPage(currentJobs, partial ? partialNext : null));
    });
    const registry = new JobSourceRegistry().register(
      new TeamtailorProvider(client, store, {
        sleep: async () => undefined,
        random: () => 0,
      }),
    );
    const runner = () => new ProviderDiscoveryRunner(
      db,
      "teamtailor",
      client,
      registry,
      { connectorIds: [connector.id] },
    ).run();
    await expect(runner()).resolves.toMatchObject({ jobsImported: 1, duplicates: 0 });
    await expect(runner()).resolves.toMatchObject({ jobsImported: 0, duplicates: 1 });
    partial = true;
    await expect(runner()).resolves.toMatchObject({ failures: 1 });
    await expect(db.job.findFirstOrThrow({
      where: { company: { name: company }, sourceJobId: "tt-101" },
    })).resolves.toMatchObject({ closedAt: null, reconciliationReason: null });
    partial = false;
    currentJobs = [];
    await expect(runner()).resolves.toMatchObject({ failures: 0 });
    await expect(db.job.findFirstOrThrow({
      where: { company: { name: company }, sourceJobId: "tt-101" },
    })).resolves.toMatchObject({
      reconciliationReason: "absent_from_successful_complete_feed",
    });
    const crawls = await db.connectorCrawl.findMany({
      where: { connectorId: connector.id },
    });
    expect(JSON.stringify(crawls)).not.toContain("authorized-test-key");
  });

  it("normalizes included relationships without persisting provider metadata", async () => {
    const store = await authorizedStore();
    const provider = new TeamtailorProvider(vi.fn(), store);
    const normalized = provider.normalize({
      providerId: "teamtailor",
      externalId: "tt-101",
      canonicalUrl: teamtailorJob.attributes["careersite-job-url"],
      payload: { resource: teamtailorJob, included: teamtailorIncluded },
      fetchedAt: new Date(),
    }, context);
    expect(normalized).not.toHaveProperty("metadata");
    expect(normalized.providerExternalId).toBe("tt-101");
  });
});
