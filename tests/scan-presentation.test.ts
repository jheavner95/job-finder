import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";

import { getScanSnapshot } from "../lib/scan-presentation";
import { createTestDatabase, releaseTestDatabases } from "./test-database";

const testDatabase = () => createTestDatabase({ label: "scan" });

afterEach(releaseTestDatabases);

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

async function opportunity(database: PrismaClient, firstSeenAt: Date) {
  const suffix = randomUUID();
  return database.job.create({
    data: {
      fingerprint: `scan-${suffix}`,
      sourceJobId: suffix,
      title: `Staff Product Designer ${suffix}`,
      sourceUrl: `https://boards.greenhouse.io/jobs/${suffix}`,
      originalSourceText: "Lead product strategy and design systems.",
      isSynthetic: false,
      firstSeenAt,
      company: { create: { name: `Scan company ${suffix}` } },
      source: { create: { name: `Scan source ${suffix}` } },
    },
  });
}

describe("decision-oriented scan presentation", () => {
  it("represents an idle or never-scanned selection as no snapshot", async () => {
    const database = await testDatabase();
    await expect(getScanSnapshot(database, "missing-batch")).resolves.toBeNull();
  });

  it("shows real queued, running, and completed provider units", async () => {
    const database = await testDatabase();
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
      .toEqual(["Running", "Healthy", "Queued"]);
  });

  it("reconciles persisted terminal dispositions in the scan snapshot", async () => {
    const database = await testDatabase();
    const source = await connector(database, "Accounting");
    const batch = await database.discoveryBatch.create({
      data: {
        trigger: "manual",
        status: "CompletedWithErrors",
        completedAt: new Date(),
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
        status: "CompletedWithErrors",
        completedAt: new Date(),
        jobsDiscovered: 6,
        jobsImported: 1,
        duplicates: 1,
        failures: 3,
        metadata: {
          dispositions: [
            { externalId: "1", title: "Imported", canonicalUrl: "https://example.com/1", disposition: "IMPORTED" },
            { externalId: "2", title: "Duplicate", canonicalUrl: "https://example.com/2", disposition: "DUPLICATE" },
            { externalId: "3", title: "Excluded", canonicalUrl: "https://example.com/3", disposition: "EXCLUDED" },
            { externalId: "4", title: "Invalid", canonicalUrl: "https://example.com/4", disposition: "INVALID" },
            { externalId: "5", title: "Normalize", canonicalUrl: "https://example.com/5", disposition: "NORMALIZATION_FAILED" },
            { externalId: "6", title: "Persist", canonicalUrl: "https://example.com/6", disposition: "PERSISTENCE_FAILED" },
          ],
        },
      },
    });
    await expect(getScanSnapshot(database, batch.id)).resolves.toMatchObject({
      discovered: 6,
      imported: 1,
      duplicates: 1,
      excluded: 1,
      invalid: 1,
      normalizationFailed: 1,
      persistenceFailed: 1,
      providers: [{
        excluded: 1,
        invalid: 1,
        normalizationFailed: 1,
        persistenceFailed: 1,
        reconciled: true,
      }],
    });
  });

  it.each([
    ["Completed", "Healthy"],
    ["CompletedWithErrors", "Warning"],
    ["Cancelled", "Healthy"],
    ["Failed", "Error"],
  ])("presents %s batches with provider state %s", async (status, providerState) => {
    const database = await testDatabase();
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
    const database = await testDatabase();
    const source = await connector(database, "New opportunity");
    const startedAt = new Date();
    const completedAt = new Date(startedAt.getTime() + 4_100);
    const job = await opportunity(database, new Date(startedAt.getTime() + 1_000));
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
