import { copyFileSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  reconcileCompleteFeed,
  reconcileExplicitDeletion,
} from "../lib/job-sources/services/feed-reconciliation";

const databases: Array<{ client: PrismaClient; path: string }> = [];

function database() {
  const path = `/tmp/job-search-intelligence-reconciliation-${randomUUID()}.db`;
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

async function seed(db: PrismaClient) {
  const suffix = randomUUID();
  const source = await db.jobSource.create({ data: { name: `Source ${suffix}` } });
  const company = await db.company.create({ data: { name: `Company ${suffix}` } });
  await Promise.all(["open", "missing"].map((sourceJobId) => db.job.create({
    data: {
      sourceJobId,
      fingerprint: `${sourceJobId}-${suffix}`,
      title: `${sourceJobId} role`,
      sourceUrl: `https://example.test/${sourceJobId}`,
      originalSourceText: "Description",
      sourceId: source.id,
      companyId: company.id,
    },
  })));
  return { source, company };
}

describe("complete-feed reconciliation", () => {
  it("updates observed jobs and closes only IDs absent from a successful complete feed", async () => {
    const db = database();
    const { source, company } = await seed(db);
    const observedAt = new Date("2026-07-27T12:00:00Z");
    await expect(reconcileCompleteFeed(db, {
      sourceName: source.name,
      companyName: company.name,
      sourceJobIds: ["open"],
      observedAt,
    })).resolves.toEqual({ closed: 1, observed: 1 });
    await expect(db.job.findFirstOrThrow({
      where: { sourceJobId: "open", companyId: company.id },
    })).resolves.toMatchObject({
      lastSeenAt: observedAt,
      closedAt: null,
      reconciliationReason: null,
    });
    await expect(db.job.findFirstOrThrow({
      where: { sourceJobId: "missing", companyId: company.id },
    })).resolves.toMatchObject({
      closedAt: observedAt,
      reconciliationReason: "absent_from_successful_complete_feed",
    });
  });

  it("records explicit provider deletion separately and auditably", async () => {
    const db = database();
    const { source, company } = await seed(db);
    const observedAt = new Date("2026-07-27T13:00:00Z");
    await expect(reconcileExplicitDeletion(db, {
      sourceName: source.name,
      companyName: company.name,
      sourceJobId: "open",
      observedAt,
    })).resolves.toBe(true);
    const job = await db.job.findFirstOrThrow({
      where: { sourceJobId: "open", companyId: company.id },
      include: { activity: true },
    });
    expect(job).toMatchObject({
      closedAt: observedAt,
      reconciliationReason: "explicit_provider_deletion",
    });
    expect(job.activity).toEqual([
      expect.objectContaining({ type: "provider_reconciliation" }),
    ]);
  });
});
