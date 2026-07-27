import { copyFileSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";

import { getScanSnapshot } from "../lib/scan-presentation";

const databases: Array<{ client: PrismaClient; path: string }> = [];

function testDatabase() {
  const path = `/tmp/job-search-intelligence-scan-${randomUUID()}.db`;
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

async function connector(database: PrismaClient, label: string) {
  const suffix = randomUUID();
  return database.companyConnector.create({
    data: {
      company: `${label} ${suffix}`,
      careerUrl: `https://boards.greenhouse.io/${suffix}`,
      atsType: "greenhouse",
      connectorKey: suffix,
      enabled: true,
      health: "Warning",
    },
  });
}

describe("decision-oriented scan presentation", () => {
  it("represents an idle or never-scanned selection as no snapshot", async () => {
    const database = testDatabase();
    await expect(getScanSnapshot(database, "missing-batch")).resolves.toBeNull();
  });

  it("shows real waiting, running, and completed provider units", async () => {
    const database = testDatabase();
    const [complete, active, waiting] = await Promise.all([
      connector(database, "Complete"),
      connector(database, "Active"),
      connector(database, "Waiting"),
    ]);
    const batch = await database.discoveryBatch.create({
      data: {
        trigger: "manual",
        status: "Running",
        metadata: {
          plannedConnectors: 3,
          selectedConnectorIds: [complete.id, active.id, waiting.id],
        },
      },
    });
    await database.connectorCrawl.createMany({
      data: [
        {
          connectorId: complete.id,
          batchId: batch.id,
          status: "Completed",
          completedAt: new Date(),
          jobsDiscovered: 12,
          jobsImported: 1,
          duplicates: 2,
        },
        {
          connectorId: active.id,
          batchId: batch.id,
          status: "Running",
        },
      ],
    });
    const snapshot = await getScanSnapshot(database, batch.id);
    expect(snapshot).toMatchObject({
      status: "Running",
      completed: 1,
      total: 3,
      discovered: 12,
      matches: 3,
    });
    expect(snapshot?.providers.map((provider) => provider.state))
      .toEqual(["Running", "Healthy", "Waiting"]);
  });

  it.each([
    ["Completed", "Healthy"],
    ["CompletedWithErrors", "Warning"],
    ["Cancelled", "Healthy"],
    ["Failed", "Error"],
  ])("presents %s batches with provider state %s", async (status, providerState) => {
    const database = testDatabase();
    const source = await connector(database, status);
    const batch = await database.discoveryBatch.create({
      data: {
        trigger: "manual",
        status,
        completedAt: new Date(),
        durationMs: 4_100,
        connectorsRun: 1,
        metadata: {
          plannedConnectors: 1,
          selectedConnectorIds: [source.id],
          ...(status === "Failed" ? { fatalError: "Scan orchestration failed." } : {}),
        },
      },
    });
    await database.connectorCrawl.create({
      data: {
        connectorId: source.id,
        batchId: batch.id,
        status: status === "Failed" ? "Failed" : "Completed",
        completedAt: new Date(),
        jobsDiscovered: 29,
        duplicates: 4,
        failures: status === "CompletedWithErrors" || status === "Failed" ? 1 : 0,
        lastError: status === "CompletedWithErrors" || status === "Failed"
          ? "Source access warning."
          : null,
      },
    });
    const snapshot = await getScanSnapshot(database, batch.id);
    expect(snapshot).toMatchObject({
      status,
      discovered: 29,
      matches: 4,
      imported: 0,
      duplicates: 4,
      durationMs: 4_100,
    });
    expect(snapshot?.providers[0].state).toBe(providerState);
  });

  it("highlights opportunities first seen during a completed scan", async () => {
    const database = testDatabase();
    const source = await connector(database, "New opportunity");
    const startedAt = new Date();
    const completedAt = new Date(startedAt.getTime() + 4_100);
    const job = await database.job.findFirstOrThrow({
      where: { isSynthetic: false },
    });
    await database.job.update({
      where: { id: job.id },
      data: { firstSeenAt: new Date(startedAt.getTime() + 1_000) },
    });
    const batch = await database.discoveryBatch.create({
      data: {
        trigger: "manual",
        status: "Completed",
        startedAt,
        completedAt,
        durationMs: 4_100,
        connectorsRun: 1,
        metadata: {
          plannedConnectors: 1,
          selectedConnectorIds: [source.id],
        },
      },
    });
    await database.connectorCrawl.create({
      data: {
        connectorId: source.id,
        batchId: batch.id,
        status: "Completed",
        startedAt,
        completedAt,
        jobsDiscovered: 1,
        jobsImported: 1,
      },
    });
    const snapshot = await getScanSnapshot(database, batch.id);
    expect(snapshot?.newOpportunities).toEqual([
      expect.objectContaining({ id: job.id, title: job.title }),
    ]);
  });
});
