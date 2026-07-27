import { copyFileSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DiscoveryService } from "../lib/job-sources/services/discovery-service";
import {
  parsePersonioFeed,
  PersonioProvider,
  personioLocale,
} from "../lib/job-sources/providers/personio";
import { JobSourceRegistry } from "../lib/job-sources/registry";
import { evaluateRobots } from "../lib/job-sources/robots";
import type { ProviderContext } from "../lib/job-sources/types";
import {
  personioDuplicateIds,
  personioEmptyFeed,
  personioMalformedFeed,
  personioMissingOptionalFields,
  personioMultipleJobs,
  personioSingleJob,
} from "./fixtures/personio";

const databases: Array<{ client: PrismaClient; path: string }> = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async ({ client, path }) => {
    await client.$disconnect();
    unlinkSync(path);
  }));
});

const context: ProviderContext = {
  company: "Example Products",
  careerUrl: "https://example.jobs.personio.de/?language=en",
  connectorKey: "example",
  enabled: true,
  robotsPolicy: "allow",
};

function xmlResponse(xml: string, status = 200) {
  return Promise.resolve(new Response(xml, {
    status,
    headers: { "Content-Type": "application/xml" },
  }));
}

describe("Personio public connector", () => {
  it("parses a single job and preserves documented metadata", () => {
    const [position] = parsePersonioFeed(personioSingleJob);
    expect(position).toMatchObject({
      id: "4103",
      subcompany: "Example Products GmbH",
      office: "Chicago",
      department: "Product",
      employmentType: "permanent",
      schedule: "full-time",
    });
    expect(position.jobDescriptions?.jobDescription).toHaveLength(2);
  });

  it("parses multiple departments and offices without merging jobs", async () => {
    const provider = new PersonioProvider(vi.fn(() => xmlResponse(personioMultipleJobs)));
    const result = await provider.discoverDetailed(
      { titles: [], locations: [] },
      context,
    );
    expect(result.jobs.map((job) => [job.externalId, job.location])).toEqual([
      ["4103", "Chicago"],
      ["4104", "Berlin"],
    ]);
    expect(result.diagnostics.totalJobsDiscovered).toBe(2);
  });

  it("selects the configured locale deterministically and defaults to English", async () => {
    const client = vi.fn(() => xmlResponse(personioSingleJob));
    const provider = new PersonioProvider(client);
    await provider.discover(
      { titles: [], locations: [] },
      { ...context, careerUrl: "https://example.jobs.personio.de/?language=de" },
    );
    expect(String((client.mock.calls as unknown[][])[0][0])).toBe(
      "https://example.jobs.personio.de/xml?language=de",
    );
    expect(personioLocale({ ...context, careerUrl: "https://example.jobs.personio.de" }))
      .toBe("en");
    expect(() => personioLocale({
      ...context,
      careerUrl: "https://example.jobs.personio.de/?language=ja",
    })).toThrow(/unsupported/);
  });

  it("normalizes only present values and preserves identity and canonical URL", async () => {
    const client = vi.fn(() => xmlResponse(personioSingleJob));
    const provider = new PersonioProvider(client);
    const [job] = await provider.discover(
      { titles: ["Staff Product Designer"], locations: ["Chicago"] },
      context,
    );
    const normalized = provider.normalize(await provider.fetch(job, context), context);
    expect(normalized).toMatchObject({
      title: "Staff Product Designer",
      company: "Example Products",
      location: "Chicago",
      employmentType: "permanent · full-time",
      salary: "",
      providerExternalId: "4103",
      url: "https://example.jobs.personio.de/job/4103",
    });
    expect(normalized.description).toContain("Lead enterprise product design strategy.");
    expect(provider.validate(normalized)).toEqual({ valid: true, errors: [] });
  });

  it("accepts missing optional fields without inferring them", async () => {
    const provider = new PersonioProvider(
      vi.fn(() => xmlResponse(personioMissingOptionalFields)),
    );
    const [job] = await provider.discover({ titles: [], locations: [] }, context);
    const normalized = provider.normalize(await provider.fetch(job, context), context);
    expect(normalized).toMatchObject({
      salary: "",
      location: "",
      employmentType: "",
    });
    expect(normalized.description).toBe("Design a complex product.");
  });

  it("treats an empty feed as a valid board with no current jobs", async () => {
    const provider = new PersonioProvider(vi.fn(() => xmlResponse(personioEmptyFeed)));
    await expect(provider.discover({ titles: [], locations: [] }, context))
      .resolves.toEqual([]);
  });

  it("fails closed for malformed XML, duplicate IDs, missing IDs, and schema changes", () => {
    expect(() => parsePersonioFeed(personioMalformedFeed)).toThrow(/malformed/);
    expect(() => parsePersonioFeed(personioDuplicateIds)).toThrow(/duplicate position id/);
    expect(() => parsePersonioFeed(
      `<workzag-jobs><position><name>Designer</name></position></workzag-jobs>`,
    )).toThrow(/missing id/);
    expect(() => parsePersonioFeed(`<jobs><position /></jobs>`)).toThrow(/workzag-jobs root/);
  });

  it("reports a deleted job when the position disappears between discovery and fetch", async () => {
    const client = vi.fn()
      .mockImplementationOnce(() => xmlResponse(personioSingleJob))
      .mockImplementationOnce(() => xmlResponse(personioEmptyFeed));
    const provider = new PersonioProvider(client);
    const [job] = await provider.discover({ titles: [], locations: [] }, context);
    await expect(provider.fetch(job, context)).rejects.toThrow(/no longer public/);
  });

  it("fails closed when robots denies the XML path", () => {
    expect(evaluateRobots(
      "User-agent: *\nDisallow: /xml",
      "/xml?language=en",
    )).toMatchObject({ allowed: false, policy: "disallow" });
  });

  it("persists provider/company/position identity and prevents repeat imports", async () => {
    const path = `/tmp/job-search-intelligence-personio-${randomUUID()}.db`;
    copyFileSync("prisma/dev.db", path);
    const database = new PrismaClient({ datasourceUrl: `file:${path}` });
    databases.push({ client: database, path });
    const provider = new PersonioProvider(vi.fn(() => xmlResponse(personioSingleJob)));
    const registry = new JobSourceRegistry().register(provider);
    const discovery = new DiscoveryService(database, registry);
    const [job] = await provider.discover({ titles: [], locations: [] }, context);

    const first = await discovery.evaluateAndImport("personio", job, context);
    const second = await discovery.evaluateAndImport("personio", job, context);
    const persisted = await database.job.findMany({
      where: { source: { name: "Personio" }, company: { name: context.company } },
      select: { sourceJobId: true, sourceUrl: true },
    });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(persisted).toEqual([{
      sourceJobId: "4103",
      sourceUrl: "https://example.jobs.personio.de/job/4103",
    }]);
  });
});
