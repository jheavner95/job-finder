/**
 * Assess every persisted job's eligibility.
 *
 * Writes only to `JobEligibilityAssessment`. Reads jobs, the candidate
 * declaration and nothing else — no scans, no employer resolution, no scoring,
 * no change to any evaluation, connector, crawl or batch row.
 *
 *   npx tsx scripts/backfill-eligibility.ts
 */
import { PrismaClient } from "@prisma/client";

import { describeFacts } from "../lib/eligibility";
import { loadCandidateFacts, reassessAllJobs } from "../lib/eligibility/service";

const prisma = new PrismaClient();

async function main() {
  const facts = await loadCandidateFacts(prisma);
  console.log(`Candidate declaration: ${describeFacts(facts)}\n`);

  const before = await prisma.jobEligibilityAssessment.count();
  const counts = await reassessAllJobs(prisma);
  const after = await prisma.jobEligibilityAssessment.count();

  console.log(`assessed .................. ${counts.total}`);
  console.log(`  no constraint found ..... ${counts.NO_CONSTRAINT_FOUND}`);
  console.log(`  eligible ................ ${counts.ELIGIBLE}`);
  console.log(`  review required ......... ${counts.REVIEW_REQUIRED}`);
  console.log(`  ineligible .............. ${counts.INELIGIBLE}`);
  console.log(`\nassessment rows ${before} -> ${after}`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
