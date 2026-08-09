import { copyFileSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

/**
 * Tests build their fixture database by copying `prisma/dev.db` so they inherit
 * the migrated schema without paying for a migration run per test. That copy
 * also carries the developer's live operational rows, which would make tests
 * depend on whatever happens to be in the local database. Every fixture
 * database is therefore truncated down to a known-empty operational state
 * before a test sees it.
 */
const SCHEMA_SOURCE = fileURLToPath(new URL("../prisma/dev.db", import.meta.url));

/**
 * Operational tables, ordered children-before-parents so the deletes stay
 * foreign-key safe under SQLite's enforced constraints.
 */
const OPERATIONAL_TABLES = [
  "ApplicationAttentionDismissal",
  "ApplicationFollowUp",
  "ApplicationInterview",
  "ApplicationCommunication",
  "ApplicationTimelineEvent",
  "ApplicationDocument",
  "ApplicationContact",
  "ApplicationStatusHistory",
  "Application",
  "OpportunityIntelligence",
  "ActivityEvent",
  "UserDecision",
  "CandidateEvidence",
  "JobEvaluation",
  "_JobsInSearchRun",
  "SearchRun",
  "EmployerCandidate",
  "ConnectorCrawl",
  "ConnectorSchedule",
  "DiscoveryBatch",
  "CompanyConnector",
  "Job",
  "Company",
  "JobSource",
  "Notification",
  "Report",
] as const;

/**
 * The seeded candidate profile graph. Left in place by default because several
 * tests exercise behaviour that reads the primary candidate profile; opt in via
 * `resetCandidateProfile` when a test needs a profile-free starting point.
 */
const CANDIDATE_PROFILE_TABLES = [
  "CandidateCapabilityProjectLink",
  "CandidateCapabilityResumeLink",
  "CandidateProjectProgress",
  "CandidatePortfolioProject",
  "CandidateResumeEvidence",
  "CandidateIntelligenceEvidence",
  "CandidateResumeReadiness",
  "CandidateResumeImport",
  "CandidateCareerPreferences",
  "CandidateOnboarding",
  "CandidateProfile",
] as const;

export type TestDatabaseOptions = {
  /** Distinguishes temp files per suite; cosmetic only. */
  label?: string;
  /** Also clear the seeded candidate profile graph. */
  resetCandidateProfile?: boolean;
};

export type TestDatabaseHandle = { client: PrismaClient; path: string };

const openDatabases: TestDatabaseHandle[] = [];

async function truncate(client: PrismaClient, tables: readonly string[]) {
  for (const table of tables) {
    await client.$executeRawUnsafe(`DELETE FROM "${table}"`);
  }
}

/**
 * Copy the migrated schema to a unique temp path, connect to it, and truncate
 * the operational tables so the test starts from an empty operational state.
 */
export async function createTestDatabase(
  options: TestDatabaseOptions = {},
): Promise<PrismaClient> {
  const label = options.label ? `${options.label}-` : "";
  const path = join(tmpdir(), `job-finder-test-${label}${randomUUID()}.db`);
  copyFileSync(SCHEMA_SOURCE, path);
  const client = new PrismaClient({ datasourceUrl: `file:${path}` });
  openDatabases.push({ client, path });
  await truncate(client, OPERATIONAL_TABLES);
  if (options.resetCandidateProfile) {
    await truncate(client, CANDIDATE_PROFILE_TABLES);
  }
  return client;
}

/** Disconnect and delete every fixture database created since the last call. */
export async function releaseTestDatabases(): Promise<void> {
  await Promise.all(openDatabases.splice(0).map(async ({ client, path }) => {
    await client.$disconnect();
    unlinkSync(path);
  }));
}
