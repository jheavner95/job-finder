import { copyFileSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkableProvider } from "../lib/job-sources/providers/workable";
import { GreenhouseProvider } from "../lib/job-sources/providers/greenhouse";
import { WorkdayProvider } from "../lib/job-sources/providers/workday";
import { JobSourceRegistry } from "../lib/job-sources/registry";
import { ProviderDiscoveryRunner } from "../lib/job-sources/services/provider-discovery";
import { DiscoveryScheduler } from "../lib/scheduling/discovery-scheduler";

const databases: Array<{ client: PrismaClient; path: string }> = [];

function testDatabase() {
  const path = `/tmp/job-search-intelligence-${randomUUID()}.db`;
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

describe("provider discovery persistence", () => {
  it("runs multiple enabled Greenhouse boards in one discovery batch", async () => {
    const database = testDatabase();
    const suffix = randomUUID();
    const connectors = await Promise.all(["alpha", "beta"].map((token) =>
      database.companyConnector.create({
        data: {
          company: `Greenhouse ${token} ${suffix}`,
          careerUrl: `https://boards.greenhouse.io/${token}`,
          atsType: "greenhouse",
          connectorKey: `${token}-${suffix}`,
          enabled: true,
          health: "Warning",
          crawlDelay: 0,
          searchCriteria: { titles: ["Product Designer"], locations: ["Remote"] },
        },
      })));
    const client = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nDisallow:", { status: 200 });
      }
      const token = url.includes("alpha-") ? "alpha" : "beta";
      const job = {
        id: `${token}-${suffix}`,
        title: "Senior Product Designer",
        absolute_url: `https://boards.greenhouse.io/${token}/jobs/${token}-${suffix}`,
        location: { name: "Remote — United States" },
        content: "<p>Lead product strategy and design systems.</p>",
        metadata: [],
      };
      return new Response(JSON.stringify(url.includes(`/jobs/${token}-`) ? job : { jobs: [job] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const registry = new JobSourceRegistry().register(new GreenhouseProvider(client));
    const result = await new ProviderDiscoveryRunner(
      database,
      "greenhouse",
      client,
      registry,
      { connectorIds: connectors.map((connector) => connector.id) },
    ).run();
    expect(result).toMatchObject({
      companiesProcessed: 2,
      jobsDiscovered: 2,
      jobsImported: 2,
      failures: 0,
    });
    expect(await database.connectorCrawl.count({
      where: { connectorId: { in: connectors.map((connector) => connector.id) } },
    })).toBe(2);
  });

  it("cancels after the current connector and preserves completed imports", async () => {
    const database = testDatabase();
    const suffix = randomUUID();
    const connectors = await Promise.all(["cancel-alpha", "cancel-beta"].map((token) =>
      database.companyConnector.create({
        data: {
          company: `${token} ${suffix}`,
          careerUrl: `https://boards.greenhouse.io/${token}`,
          atsType: "greenhouse",
          connectorKey: `${token}-${suffix}`,
          enabled: true,
          health: "Warning",
          crawlDelay: 0,
          searchCriteria: { titles: ["Product Designer"], locations: ["Remote"] },
        },
      })));
    const client = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nDisallow:", { status: 200 });
      }
      const token = url.includes("cancel-alpha-") ? "cancel-alpha" : "cancel-beta";
      const job = {
        id: `${token}-${suffix}`,
        title: "Product Designer",
        absolute_url: `https://boards.greenhouse.io/${token}/jobs/${token}-${suffix}`,
        location: { name: "Remote" },
        content: "<p>Product design strategy and design systems.</p>",
        metadata: [],
      };
      if (url.includes(`/jobs/${token}-`) && token === "cancel-alpha") {
        await database.discoveryBatch.updateMany({
          where: { status: "Running" },
          data: { cancelRequested: true },
        });
      }
      return new Response(JSON.stringify(url.includes(`/jobs/${token}-`) ? job : { jobs: [job] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const registry = new JobSourceRegistry().register(new GreenhouseProvider(client));
    const result = await new DiscoveryScheduler(database, client, registry).run({
      trigger: "manual",
      connectorIds: connectors.map((connector) => connector.id),
    });
    expect(result).toMatchObject({
      status: "Cancelled",
      companiesProcessed: 1,
      jobsImported: 1,
    });
    expect(await database.job.count({
      where: { company: { name: connectors[0].company } },
    })).toBe(1);
    expect(await database.connectorCrawl.count({
      where: { connectorId: connectors[1].id },
    })).toBe(0);
    await expect(database.schedulerLock.findUniqueOrThrow({
      where: { id: "discovery-scheduler" },
    })).resolves.toMatchObject({ lockToken: null });
  });

  it("imports Workable once, prevents a repeat duplicate, and records crawl activity", async () => {
    const database = testDatabase();
    const company = `Workable Verification ${randomUUID()}`;
    const connector = await database.companyConnector.create({
      data: {
        company,
        careerUrl: "https://apply.workable.com/example/",
        atsType: "workable",
        connectorKey: "example",
        enabled: true,
        health: "Warning",
        crawlDelay: 0,
        searchCriteria: {
          titles: ["Senior Product Designer"],
          locations: ["Remote"],
        },
      },
    });
    const job = {
      title: "Senior Product Designer",
      shortcode: "WORKABLE-VERIFY",
      employment_type: "Full-time",
      workplace_type: "remote",
      telecommuting: true,
      city: "Kansas City",
      state: "Missouri",
      country: "United States",
      url: "https://apply.workable.com/j/WORKABLE-VERIFY",
      application_url: "https://apply.workable.com/j/WORKABLE-VERIFY/apply",
      description:
        "<p>Lead product design strategy for a complex platform.</p><p>8 years of product design experience, prototypes, design systems, and Figma.</p>",
    };
    const client = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nDisallow:", { status: 200 });
      }
      return new Response(JSON.stringify({ jobs: [job] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const registry = new JobSourceRegistry()
      .register(new WorkableProvider(client));
    const runner = new ProviderDiscoveryRunner(
      database,
      "workable",
      client,
      registry,
    );

    await expect(runner.run()).resolves.toMatchObject({
      companiesProcessed: 1,
      jobsDiscovered: 1,
      jobsImported: 1,
      duplicates: 0,
      failures: 0,
    });
    await expect(runner.run()).resolves.toMatchObject({
      companiesProcessed: 1,
      jobsDiscovered: 1,
      jobsImported: 0,
      duplicates: 1,
      failures: 0,
    });

    const stored = await database.job.findFirstOrThrow({
      where: { company: { name: company } },
      include: {
        company: true,
        source: true,
        evaluations: true,
        activity: true,
      },
    });
    expect(stored).toMatchObject({
      title: job.title,
      sourceUrl: job.url,
      isSynthetic: false,
      company: { name: company },
      source: { name: "Workable" },
    });
    expect(stored.evaluations).toHaveLength(2);
    expect(stored.activity.map((event) => event.type)).toEqual(
      expect.arrayContaining(["job_imported", "duplicate_import"]),
    );

    const crawls = await database.connectorCrawl.findMany({
      where: { connectorId: connector.id },
      orderBy: { startedAt: "asc" },
    });
    expect(crawls).toHaveLength(2);
    expect(crawls.map((crawl) => ({
      status: crawl.status,
      imported: crawl.jobsImported,
      duplicates: crawl.duplicates,
    }))).toEqual([
      { status: "Completed", imported: 1, duplicates: 0 },
      { status: "Completed", imported: 0, duplicates: 1 },
    ]);
    await expect(database.companyConnector.findUniqueOrThrow({
      where: { id: connector.id },
    })).resolves.toMatchObject({
      health: "Healthy",
      robotsPolicy: "allow",
      notes: null,
    });
  });

  it("runs manual then scheduled multi-provider discovery with isolation and repeat deduplication", async () => {
    const database = testDatabase();
    const suffix = randomUUID();
    const due = new Date(Date.now() - 60_000);
    const workable = await database.companyConnector.create({
      data: {
        company: `Scheduled Workable ${suffix}`,
        careerUrl: "https://apply.workable.com/example/",
        atsType: "workable",
        connectorKey: "example",
        enabled: true,
        health: "Warning",
        crawlDelay: 0,
        searchCriteria: { titles: ["Senior Product Designer"], locations: ["Remote"] },
        schedule: {
          create: {
            scheduleType: "Daily",
            timeOfDay: "08:00",
            nextRunAt: due,
          },
        },
      },
    });
    const greenhouse = await database.companyConnector.create({
      data: {
        company: `Scheduled Greenhouse ${suffix}`,
        careerUrl: "https://boards.greenhouse.io/example",
        atsType: "greenhouse",
        connectorKey: "example",
        enabled: true,
        health: "Warning",
        crawlDelay: 0,
        searchCriteria: { titles: ["Lead Product Designer"], locations: ["Remote"] },
        schedule: {
          create: {
            scheduleType: "Weekdays",
            timeOfDay: "08:00",
            nextRunAt: due,
          },
        },
      },
    });
    const workday = await database.companyConnector.create({
      data: {
        company: `Scheduled Workday ${suffix}`,
        careerUrl: "https://example.wd1.myworkdayjobs.com/External",
        atsType: "workday",
        connectorKey: "example",
        enabled: true,
        health: "Warning",
        searchCriteria: { titles: [], locations: [] },
        schedule: {
          create: {
            scheduleType: "Interval",
            intervalMinutes: 60,
            nextRunAt: due,
          },
        },
      },
    });
    await database.companyConnector.create({
      data: {
        company: `Disabled Scheduled ${suffix}`,
        careerUrl: "https://apply.workable.com/disabled/",
        atsType: "workable",
        connectorKey: "disabled",
        enabled: false,
        health: "Disabled",
        schedule: {
          create: {
            scheduleType: "Daily",
            timeOfDay: "08:00",
            nextRunAt: due,
          },
        },
      },
    });

    const workableJob = {
      title: "Senior Product Designer",
      shortcode: `WORKABLE-${suffix}`,
      employment_type: "Full-time",
      workplace_type: "remote",
      telecommuting: true,
      city: "Kansas City",
      state: "Missouri",
      country: "United States",
      url: `https://apply.workable.com/j/WORKABLE-${suffix}`,
      description: "<p>Lead product strategy with 8 years of design systems and Figma experience.</p>",
    };
    const greenhouseJob = {
      id: `GREENHOUSE-${suffix}`,
      title: "Lead Product Designer",
      absolute_url: `https://boards.greenhouse.io/example/jobs/GREENHOUSE-${suffix}`,
      location: { name: "Remote — United States" },
      content: "<p>Own product strategy with 8 years of prototyping and design systems.</p>",
      metadata: [],
    };
    const client = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nDisallow:", { status: 200 });
      }
      if (url.includes("workable.com/api/accounts/")) {
        return new Response(JSON.stringify({ jobs: [workableJob] }), { status: 200 });
      }
      if (url.includes("/v1/boards/example/jobs/")) {
        return new Response(JSON.stringify(greenhouseJob), { status: 200 });
      }
      if (url.includes("/v1/boards/example/jobs")) {
        return new Response(JSON.stringify({ jobs: [greenhouseJob] }), { status: 200 });
      }
      throw new Error(`Unexpected verification URL: ${url}`);
    });
    const registry = new JobSourceRegistry()
      .register(new WorkableProvider(client))
      .register(new GreenhouseProvider(client))
      .register(new WorkdayProvider(client));
    const scheduler = new DiscoveryScheduler(database, client, registry);
    const completionNotificationsBefore = await database.notification.count({
      where: { type: "discovery_complete" },
    });

    await expect(scheduler.run({
      trigger: "manual",
      connectorIds: [workable.id],
    })).resolves.toMatchObject({
      status: "Completed",
      companiesProcessed: 1,
      jobsImported: 1,
      duplicates: 0,
      failures: 0,
    });
    await expect(scheduler.run({ trigger: "scheduled" })).resolves.toMatchObject({
      status: "CompletedWithErrors",
      companiesProcessed: 3,
      jobsImported: 1,
      duplicates: 1,
      failures: 1,
    });

    await database.connectorSchedule.updateMany({
      where: { connectorId: { in: [workable.id, greenhouse.id, workday.id] } },
      data: { nextRunAt: due },
    });
    await expect(scheduler.run({ trigger: "scheduled" })).resolves.toMatchObject({
      status: "CompletedWithErrors",
      companiesProcessed: 3,
      jobsImported: 0,
      duplicates: 2,
      failures: 1,
    });

    expect(await database.job.count({
      where: {
        company: {
          name: { in: [workable.company, greenhouse.company] },
        },
      },
    })).toBe(2);
    expect(await database.job.count({
      where: {
        company: {
          name: { in: [workable.company, greenhouse.company] },
        },
        status: "NEW",
      },
    })).toBe(2);

    const batches = await database.discoveryBatch.findMany({
      where: { id: { not: "" } },
      include: { crawlRuns: { include: { connector: true } } },
      orderBy: { startedAt: "asc" },
    });
    const verificationBatches = batches.filter((batch) =>
      batch.crawlRuns.some((crawl) =>
        [workable.id, greenhouse.id, workday.id].includes(crawl.connectorId)));
    expect(verificationBatches).toHaveLength(3);
    expect(verificationBatches.map((batch) => batch.trigger))
      .toEqual(["manual", "scheduled", "scheduled"]);
    expect(verificationBatches[1].crawlRuns.map((crawl) => crawl.connector.atsType).sort())
      .toEqual(["greenhouse", "workable", "workday"]);
    expect(verificationBatches[1].crawlRuns.find(
      (crawl) => crawl.connectorId === workday.id,
    )).toMatchObject({ status: "Blocked", failures: 1 });
    expect(verificationBatches[1].crawlRuns.find(
      (crawl) => crawl.connectorId === greenhouse.id,
    )).toMatchObject({ status: "Completed", jobsImported: 1 });

    const workdayHealth = await database.companyConnector.findUniqueOrThrow({
      where: { id: workday.id },
    });
    expect(workdayHealth.health).toBe("Warning");
    const failureNotifications = await database.notification.findMany({
      where: { type: "connector_failure" },
    });
    expect(failureNotifications.filter((notification) =>
      notification.metadata
      && typeof notification.metadata === "object"
      && !Array.isArray(notification.metadata)
      && notification.metadata.company === workday.company,
    )).toHaveLength(2);
    expect(await database.notification.count({
      where: { type: "discovery_complete" },
    })).toBe(completionNotificationsBefore + 3);
  });

  it("prevents concurrent scheduler execution with a persisted lease", async () => {
    const database = testDatabase();
    await database.schedulerLock.upsert({
      where: { id: "discovery-scheduler" },
      create: {
        id: "discovery-scheduler",
        lockToken: "active-run",
        lockedAt: new Date(),
      },
      update: { lockToken: "active-run", lockedAt: new Date() },
    });
    const result = await new DiscoveryScheduler(database).run({
      trigger: "scheduled",
    });
    expect(result).toMatchObject({
      status: "SkippedConcurrent",
      companiesProcessed: 0,
    });
    await expect(database.discoveryBatch.findUniqueOrThrow({
      where: { id: result.batchId },
    })).resolves.toMatchObject({
      status: "SkippedConcurrent",
      durationMs: 0,
    });
  });

  it("stops Workday with a persisted Warning and exact public-access reason", async () => {
    const database = testDatabase();
    const connector = await database.companyConnector.create({
      data: {
        company: `Workday Verification ${randomUUID()}`,
        careerUrl: "https://example.wd1.myworkdayjobs.com/External",
        atsType: "workday",
        connectorKey: "example",
        enabled: true,
        health: "Warning",
      },
    });
    const client = vi.fn<typeof fetch>();

    await expect(new ProviderDiscoveryRunner(
      database,
      "workday",
      client,
    ).run()).resolves.toMatchObject({
      companiesProcessed: 1,
      jobsDiscovered: 0,
      jobsImported: 0,
      duplicates: 0,
      failures: 1,
    });
    expect(client).not.toHaveBeenCalled();

    const updated = await database.companyConnector.findUniqueOrThrow({
      where: { id: connector.id },
      include: { crawlRuns: true },
    });
    expect(updated.health).toBe("Warning");
    expect(updated.notes).toContain(
      "does not document a supported unauthenticated public jobs API",
    );
    expect(updated.notes).toContain("No bypass attempted.");
    expect(updated.crawlRuns).toHaveLength(1);
    expect(updated.crawlRuns[0]).toMatchObject({
      status: "Blocked",
      jobsDiscovered: 0,
      jobsImported: 0,
      duplicates: 0,
      failures: 1,
      lastError: updated.notes,
    });
  });
});
