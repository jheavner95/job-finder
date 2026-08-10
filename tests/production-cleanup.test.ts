import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { auditLocalData, cleanupLocalData } from "../lib/data-cleanup";
import { APP_ERROR_CODES, createAppError, diagnosticText, mapError } from "../lib/errors/app-error";
import { createTestDatabase, releaseTestDatabases } from "./test-database";

const isolatedDatabase = () => createTestDatabase({ label: "cleanup" });

afterEach(releaseTestDatabases);

describe("production data cleanup", () => {
  it("supports a genuinely empty first-run data state", async () => {
    const database = await isolatedDatabase();
    await database.$transaction([
      database.notification.deleteMany(),
      database.discoveryBatch.deleteMany(),
      database.connectorCrawl.deleteMany(),
      database.companyConnector.deleteMany(),
      database.report.deleteMany(),
      database.job.deleteMany(),
      database.candidateProfile.deleteMany(),
    ]);
    const audit = await auditLocalData(database);
    expect(audit.counts).toMatchObject({
      opportunities: 0,
      applications: 0,
      portfolioProjects: 0,
      resumeImports: 0,
      resumeEvidence: 0,
      candidateEvidence: 0,
      notifications: 0,
      discoveryHistory: 0,
      connectors: 0,
      reports: 0,
    });
  });

  it("keeps dry runs read-only and removes only proven synthetic records", async () => {
    const database = await isolatedDatabase();
    const source = await database.jobSource.create({ data: { name: `Cleanup source ${randomUUID()}` } });
    const company = await database.company.create({ data: { name: `Cleanup company ${randomUUID()}` } });
    const createJob = (id: string, isSynthetic: boolean) => database.job.create({
      data: {
        fingerprint: `cleanup-${id}`,
        sourceJobId: id,
        title: isSynthetic ? "Synthetic fixture role" : "Imported real role",
        sourceUrl: `https://example.com/${id}`,
        originalSourceText: "Explicit test record",
        isSynthetic,
        companyId: company.id,
        sourceId: source.id,
      },
    });
    const fixture = await createJob(randomUUID(), true);
    const real = await createJob(randomUUID(), false);
    const before = await database.job.count();
    const dryRun = await cleanupLocalData(database, false);
    expect(dryRun.removed).toHaveLength(0);
    expect(await database.job.count()).toBe(before);
    const applied = await cleanupLocalData(database, true);
    expect(applied.removed.map((item) => item.id)).toContain(fixture.id);
    expect(await database.job.findUnique({ where: { id: fixture.id } })).toBeNull();
    expect(await database.job.findUnique({ where: { id: real.id } })).not.toBeNull();
  });

  it("isolates development fixtures from runtime and keeps seeding empty", () => {
    const runtimeFiles = [
      "app/page.tsx",
      "lib/queries.ts",
      "lib/candidate-intelligence/profile-sync.ts",
      "prisma/seed.ts",
    ].map((file) => readFileSync(file, "utf8")).join("\n");
    expect(runtimeFiles).not.toContain("dev/fixtures");
    expect(readFileSync("prisma/seed.ts", "utf8")).not.toContain("SYNTHETIC_JOBS");
    expect(readFileSync("lib/candidate-intelligence/profile-sync.ts", "utf8")).not.toContain("context\", \"example");
  });
});

describe("safe application errors", () => {
  it("maps representative infrastructure failures to stable, descriptive messages", () => {
    expect(mapError(new Error("PrismaClientKnownRequestError P2002")).code).toBe("DUPLICATE_RECORD");
    expect(mapError(new Error("robots.txt disallow")).code).toBe("ROBOTS_DISALLOWED");
    expect(mapError(new Error("fetch failed")).code).toBe("NETWORK_ERROR");
    expect(mapError(new Error("429 rate limited")).code).toBe("RATE_LIMITED");
    expect(mapError(new Error("scheduler lock already running")).code).toBe("SCHEDULER_BUSY");
    expect(APP_ERROR_CODES).toContain("DATABASE_ERROR");
  });

  it("never includes raw errors or local paths in copyable diagnostics", () => {
    const error = createAppError("PDF_PARSE_ERROR", { route: "/getting-started", fileType: "pdf" });
    const details = diagnosticText(error);
    expect(details).toContain("PDF_PARSE_ERROR");
    expect(details).not.toContain("/Users/");
    expect(details).not.toContain("pdfjs-dist");
    expect(error.message).toBe("The file was uploaded, but its text could not be extracted.");
  });

  it("provides independent route boundaries for major workspaces", () => {
    for (const route of [
      "evidence", "getting-started", "review", "sources",
      // System owns one boundary plus the workspaces it absorbed.
      "system", "system/activity", "system/import", "system/schedules", "system/sources",
    ]) {
      expect(readFileSync(`app/${route}/error.tsx`, "utf8")).toContain("../error");
    }
    expect(readFileSync("app/global-error.tsx", "utf8")).toContain("ErrorNotice");
  });
});
