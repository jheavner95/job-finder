/**
* Register curated seed employers and persist their reviewed official domains.
 *
 * Registration and backfill only. Resolves nothing, scans nothing, and is
 * designed to be run repeatedly: a second run must be a no-op.
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "node:fs";

import seeds from "../data/employer-seeds/ai-product-experience.json";
import {
  SEED_SOURCE,
  registerSeedEmployers,
  type SeedEmployerEntry,
} from "../lib/job-sources/services/employer-discovery";

const prisma = new PrismaClient();

async function main() {
  const label = process.argv[2] ?? "run";
  const artifact = (seeds as { employers: SeedEmployerEntry[] }).employers;

  const before = await prisma.employerCandidate.count();
  const summary = await registerSeedEmployers(prisma, artifact);
  const after = await prisma.employerCandidate.count();

  const seedRows = await prisma.employerCandidate.findMany({
    where: { source: SEED_SOURCE },
    select: { name: true, status: true, officialDomain: true, resolvedProvider: true, resolvedKey: true },
    orderBy: { name: "asc" },
  });

  console.log(`--- ${label} ---`);
  console.log(`considered ............. ${summary.considered}`);
  console.log(`created ................ ${summary.created}`);
  console.log(`promoted ............... ${summary.promoted}`);
  console.log(`already seeded ......... ${summary.alreadySeeded}`);
  console.log(`skipped (resolved) ..... ${summary.skippedResolved}`);
  console.log(`domains written ........ ${summary.domainsWritten}`);
  console.log(`domains already correct  ${summary.domainsAlreadyCorrect}`);
  console.log(`domain conflicts ....... ${summary.domainConflicts.length}`);
  for (const conflict of summary.domainConflicts) {
    console.log(`   CONFLICT ${conflict.name}: persisted=${conflict.persisted} artifact=${conflict.artifact}`);
  }
  for (const skip of summary.skipped) console.log(`   skipped ${skip.name}: ${skip.reason}`);
  console.log(`candidate rows ${before} -> ${after}`);
  console.log(`seed candidates with a domain: ${seedRows.filter((r) => r.officialDomain).length}/${seedRows.length}`);

  fs.writeFileSync(`${process.env.S}/de3h-${label}.json`, JSON.stringify({ summary, seedRows }, null, 1));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
